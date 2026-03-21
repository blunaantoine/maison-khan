import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    
    const pendingPayments = await db.payment.findMany({
      where: {
        status: 'pending',
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

    for (const payment of pendingPayments) {
      results.checked++

      try {
        const response = await fetch('https://paygateglobal.com/api/v2/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_token: process.env.PAYGATE_AUTH_TOKEN,
            identifier: payment.transactionId
          })
        })

        const data = await response.json()
        const status = data.status?.toString()

        if (status === '0') {
          await db.payment.update({
            where: { id: payment.id },
            data: {
              status: 'success',
              paidAt: new Date(),
              operator: data.payment_method || payment.operator
            }
          })

          await db.order.update({
            where: { id: payment.orderId },
            data: {
              paymentStatus: 'paid',
              status: 'paid'
            }
          })

          results.success++

        } else if (status === '2') {

          results.stillPending++

        } else if (status === '4' || status === '6') {

          await db.payment.update({
            where: { id: payment.id },
            data: {
              status: 'failed',
              errorMessage: status === '4' ? 'Expiré' : 'Annulé'
            }
          })

          await db.order.update({
            where: { id: payment.orderId },
            data: {
              paymentStatus: 'failed',
              status: 'payment_failed'
            }
          })

          results.failed++
        }

      } catch (err) {
        console.error(`Erreur check paiement ${payment.transactionId}:`, err)
        results.errors++
      }
    }

    console.log('Cron check-payments résultats:', results)

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Cron check-payments error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}