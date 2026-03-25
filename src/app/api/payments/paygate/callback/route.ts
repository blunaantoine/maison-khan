import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PayGate Callback/Notification endpoint
// This is called by PayGate when a payment status changes
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // PayGate sends these parameters in callback
    const {
      status,
      identifier,
      tx_reference,
      phone_number,
      amount,
      network,
      comment
    } = body

    console.log('PayGate Callback received:', {
      status,
      identifier,
      tx_reference,
      phone_number,
      amount
    })

    if (!identifier) {
      return NextResponse.json(
        { error: 'Identifier manquant' },
        { status: 400 }
      )
    }

    // Find the payment by transaction ID
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { transactionId: identifier },
          { paymentToken: tx_reference }
        ]
      },
      include: { order: true }
    })

    if (!payment) {
      console.error('Payment not found for identifier:', identifier)
      return NextResponse.json(
        { error: 'Paiement non trouvé' },
        { status: 404 }
      )
    }

    // Status 0 = success, other values = failure
    if (status === 0) {
      // Payment successful
      await db.$transaction([
        db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'paid',
            paidAt: new Date(),
            paymentToken: tx_reference,
            operator: network,
            metadata: JSON.stringify({
              phone_number,
              amount,
              network,
              comment,
              tx_reference,
              raw: body
            })
          }
        }),
        db.order.update({
          where: { id: payment.orderId },
          data: {
            paymentStatus: 'paid',
            status: 'confirmed'
          }
        })
      ])

      console.log(`Payment ${payment.id} confirmed for order ${payment.orderId}`)

      return NextResponse.json({
        success: true,
        message: 'Paiement confirmé'
      })
    } else {
      // Payment failed
      const errorMessage = getPayGateErrorMessage(status)
      
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          errorMessage: errorMessage,
          metadata: JSON.stringify({
            phone_number,
            amount,
            network,
            comment,
            tx_reference,
            raw: body
          })
        }
      })

      console.log(`Payment ${payment.id} failed: ${errorMessage}`)

      return NextResponse.json({
        success: false,
        message: errorMessage
      })
    }
  } catch (error) {
    console.error('PayGate callback error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du traitement du callback' },
      { status: 500 }
    )
  }
}

// GET for testing callback
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const identifier = searchParams.get('identifier')
  const status = searchParams.get('status')

  if (!identifier) {
    return NextResponse.json(
      { error: 'Identifier requis' },
      { status: 400 }
    )
  }

  const payment = await db.payment.findFirst({
    where: { transactionId: identifier },
    include: { order: true }
  })

  if (!payment) {
    return NextResponse.json(
      { error: 'Paiement non trouvé' },
      { status: 404 }
    )
  }

  // Simulate payment success for testing
  if (status === 'success') {
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          paidAt: new Date()
        }
      }),
      db.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'paid',
          status: 'confirmed'
        }
      })
    ])
  }

  return NextResponse.json({
    message: 'Callback test',
    identifier,
    status,
    payment
  })
}

// Helper function for PayGate error messages
function getPayGateErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    0: 'Succès',
    1: 'Numéro de téléphone invalide',
    2: 'Montant invalide',
    3: 'Authentification échouée',
    4: 'Transaction échouée',
    5: 'Transaction annulée',
    6: 'Solde insuffisant',
    7: 'Erreur réseau',
    8: 'Transaction en cours',
    9: 'Transaction non trouvée',
    10: 'Numéro de téléphone non enregistré pour Mobile Money',
    11: 'Erreur interne PayGate',
    12: 'Identifiant de transaction déjà utilisé'
  }
  return messages[code] || `Erreur PayGate (code: ${code})`
}
