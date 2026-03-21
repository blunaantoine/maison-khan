import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { orderId, phoneNumber, network, identifier } = body

    if (!orderId || !identifier) {
      return NextResponse.json({ error: 'orderId et identifier requis' }, { status: 400 })
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
        transactionId: identifier,     
        amount: order.total,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: phoneNumber || order.customerPhone,
        paymentMethod: 'mobile_money',
        operator: network || 'TMONEY'
      }
    })

    const payload = {
      auth_token: process.env.PAYGATE_AUTH_TOKEN,
      phone_number: phoneNumber || order.customerPhone,
      amount: order.total,
      description: `Commande ${order.orderNumber} - MAISON KHAN`,
      identifier: identifier,            
      network: network || 'TMONEY'
    }

    const response = await fetch(`${process.env.PAYGATE_BASE_URL}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const data = await response.json()

    if (data.status === 0) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          metadata: JSON.stringify({ paygateResponse: data })
        }
      })

      return NextResponse.json({
        success: true,
        transactionId: identifier,       
        message: 'Paiement initié'
      })
    }

    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: 'failed',
        errorMessage: `Erreur PayGate status: ${data.status}`
      }
    })

    return NextResponse.json({
      success: false,
      error: `Erreur PayGate: ${data.status}`
    })

  } catch (error) {
    console.error('Payment init error:', error)
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 })
  }
}