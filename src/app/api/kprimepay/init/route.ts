import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createKppCheckout, generateKppTransactionId, KPP_CARD_METHOD, KPP_PAYMENT_METHOD } from '@/lib/kprimepay'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maison-khan.com'

/**
 * POST /api/kprimepay/init
 * Body : { orderId, method?: 'card' }
 * method 'card' : la page KPrimePay n'affiche que la carte bancaire (payment_methods).
 * Crée un checkout KPrimePay pour une commande existante et renvoie l'URL de paiement.
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId, method } = await req.json()
    const cardOnly = method === 'card'

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }
    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: false, error: 'Commande déjà payée' }, { status: 400 })
    }

    // Montant toujours lu en base, jamais depuis le navigateur
    const amount = Number(order.total)
    if (!Number.isInteger(amount) || amount < 10 || amount > 2_000_000) {
      return NextResponse.json(
        { success: false, error: 'Montant non accepté par KPrimePay (entre 10 et 2 000 000 XOF)' },
        { status: 400 },
      )
    }

    if (!process.env.KPRIMEPAY_SECRET_KEY) {
      console.error('[kprimepay/init] KPRIMEPAY_SECRET_KEY manquante')
      return NextResponse.json({ success: false, error: 'Configuration KPrimePay manquante' }, { status: 500 })
    }

    const transactionId = generateKppTransactionId(order.orderNumber)

    // On enregistre la tentative AVANT d'appeler KPrimePay : aucun paiement ne peut
    // aboutir sans trace en base.
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId,
        amount,
        currency: 'XOF',
        status: 'pending',
        paymentMethod: KPP_PAYMENT_METHOD,
        operator: cardOnly ? 'CARD' : KPP_PAYMENT_METHOD,
      },
    })

    const fullName = [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ')

    try {
      const checkout = await createKppCheckout({
        transactionId,
        amount,
        description: `Commande ${order.orderNumber} - MAISON KHAN`,
        returnUrl: `${BASE_URL}/kprimepay/retour?orderId=${encodeURIComponent(order.id)}`,
        customer: {
          ...(fullName ? { full_name: fullName } : {}),
          ...(order.customerEmail ? { email: order.customerEmail } : {}),
          ...(order.customerPhone ? { phone_number: order.customerPhone } : {}),
        },
        meta: { order_id: order.id, order_number: order.orderNumber },
        ...(cardOnly ? { paymentMethods: [KPP_CARD_METHOD] } : {}),
      })

      await db.payment.update({
        where: { id: payment.id },
        data: {
          paymentUrl: checkout.checkoutUrl,
          paymentToken: checkout.kppReference,
          metadata: JSON.stringify(checkout.raw),
        },
      })

      return NextResponse.json({ success: true, url: checkout.checkoutUrl, transactionId })
    } catch (e: any) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', errorMessage: e?.message || 'Erreur KPrimePay' },
      })
      return NextResponse.json(
        { success: false, error: e?.message || "Impossible d'initialiser le paiement KPrimePay" },
        { status: 502 },
      )
    }
  } catch (e: any) {
    console.error('[kprimepay/init] Exception:', e)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
