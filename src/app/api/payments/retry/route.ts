import { NextRequest, NextResponse } from 'next/server'
import { canAccessOrder } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * POST /api/payments/retry
 * Body : { orderId }
 *
 * Les pages de retour boutique (payment-success / payment-failed) servent à la
 * fois aux paiements PayDunya (Mobile Money) et KPrimePay (carte bancaire).
 * Pour « Réessayer le paiement », il faut relancer le BON moyen : cet endpoint
 * renvoie la méthode du dernier paiement enregistré pour la commande.
 *
 * Le client appelle ensuite :
 *  - method = 'kprimepay' → POST /api/kprimepay/init  { orderId } (nouveau checkout carte)
 *  - method = 'paydunya'  → POST /api/paydunya-psr    { orderId } (nouvelle facture Mobile Money)
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()
    if (typeof orderId !== 'string' || !orderId) {
      return NextResponse.json({ error: 'orderId invalide' }, { status: 400 })
    }

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }
    if (!(await canAccessOrder(req, order))) {
      return NextResponse.json({ success: false, error: 'Accès refusé à cette commande' }, { status: 403 })
    }

    const lastPayment = await db.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
      select: { paymentMethod: true },
    })

    const method =
      lastPayment?.paymentMethod === 'kprimepay' || order.paymentMethod === 'kprimepay'
        ? 'kprimepay'
        : 'paydunya'

    return NextResponse.json({ success: true, method })
  } catch (e) {
    console.error('[payments/retry] Erreur:', e)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
