import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { KPP_PAYMENT_METHOD, syncKppPayment } from '@/lib/kprimepay'

// KPrimePay limite à 120 requêtes/minute par clé. On ne relaie vers debit-status
// qu'au plus une fois toutes les 2,5 s par transaction (~24 req/min, très en
// dessous de la limite), et sinon on renvoie l'état de la base (mis à jour
// instantanément par le webhook).
const MIN_REMOTE_INTERVAL_MS = 2500

/**
 * LONG-POLLING — la page /kprimepay/retour ouvre UNE requête avec `wait=1` :
 * le serveur surveille la base (écrite par le webhook) toutes les 800 ms et
 * interroge KPrimePay toutes les 2,5 s, pendant 12 s max. Il répond DÈS que
 * le statut est tranché → le client voit le résultat < 1 s après la
 * confirmation de KPrimePay, au lieu d'attendre le prochain tick de polling.
 * Au terme du délai, l'état courant est renvoyé et le client relance aussitôt.
 * Sans `wait=1` : un seul contrôle, comme avant (compatibilité).
 */
const LONGPOLL_MS = 12000
const LONGPOLL_DB_INTERVAL_MS = 800

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * GET /api/kprimepay/verify?orderId=...[&wait=1]
 * Utilisé par la page /kprimepay/retour : interroge KPrimePay (source de vérité),
 * met la base à jour et renvoie uniquement le statut.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId')
  const wait = req.nextUrl.searchParams.get('wait') === '1'
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
  }

  try {
    const deadline = Date.now() + LONGPOLL_MS
    let status = 'pending'

    for (;;) {
      const payment = await db.payment.findFirst({
        where: { orderId, paymentMethod: KPP_PAYMENT_METHOD },
        orderBy: { createdAt: 'desc' },
      })

      if (!payment?.transactionId) {
        return NextResponse.json({ success: false, error: 'Paiement introuvable' }, { status: 404 })
      }

      // État déjà tranché en base (webhook, délai dépassé, annulation) : réponse immédiate
      if (payment.status === 'completed' || payment.status === 'failed' || payment.status === 'amount_mismatch') {
        status = payment.status
        break
      }

      const tx = payment.transactionId
      const now = Date.now()
      if (now - (lastRemoteCheck.get(tx) ?? 0) >= MIN_REMOTE_INTERVAL_MS) {
        lastRemoteCheck.set(tx, now)
        if (lastRemoteCheck.size > 1000) lastRemoteCheck.clear()

        try {
          status = await syncKppPayment(tx, 'return')
        } catch (e) {
          console.warn('[kprimepay/verify] Synchronisation:', e)
          // On renvoie "pending" : la page réessaiera, et le webhook reste actif en parallèle.
          status = 'pending'
        }
      } else {
        status = 'pending'
      }

      if (status !== 'pending' || !wait || Date.now() >= deadline) break
      await sleep(LONGPOLL_DB_INTERVAL_MS)
    }

    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error('[kprimepay/verify] Erreur:', e)
    // On renvoie "pending" : la page réessaiera, et le webhook reste actif en parallèle.
    return NextResponse.json({ success: true, status: 'pending' })
  }
}
