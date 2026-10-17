import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyPaymentConfirmed, notifyPaymentFailed } from '@/lib/notify'
import { syncKppPayment } from '@/lib/kprimepay'

const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'
const PAYDUNYA_BASE =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

/**
 * LONG-POLLING — la page de retour ouvre UNE requête avec `wait=1` :
 * le serveur surveille la base (mise à jour instantanément par l'IPN
 * /api/paydunya/callback) et interroge PayDunya en direct (au plus une
 * fois toutes les 3 s par token). Il répond DÈS que le statut est tranché
 * → le résultat s'affiche < 1 s après la confirmation du prestataire,
 * au lieu des 2 à 6 s de l'ancien polling côté client.
 * Au terme du délai (12 s), l'état courant est renvoyé et le client
 * relance aussitôt une nouvelle veille.
 * Sans `wait=1` : un seul contrôle, comme avant (compatibilité).
 */
const LONGPOLL_MS = 12000
const LONGPOLL_DB_INTERVAL_MS = 800
const MIN_REMOTE_INTERVAL_MS = 3000
const lastRemoteCheck = new Map<string, number>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Statuts définitifs : plus aucune vérification nécessaire. */
const FINAL_STATUSES = ['completed', 'failed', 'cancelled', 'expired']

type CheckResult = {
  liveStatus: string
  payment: Awaited<ReturnType<typeof loadPayment>>
  order: Awaited<ReturnType<typeof loadOrder>>
}

async function loadPayment(token: string | null, orderId: string | null) {
  return db.payment.findFirst({
    where: token ? { transactionId: token } : { orderId: orderId! },
    orderBy: { createdAt: 'desc' }, // dernière tentative (les retries créent plusieurs paiements)
    include: { order: { include: { items: true } } },
  })
}

async function loadOrder(orderId: string | null) {
  return orderId
    ? db.order.findUnique({ where: { id: orderId }, include: { items: true } })
    : null
}

/**
 * Un cycle de vérification :
 *  1. la base d'abord (écrite instantanément par l'IPN, le retry, une visite
 *     précédente…) → réponse immédiate si le statut est déjà tranché ;
 *  2. sinon confirmation en direct chez le prestataire (KPrimePay ou PayDunya),
 *     au plus une fois toutes les MIN_REMOTE_INTERVAL_MS par token.
 */
async function checkOnce(token: string | null, orderId: string | null): Promise<CheckResult> {
  const masterKey  = process.env.PAYDUNYA_MASTER_KEY!
  const privateKey = process.env.PAYDUNYA_PRIVATE_KEY!
  const apiToken   = process.env.PAYDUNYA_TOKEN!

  const payment = await loadPayment(token, orderId)

  let liveStatus = payment?.status ?? 'pending'

  // ── Raccourci instantané : le statut est déjà tranché en base
  // (webhook/IPN arrivé, retry, double visite…) → aucune requête vers le
  // prestataire, la page affiche le résultat immédiatement.
  if (payment && ['completed', 'failed', 'cancelled'].includes(payment.status)) {
    // Pas d'appel distant : la base fait foi (elle n'est écrite qu'après
    // confirmation du prestataire ou de son IPN).
  }
  // ── Paiement carte / USSD via KPrimePay : on resynchronise auprès de
  // KPrimePay (source de vérité). Idempotent — ne touche jamais un paiement
  // déjà conclus (completed/failed).
  else if (payment?.paymentMethod === 'kprimepay' && payment.transactionId) {
    try {
      const result = await syncKppPayment(payment.transactionId, 'verify-retour')
      if (result === 'completed') liveStatus = 'completed'
      else if (result === 'failed') liveStatus = 'failed'
      // pending / not_found / amount_mismatch → on garde le statut en base
    } catch (e) {
      console.warn('[verify] Erreur synchronisation KPrimePay:', e)
      // statut en base conservé
    }
  }
  // Confirmation en direct chez PayDunya : avec le token fourni, OU avec le
  // token stocké en base (cas du retour boutique où seule l'orderId revient).
  // Indépendant de l'IPN callback, qui peut arriver plus tard.
  // Clés absentes (ex. sandbox) → pas de confirmation live possible,
  // on se contente du statut en base.
  else {
    const confirmToken = (masterKey && privateKey && apiToken)
      ? (token || payment?.transactionId)
      : null
    if (confirmToken) {
      // Limitation d'appels : au plus une confirmation live toutes les 3 s
      // par token. Entre deux appels, réponse immédiate depuis la base.
      const now = Date.now()
      if (now - (lastRemoteCheck.get(confirmToken) ?? 0) >= MIN_REMOTE_INTERVAL_MS) {
        lastRemoteCheck.set(confirmToken, now)
        if (lastRemoteCheck.size > 1000) lastRemoteCheck.clear()

        try {
          const confirmRes = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/confirm/${confirmToken}`, {
            headers: {
              'PAYDUNYA-MASTER-KEY': masterKey,
              'PAYDUNYA-PRIVATE-KEY': privateKey,
              'PAYDUNYA-TOKEN': apiToken,
            },
            signal: AbortSignal.timeout(8000), // jamais bloquer le retour client > 8 s
          })
          const invoice = await confirmRes.json()

          if (invoice.status === 'completed') {
            liveStatus = 'completed'

            if (payment && payment.status !== 'completed') {
              await db.payment.update({
                where: { id: payment.id },
                data: { status: 'completed', paidAt: new Date() },
              })
              await db.order.update({
                where: { id: payment.orderId },
                data: { paymentStatus: 'paid', status: 'paid' },
              })
              // Notification admin + reçu de paiement au client — envoyés sans
              // bloquer la réponse du statut (anti-doublon interne, l'IPN
              // callback arrivera probablement aussi).
              const paidOrder = await db.order.findUnique({
                where: { id: payment.orderId },
                include: { items: true },
              })
              if (paidOrder) {
                void notifyPaymentConfirmed(paidOrder).catch((e) =>
                  console.warn('[verify] Notification paiement confirmé:', e)
                )
              }
            } else if (!payment) {
              const targetOrderId = invoice?.custom_data?.order_id ?? orderId
              if (targetOrderId) {
                await db.order.update({
                  where: { id: targetOrderId },
                  data: { paymentStatus: 'paid', status: 'paid' },
                })
              }
            }
          } else if (invoice.status === 'cancelled' || invoice.status === 'failed') {
            liveStatus = invoice.status
            if (payment && payment.status === 'pending') {
              await db.payment.update({
                where: { id: payment.id },
                data: { status: liveStatus },
              })
            }
            // Synchroniser aussi la commande pour que le tableau de bord client
            // affiche le badge et le bouton « Réessayer le paiement ».
            if (payment && payment.order && payment.order.status === 'pending') {
              await db.order.update({
                where: { id: payment.orderId },
                data: {
                  paymentStatus: liveStatus,
                  status: liveStatus === 'failed' ? 'payment_failed' : 'cancelled',
                },
              })
              // Notification admin (échec/annulation détecté au retour boutique)
              const failedOrder = await db.order.findUnique({
                where: { id: payment.orderId },
                include: { items: true },
              })
              if (failedOrder) {
                void notifyPaymentFailed(
                  failedOrder,
                  liveStatus === 'failed' ? 'failed' : 'cancelled'
                ).catch((e) => console.warn('[verify] Notification paiement échoué:', e))
              }
            }
          }
        } catch (e) {
          console.warn('[verify] Erreur confirmation PayDunya:', e)
        }
      }
    }
  }

  const order = payment?.order ?? (await loadOrder(orderId))
  return { liveStatus, payment, order }
}

/**
 * Endpoint générique de vérification par orderId/token.
 * Utilisé par les pages de retour boutique (payment-success) pour TOUTES les
 * méthodes de paiement :
 *  - paydunya  → confirmation en direct chez PayDunya (checkout-invoice/confirm)
 *  - kprimepay → resynchronisation via l'API KPrimePay (transactions/debit-status)
 * Le statut de base est retourné si la confirmation live est indisponible.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const token   = searchParams.get('token')
  const orderId = searchParams.get('orderId')
  const wait    = searchParams.get('wait') === '1'

  if (!token && !orderId) {
    return NextResponse.json({ success: false, error: 'Paramètre manquant' }, { status: 400 })
  }

  try {
    // Premier contrôle immédiat (cas le plus fréquent : statut déjà en base).
    let result = await checkOnce(token, orderId)

    if (!result.order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }

    // Long-polling : tant que le statut n'est pas tranché, on surveille la
    // base toutes les 800 ms (l'IPN la met à jour) jusqu'à 12 s max.
    const deadline = Date.now() + LONGPOLL_MS
    while (
      wait &&
      !FINAL_STATUSES.includes(result.liveStatus) &&
      Date.now() < deadline
    ) {
      await sleep(LONGPOLL_DB_INTERVAL_MS)
      result = await checkOnce(token, orderId)
    }

    return NextResponse.json({
      success: true,
      status: result.liveStatus,
      paidAt: result.payment?.paidAt ?? null,
      order: {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        total: result.order.total,
        customerName: [result.order.customerFirstName, result.order.customerLastName].filter(Boolean).join(' ') || 'Client',
        customerEmail: result.order.customerEmail,
        customerPhone: result.order.customerPhone,
        createdAt: result.order.createdAt,
        items: result.order.items.map(i => ({
          name: i.productName,
          size: i.size,
          colorName: i.colorName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          total: i.totalPrice,
        })),
      },
    })
  } catch (error) {
    console.error('[verify] Erreur:', error)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
