// src/app/api/payments/update/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { transactionId, status, errorMessage, operator } = body

    if (!transactionId) {
      return NextResponse.json(
        { error: 'transactionId requis' },
        { status: 400 }
      )
    }

    // Préparer les données de mise à jour
    const updateData: any = {
      status,
      updatedAt: new Date()
    }

    if (status === 'success') {
      updateData.paidAt = new Date()
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage
    }

    if (operator) {
      updateData.operator = operator
    }

    // Mettre à jour le payment
    const payment = await db.payment.update({
      where: { transactionId },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      payment
    })

  } catch (error) {
    console.error('Payment update error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du paiement' },
      { status: 500 }
    )
  }
}