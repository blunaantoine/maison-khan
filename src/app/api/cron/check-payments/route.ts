import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { FedaPay, Transaction } from 'fedapay'
import { processDuePushCampaigns } from '@/lib/push-campaigns'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  // Notifications push programmées dont l'heure est venue (jamais bloquant)
  let pushCampaignsSent = 0
  try {
    pushCampaignsSent = await processDuePushCampaigns()
  } catch (e) {
    console.error('Cron push-campaigns error:', e)
  }

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

    const pendingPayments = await db.payment.findMany({
      where: {
        status: 'pending',
        paymentMethod: 'fedapay',
        createdAt: { gte: twoHoursAgo }
      },
      include: { order: true }
    })

    const results = {
      checked: 0,
      success: 0,
      failed: 0,
      stillPending: 0,
      errors: 0
    }

    FedaPay.setApiKey(process.env.FEDAPAY_SECRET_KEY)
    FedaPay.setEnvironment('live')

    for (const payment of pendingPayments) {
      results.checked++

      try {
        const trx = await Transaction.retrieve(Number(payment.transactionId))
        const status = trx.status // 'approved' | 'pending' | 'declined' | 'canceled'

        if (status === 'approved') {
          await db.$transaction([
            db.payment.update({
              where: { id: payment.id },
              data: {
                status: 'success',
                paidAt: new Date(),
                metadata: JSON.stringify({ fedapayStatus: status, transactionId: payment.transactionId })
              }
            }),
            db.order.update({
              where: { id: payment.orderId },
              data: {
                paymentStatus: 'paid',
                status: 'paid'
              }
            })
          ])
          results.success++

        } else if (status === 'pending') {
          results.stillPending++

        } else {
          // declined, cancelled, refunded, etc.
          await db.$transaction([
            db.payment.update({
              where: { id: payment.id },
              data: {
                status: 'failed',
                errorMessage: `Statut FedaPay: ${status}`,
                metadata: JSON.stringify({ fedapayStatus: status, transactionId: payment.transactionId })
              }
            }),
            db.order.update({
              where: { id: payment.orderId },
              data: {
                paymentStatus: 'failed',
                status: 'payment_failed'
              }
            })
          ])
          results.failed++
        }

      } catch (err) {
        console.error(`Erreur check paiement FedaPay ${payment.transactionId}:`, err)
        results.errors++
      }
    }

    return NextResponse.json({
      success: true,
      results,
      pushCampaignsSent,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Cron check-fedapay error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}