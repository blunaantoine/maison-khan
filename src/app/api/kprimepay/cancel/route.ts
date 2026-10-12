import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { KPP_PAYMENT_METHOD, syncKppPayment } from '@/lib/kprimepay'

/**
 * POST /api/kprimepay/cancel
 * Body : { orderId }
 * Le client indique qu'il n'a pas pu valider (refus, solde insuffisant, pas de popup...).
 * On revérifie d'abord auprès de KPrimePay : si le paiement est en fait passé, la
 * commande est marquée payée ; sinon la tentative est close en échec.
 * Réversible : un paiement confirmé plus tard par KPrimePay repasse la commande en payée.
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
    }

    const payment = await db.payment.findFirst({
      where: { orderId, paymentMethod: KPP_PAYMENT_METHOD },
      orderBy: { createdAt: 'desc' },
    })
    if (!payment?.transactionId) {
      return NextResponse.json({ success: false, error: 'Paiement introuvable' }, { status: 404 })
    }
    if (payment.status === 'completed') {
      return NextResponse.json({ success: true, status: 'completed' })
    }

    const status = await syncKppPayment(payment.transactionId, 'customer-cancel', { cancelIfPending: true })
    return NextResponse.json({ success: true, status })
  } catch (e) {
    console.error('[kprimepay/cancel] Erreur:', e)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
