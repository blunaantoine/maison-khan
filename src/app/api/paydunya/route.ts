import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PAYDUNYA_MASTER_KEY = process.env.PAYDUNYA_MASTER_KEY  || ''
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY || ''
const PAYDUNYA_TOKEN = process.env.PAYDUNYA_TOKEN || ''
const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'

const PAYDUNYA_BASE_URL =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://maison-khan.com'

export async function POST(request: NextRequest) {
  const reqId = `PDY-${Date.now()}`

  try {
    const { orderId } = await request.json()

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'ID commande requis' }, { status: 400 })
    }

    if (!PAYDUNYA_MASTER_KEY || !PAYDUNYA_PRIVATE_KEY || !PAYDUNYA_TOKEN) {
      console.error(`[${reqId}] Config PayDunya manquante`)
      return NextResponse.json({ success: false, error: 'Configuration PayDunya manquante' }, { status: 500 })
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande non trouvée' }, { status: 404 })
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: false, error: 'Commande déjà payée' }, { status: 400 })
    }

    const payload = {
      invoice: {
        items: {
          item_0: {
            name: `Commande ${order.orderNumber}`,
            quantity: 1,
            unit_price: order.total.toString(),
            total_price: order.total.toString(),
            description: `Paiement commande ${order.orderNumber} - MAISON KHAN`
          }
        },
        taxes: {},
        total_amount: order.total,
        description: `Commande ${order.orderNumber} - MAISON KHAN`
      },
      store: {
        name: 'MAISON KHAN',
        tagline: 'Votre boutique en ligne',
        postal_address: 'Lomé, Togo'
      },
      actions: {
        cancel_url: `${BASE_URL}/payment-failed?orderId=${order.id}`,
        return_url: `${BASE_URL}/payment-success?orderId=${order.id}`,
        callback_url: `${BASE_URL}/api/paydunya/callback`
      },

      payment_channels: [
        'card',       
        'orange-money',
        'wave',
        'free-money',
        'expresso',
        'mtn',
        'moov',
        'tmoney',
        'flooz'
      ],
      custom_data: {
        order_id:     order.id,
        order_number: order.orderNumber
      }
    }

    const response = await fetch(`${PAYDUNYA_BASE_URL}/checkout-invoice/create`, {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'PAYDUNYA-MASTER-KEY':  PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-TOKEN':       PAYDUNYA_TOKEN
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()

    if (result.response_code === '00') {
      await db.payment.create({
        data: {
          orderId: order.id,
          transactionId: result.token,
          amount: order.total,
          currency: 'XOF',
          status: 'pending',
          paymentMethod: 'paydunya',
          operator: 'paydunya',
          metadata: JSON.stringify(result)
        }
      })

      return NextResponse.json({
        success:       true,
        invoice_token: result.token,
        payment_url:   result.response_text
      })
    } else {
      console.error(`[${reqId}]  Erreur PayDunya:`, result)
      return NextResponse.json({
        success: false,
        error:   result.response_text || 'Erreur PayDunya'
      }, { status: 400 })
    }
  } catch (error) {
    console.error(`[${reqId}] Exception:`, error)
    return NextResponse.json({ success: false, error: 'Erreur interne' }, { status: 500 })
  }
}