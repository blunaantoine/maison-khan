import { NextRequest, NextResponse } from 'next/server'
import { canAccessOrder } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  createKppUssdPush,
  generateKppTransactionId,
  isKppGateway,
  KPP_PAYMENT_METHOD,
  toLocalTogoNumber,
} from '@/lib/kprimepay'

/**
 * POST /api/kprimepay/push
 * Body : { orderId, gateway: 'MIXX-YAS-TG' | 'MOOV-MONEY-TG', phone }
 *
 * Envoie la demande de paiement directement sur le téléphone du client (USSD push).
 * Le client reste sur notre site : la page /kprimepay/retour suit le statut en direct
 * et redirige vers /payment-success ou /payment-failed dès que l'opérateur répond.
 */
export async function POST(req: NextRequest) {
  try {
    const { orderId, gateway, phone } = await req.json()
    if (typeof orderId !== 'string' || !orderId) {
      return NextResponse.json({ error: 'orderId invalide' }, { status: 400 })
    }

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
    }
    if (!isKppGateway(gateway)) {
      return NextResponse.json({ success: false, error: 'Opérateur invalide' }, { status: 400 })
    }
    const phoneNumber = toLocalTogoNumber(String(phone || ''))
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Numéro invalide : 8 chiffres attendus (ex. 90 12 34 56)' },
        { status: 400 },
      )
    }

    const order = await db.order.findUnique({ where: { id: orderId } })
    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }
    if (!(await canAccessOrder(req, order))) {
      return NextResponse.json({ success: false, error: 'Accès refusé à cette commande' }, { status: 403 })
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
      console.error('[kprimepay/push] KPRIMEPAY_SECRET_KEY manquante')
      return NextResponse.json({ success: false, error: 'Configuration KPrimePay manquante' }, { status: 500 })
    }

    // Une tentative USSD à la fois par commande : on clôt les précédentes restées en attente
    await db.payment.updateMany({
      where: { orderId: order.id, paymentMethod: KPP_PAYMENT_METHOD, status: 'pending' },
      data: { status: 'failed', errorMessage: 'Remplacée par une nouvelle tentative' },
    })

    const transactionId = generateKppTransactionId(order.orderNumber)
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId,
        amount,
        currency: 'XOF',
        status: 'pending',
        paymentMethod: KPP_PAYMENT_METHOD,
        operator: gateway,
        phoneNumber, // marque ce paiement comme "USSD push" (voir syncKppPayment)
      },
    })

    const customerName =
      [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') || 'Client MAISON KHAN'

    try {
      const raw = await createKppUssdPush({
        transactionId,
        amount,
        gateway,
        phoneNumber,
        customerName,
        customerEmail: order.customerEmail,
        description: `Commande ${order.orderNumber} - MAISON KHAN`,
      })
      await db.payment.update({
        where: { id: payment.id },
        data: { metadata: JSON.stringify(raw) },
      })
      return NextResponse.json({ success: true, transactionId })
    } catch (e: any) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', errorMessage: e?.message || 'Erreur KPrimePay' },
      })
      return NextResponse.json(
        { success: false, error: e?.message || "Impossible d'envoyer la demande de paiement" },
        { status: 502 },
      )
    }
  } catch (e) {
    console.error('[kprimepay/push] Exception:', e)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
