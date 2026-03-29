import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, transactionId } = body

    if (!orderId || !transactionId) {
      return NextResponse.json({ error: 'orderId et transactionId requis' }, { status: 400 })
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })

    if (!order) {
      return NextResponse.json({ error: 'Commande non trouvée' }, { status: 404 })
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'Commande déjà payée' }, { status: 400 })
    }

    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId: String(transactionId),
        amount: order.total,
        currency: 'XOF',
        status: 'pending',
        paymentMethod: 'fedapay',
        operator: 'fedapay',
      }
    })

    const { FedaPay, Transaction } = require('fedapay')
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    let verifiedStatus = 'failed'

    try {
      const trx = await Transaction.retrieve(Number(transactionId))
      verifiedStatus = trx.status
    } catch (sdkErr: unknown) {
      console.error('FedaPay verification failed', { transactionId, sdkErr })
    }

    const isSuccess = verifiedStatus === 'approved'

    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: isSuccess ? 'success' : 'failed',
          errorMessage: isSuccess ? null : `Statut FedaPay: ${verifiedStatus}`,
          paidAt: isSuccess ? new Date() : null,
          metadata: JSON.stringify({ fedapayStatus: verifiedStatus, transactionId })
        }
      }),

      db.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: isSuccess ? 'paid' : 'failed',
          status: isSuccess ? 'paid' : 'payment_failed',
          paymentMethod: 'fedapay',
        }
      })
    ])

    return NextResponse.json({
      success: true,
      status: verifiedStatus,
      isSuccess
    })

  } catch (error: any) {
    console.error('Payment API error', error)

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}