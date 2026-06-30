import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY || ''
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY || ''
const PAYDUNYA_TOKEN = process.env.PAYDUNYA_TOKEN || ''
const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'
const CRON_SECRET = process.env.CRON_SECRET || ''

const PAYDUNYA_BASE_URL =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const startTime = Date.now()

  let checked = 0, success = 0, failed = 0, errors = 0

  try {
    // cmd qui st en pending depuis plus de 35 min...
    const expiredAt = new Date(Date.now() - 35 * 60 * 1000)

    const pendingPayments = await db.payment.findMany({
      where: {
        status: 'pending',
        createdAt: { lt: expiredAt }
      },
      include: { order: true },
      take: 50
    })

    for (const payment of pendingPayments) {
      checked++
      try {
        const res = await fetch(
          `${PAYDUNYA_BASE_URL}/checkout-invoice/confirm/${payment.transactionId}`,
          {
            headers: {
              'PAYDUNYA-MASTER-KEY': PAYDUNYA_MASTER_KEY,
              'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
              'PAYDUNYA-TOKEN': PAYDUNYA_TOKEN
            }
          }
        )
        const invoice = await res.json()
        if (invoice.status === 'completed' && payment.status !== 'completed') {

          await db.$transaction(async (tx) => {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: 'completed', paidAt: new Date() }
            })
            await tx.order.update({
              where: { id: payment.orderId },
              data: { paymentStatus: 'paid', status: 'paid' }
            })
          })
          success++

        } else if (invoice.status === 'cancelled' || invoice.status === 'failed' || invoice.response_code === '4004') {
          
          await db.payment.update({
            where: { id: payment.id },
            data: { status: 'cancelled' }
          })
          await db.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: 'cancelled', status: 'cancelled' }
          })
          failed++
        }
      } catch (e) {
        errors++
        console.error(`[Cron] Erreur pour payment ${payment.id}:`, e)
      }
    }

    const duration = Date.now() - startTime

    await db.cronLog.create({
      data: {
        taskName: 'check-payments',
        status: errors > 0 ? 'partial' : 'success',
        checked,
        success,
        failed,
        errors,
        duration
      }
    })

    return NextResponse.json({
      success: true,
      checked,
      successCount: success,
      failed,
      errors,
      duration
    })

  } catch (error) {
    console.error('[Cron] Erreur fatale:', error)
    await db.cronLog.create({
      data: {
        taskName: 'check-payments',
        status: 'error',
        checked,
        success,
        failed,
        errors: errors + 1,
        duration: Date.now() - startTime,
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    })

    return NextResponse.json({ error: 'Erreur cron' }, { status: 500 })
  }
}