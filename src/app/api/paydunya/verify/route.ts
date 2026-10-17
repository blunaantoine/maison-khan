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
 * La page de retour interroge cette route toutes les 2 s : on ne sollicite
 * l'API PayDunya qu'au plus une fois toutes les 4 s par token. Entre deux
 * appels distants, on renvoie l'état de la base (mis à jour instantanément
 * par l'IPN /api/paydunya/callback) — la vérification paraît instantanée
 * dès que PayDunya nous a notifiés.
 */
const MIN_REMOTE_INTERVAL_MS = 4000
const lastRemoteCheck = new Map<string, number>()

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

  if (!token && !orderId) {
    return NextResponse.json({ success: false, error: 'Paramètre manquant' }, { status: 400 })
  }

  const masterKey  = process.env.PAYDUNYA_MASTER_KEY!
  const privateKey = process.env.PAYDUNYA_PRIVATE_KEY!
  const apiToken   = process.env.PAYDUNYA_TOKEN!

  try {

    const payment = await db.payment.findFirst({
      where: token ? { transactionId: token } : { orderId: orderId! },
      orderBy: { createdAt: 'desc' }, // dernière tentative (les retries créent plusieurs paiements)
      include: { order: { include: { items: true } } },
    })

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
        // Limitation d'appels : au plus une confirmation live toutes les 4 s
        // par token. Entre deux appels, réponse immédiate depuis la base.
        const now = Date.now()
        if (now - (lastRemoteCheck.get(confirmToken) ?? 0) < MIN_REMOTE_INTERVAL_MS) {
          // pending (ou statut en base) renvoyé sans attendre PayDunya
          const orderFast = payment?.order ?? (orderId
            ? await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
            : null)
          if (!orderFast) {
            return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
          }
          return NextResponse.json({
            success: true,
            status: liveStatus,
            paidAt: payment?.paidAt ?? null,
            order: {
              id: orderFast.id,
              orderNumber: orderFast.orderNumber,
              total: orderFast.total,
              customerName: [orderFast.customerFirstName, orderFast.customerLastName].filter(Boolean).join(' ') || 'Client',
              customerEmail: orderFast.customerEmail,
              customerPhone: orderFast.customerPhone,
              createdAt: orderFast.createdAt,
              items: orderFast.items.map(i => ({
                name: i.productName,
                size: i.size,
                colorName: i.colorName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.totalPrice,
              })),
            },
          })
        }
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
            // Notification admin + reçu de paiement au client (anti-doublon interne,
            // l'IPN callback arrivera probablement aussi)
            const paidOrder = await db.order.findUnique({
              where: { id: payment.orderId },
              include: { items: true },
            })
            if (paidOrder) await notifyPaymentConfirmed(paidOrder)
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
              await notifyPaymentFailed(failedOrder, liveStatus === 'failed' ? 'failed' : 'cancelled')
            }
          }
        }
      } catch (e) {
        console.warn('[verify] Erreur confirmation PayDunya:', e)
      }
      }
    }

    const order = payment?.order ?? (orderId
      ? await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
      : null)

    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      status: liveStatus,
      paidAt: payment?.paidAt ?? null,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        customerName: [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') || 'Client',
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        createdAt: order.createdAt,
        items: order.items.map(i => ({
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