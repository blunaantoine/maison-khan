import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// CinetPay Configuration
const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY || ''
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID || ''
const CINETPAY_BASE_URL = 'https://api-checkout.cinetpay.com/v2/payment'

// POST - Initialize payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, phoneNumber, customerName } = body

    if (!orderId) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    // Get order
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })

    if (!order) {
      return NextResponse.json(
        { error: 'Commande non trouvée' },
        { status: 404 }
      )
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json(
        { error: 'Cette commande est déjà payée' },
        { status: 400 }
      )
    }

    // Generate transaction ID
    const transactionId = `CP-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Create payment record
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId,
        amount: order.total,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: phoneNumber || order.customerPhone
      }
    })

    // For development/demo without CinetPay credentials
    if (!CINETPAY_API_KEY || process.env.NODE_ENV === 'development') {
      return NextResponse.json({
        message: 'Mode demo - Paiement simulé',
        demo: true,
        transactionId,
        paymentUrl: `/?section=account&tab=orders&payment=success&transaction_id=${transactionId}`
      })
    }

    // Prepare CinetPay request
    const CinetPayData = {
      apikey: CINETPAY_API_KEY,
      site_id: CINETPAY_SITE_ID,
      transaction_id: transactionId,
      amount: order.total,
      currency: 'XOF',
      description: `Commande ${order.orderNumber} - MAISON KHAN`,
      customer_name: customerName || `${order.customerFirstName || ''} ${order.customerLastName || ''}`.trim() || 'Client',
      customer_surname: order.customerLastName || 'Client',
      customer_phone_number: phoneNumber || order.customerPhone,
      customer_email: order.customerEmail,
      notify_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/payments/cinetpay/notify`,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/?section=account&tab=orders&payment=success`,
      channels: 'ALL',
      metadata: JSON.stringify({ orderId: order.id, orderNumber: order.orderNumber })
    }

    try {
      // Call CinetPay API
      const response = await fetch(CINETPAY_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(CinetPayData)
      })

      const result = await response.json()

      if (result.code === '201' || result.code === 201) {
        // Update payment with CinetPay data
        await db.payment.update({
          where: { id: payment.id },
          data: {
            paymentUrl: result.data?.payment_url,
            paymentToken: result.data?.token
          }
        })

        return NextResponse.json({
          message: 'Paiement initialisé',
          paymentUrl: result.data?.payment_url,
          transactionId
        })
      } else {
        // CinetPay error
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            errorMessage: result.message || 'Erreur CinetPay'
          }
        })

        return NextResponse.json(
          { error: result.message || 'Erreur lors de l\'initialisation du paiement' },
          { status: 400 }
        )
      }
    } catch (fetchError) {
      console.error('CinetPay fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Erreur de connexion à CinetPay' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Payment init error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'initialisation du paiement' },
      { status: 500 }
    )
  }
}

// GET - Check payment status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const transactionId = searchParams.get('transaction_id')

    if (!transactionId) {
      return NextResponse.json(
        { error: 'ID transaction requis' },
        { status: 400 }
      )
    }

    const payment = await db.payment.findUnique({
      where: { transactionId },
      include: { order: true }
    })

    if (!payment) {
      return NextResponse.json(
        { error: 'Paiement non trouvé' },
        { status: 404 }
      )
    }

    return NextResponse.json({ payment })
  } catch (error) {
    console.error('Get payment error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification du paiement' },
      { status: 500 }
    )
  }
}
