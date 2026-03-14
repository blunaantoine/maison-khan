import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

const CINETPAY_SECRET_KEY = process.env.CINETPAY_SECRET_KEY || ''

// CinetPay webhook notification handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('CinetPay notification received:', body)

    const {
      cpm_trans_id,
      cpm_site_id,
      cpm_amount,
      cpm_currency,
      cpm_trans_status,
      cpm_payment_config,
      cpm_payment_time,
      cpm_error_message,
      cpm_cell_phone_number,
      cpm_phone_prefixe,
      cpm_version,
      cpm_language,
      cpm_action,
      cpm_result,
      cpm_trans_date,
      cpm_custom,
      signature
    } = body

    // Verify signature (if secret key is configured)
    if (CINETPAY_SECRET_KEY) {
      const expectedSignature = crypto
        .createHmac('sha256', CINETPAY_SECRET_KEY)
        .update(JSON.stringify(body))
        .digest('hex')

      if (signature !== expectedSignature) {
        console.error('Invalid CinetPay signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Find payment by transaction ID
    const payment = await db.payment.findFirst({
      where: { transactionId: cpm_trans_id }
    })

    if (!payment) {
      console.error('Payment not found for transaction:', cpm_trans_id)
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    // Update payment status based on CinetPay result
    if (cpm_result === '00') {
      // Payment successful
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'success',
          cpmTransId: cpm_trans_id,
          cpmSiteId: cpm_site_id,
          paymentMethod: cpm_payment_config,
          operator: cpm_phone_prefixe,
          phoneNumber: cpm_cell_phone_number,
          paidAt: new Date()
        }
      })

      // Update order status
      await db.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'paid',
          status: 'processing'
        }
      })

      console.log(`Payment successful for order: ${payment.orderId}`)
    } else {
      // Payment failed
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          cpmTransId: cpm_trans_id,
          errorMessage: cpm_error_message || 'Paiement échoué'
        }
      })

      console.log(`Payment failed for order: ${payment.orderId}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('CinetPay notification error:', error)
    return NextResponse.json({ error: 'Error processing notification' }, { status: 500 })
  }
}
