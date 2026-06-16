import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(req: Request) {
  try {
    const { orderId, transactionId, status } = await req.json()

    if (!orderId || !transactionId) {
      return NextResponse.json({ error: 'orderId et transactionId requis' }, { status: 400 })
    }

    const { FedaPay, Transaction } = require('fedapay')
    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    let verifiedStatus = status
    try {
      const trx = await Transaction.retrieve(Number(transactionId))
      verifiedStatus = trx.status
    } catch (e) {
      console.warn('Re-vérification impossible:', e)
    }

    const isSuccess = verifiedStatus === 'approved'

    // Mettre à jour le Payment existant
    const existingPayment = await db.payment.findFirst({
      where: { transactionId: String(transactionId), orderId }
    })

    if (existingPayment) {
      await db.payment.update({
        where: { id: existingPayment.id },
        data: {
          status:       isSuccess ? 'success' : 'failed',
          errorMessage: isSuccess ? null : `Statut FedaPay: ${verifiedStatus}`,
          paidAt:       isSuccess ? new Date() : null,
          metadata:     JSON.stringify({ fedapayStatus: verifiedStatus, source: 'fedapay-complete' })
        }
      })
    } else {
      // Créer si aucun n'existe (cas de secours)
      await db.payment.create({
        data: {
          orderId,
          transactionId: String(transactionId),
          amount: 0,
          currency: 'XOF',
          status: isSuccess ? 'success' : 'failed',
          paymentMethod: 'fedapay',
          operator: 'fedapay',
          paidAt: isSuccess ? new Date() : null,
          metadata: JSON.stringify({ fedapayStatus: verifiedStatus, source: 'fedapay-complete-fallback' })
        }
      })
    }

    await db.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: isSuccess ? 'paid' : 'failed',
        status:        isSuccess ? 'paid' : 'payment_failed',
        paymentMethod: 'fedapay'
      }
    })

    return NextResponse.json({ success: true, status: verifiedStatus })

  } catch (err: any) {
    console.error('fedapay-complete', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
