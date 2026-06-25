import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'
const PAYDUNYA_BASE =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

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
      include: { order: { include: { items: true } } },
    })

    let liveStatus = payment?.status ?? 'pending'

    if (token) {
      try {
        const confirmRes = await fetch(`${PAYDUNYA_BASE}/checkout-invoice/confirm/${token}`, {
          headers: {
            'PAYDUNYA-MASTER-KEY': masterKey,
            'PAYDUNYA-PRIVATE-KEY': privateKey,
            'PAYDUNYA-TOKEN': apiToken,
          },
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
        }
      } catch (e) {
        console.warn('[verify] Erreur confirmation PayDunya:', e)
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