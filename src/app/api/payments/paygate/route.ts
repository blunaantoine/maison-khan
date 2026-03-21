import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'


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

    const transactionId = `PG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    await db.payment.create({
      data: {
        orderId: order.id,
        transactionId,
        amount: order.total,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: phoneNumber || order.customerPhone
      }
    })

  } catch (error) {
    console.error('Payment init error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'initialisation du paiement' },
      { status: 500 }
    )
  }
}

