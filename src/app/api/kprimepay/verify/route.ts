import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { KPP_PAYMENT_METHOD, syncKppPayment } from '@/lib/kprimepay'

// KPrimePay limite à 120 requêtes/minute par clé. La page d'attente interroge cette route
// toutes les 2 s : on ne relaie vers debit-status qu'au plus une fois toutes les 2,5 s par
// transaction (~24 req/min, très en dessous de la limite), et sinon on renvoie l'état de la
// base (mis à jour instantanément par le webhook).
const MIN_REMOTE_INTERVAL_MS = 2500
const lastRemoteCheck = new Map<string, number>()

/**
 * GET /api/kprimepay/verify?orderId=...
 * Utilisé par la page /kprimepay/retour : interroge KPrimePay (source de vérité),
 * met la base à jour et renvoie uniquement le statut.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get('orderId')
  if (!orderId) {
    return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
  }

  try {
    const payment = await db.payment.findFirst({
      where: { orderId, paymentMethod: KPP_PAYMENT_METHOD },
      orderBy: { createdAt: 'desc' },
    })

    if (!payment?.transactionId) {
      return NextResponse.json({ success: false, error: 'Paiement introuvable' }, { status: 404 })
    }

    // État déjà tranché en base (webhook, délai dépassé, annulation) : réponse immédiate
    if (payment.status === 'completed') return NextResponse.json({ success: true, status: 'completed' })
    if (payment.status === 'failed' || payment.status === 'amount_mismatch') {
      return NextResponse.json({ success: true, status: payment.status })
    }

    const tx = payment.transactionId
    const now = Date.now()
    if (now - (lastRemoteCheck.get(tx) ?? 0) < MIN_REMOTE_INTERVAL_MS) {
      return NextResponse.json({ success: true, status: 'pending' })
    }
    lastRemoteCheck.set(tx, now)
    if (lastRemoteCheck.size > 1000) lastRemoteCheck.clear()

    const status = await syncKppPayment(tx, 'return')

    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error('[kprimepay/verify] Erreur:', e)
    // On renvoie "pending" : la page réessaiera, et le webhook reste actif en parallèle.
    return NextResponse.json({ success: true, status: 'pending' })
  }
}
