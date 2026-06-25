import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'
const PAYDUNYA_BASE =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maison-khan.com'

export async function POST(req: NextRequest) {
  try {
    const { orderId } = await req.json()

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'orderId manquant' }, { status: 400 })
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande introuvable' }, { status: 404 })
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: false, error: 'Commande déjà payée' }, { status: 400 })
    }

    const totalAmount = Number(order.total)
    if (!totalAmount || totalAmount <= 0 || Number.isNaN(totalAmount)) {
      return NextResponse.json({ success: false, error: 'Montant invalide' }, { status: 400 })
    }

    const masterKey  = process.env.PAYDUNYA_MASTER_KEY
    const privateKey = process.env.PAYDUNYA_PRIVATE_KEY
    const token      = process.env.PAYDUNYA_TOKEN
    if (!masterKey || !privateKey || !token) {
      console.error('[paydunya-psr] Clés API manquantes')
      return NextResponse.json({ success: false, error: 'Configuration PayDunya manquante' }, { status: 500 })
    }

    const payload = {
      invoice: {
        items: {
          item_0: {
            name: `Commande ${order.orderNumber}`,
            quantity: 1,
            unit_price: totalAmount.toString(),
            total_price: totalAmount.toString(),
            description: `Paiement commande ${order.orderNumber} — MAISON KHAN`,
          },
        },
        taxes: {},
        total_amount: totalAmount,
        description: `Commande ${order.orderNumber} — MAISON KHAN`,

        expire_date:  new Date(Date.now() + 10 * 60 * 1000)
          .toISOString()
          .replace('T', ' ')
          .substring(0, 19),
          },
      store: {
        name: 'MAISON KHAN',
        tagline: 'Votre boutique en ligne',
        postal_address: 'Lomé, Togo',
      },
      actions: {
        return_url: `${BASE_URL}/payment-success?orderId=${order.id}`,
        cancel_url: `${BASE_URL}/payment-failed?orderId=${order.id}`,
        callback_url: `${BASE_URL}/api/paydunya/callback`,
      },
      custom_data: {
        order_id: order.id,
        order_number: order.orderNumber,
      },
    }

    const res = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PAYDUNYA-MASTER-KEY': masterKey,
        'PAYDUNYA-PRIVATE-KEY': privateKey,
        'PAYDUNYA-TOKEN': token,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()

    if (data.response_code !== '00') {
      return NextResponse.json(
        { success: false, error: data.response_text || 'Erreur PayDunya' },
        { status: 400 },
      )
    }

    await db.payment.create({
      data: {
        orderId: order.id,
        transactionId: data.token,
        amount: totalAmount,
        currency: 'XOF',
        status: 'pending',
        paymentMethod: 'paydunya',
        operator: 'paydunya',
        metadata: JSON.stringify(data),
      },
    })

    return NextResponse.json({
      success: true,
      url: data.response_text,
      token: data.token,
    })
  } catch (e: any) {
    console.error('[paydunya-psr] Exception:', e)
    return NextResponse.json({ success: false, error: e.message }, { status: 500 })
  }
}