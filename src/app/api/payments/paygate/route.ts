import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PayGate Configuration
const PAYGATE_AUTH_TOKEN = process.env.PAYGATE_AUTH_TOKEN || ''
const PAYGATE_BASE_URL = process.env.PAYGATE_BASE_URL || 'https://paygateglobal.com/api/v1'

// POST - Initialize payment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, phoneNumber, network } = body

    if (!orderId) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Numéro de téléphone requis pour PayGate' },
        { status: 400 }
      )
    }

    // Clean phone number - remove prefix and spaces for PayGate
    // PayGate expects local format (e.g., 90123456 for Togo)
    let cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '') // Remove spaces, dashes, parentheses
    cleanPhone = cleanPhone.replace(/^\+\d{1,4}/, '') // Remove country prefix like +228, +229, etc.
    cleanPhone = cleanPhone.replace(/^00\d{1,4}/, '') // Remove 00 prefix
    
    if (!cleanPhone || cleanPhone.length < 8) {
      return NextResponse.json(
        { error: 'Numéro de téléphone invalide' },
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

    // Generate unique transaction identifier
    const identifier = `PG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // Determine payment method based on network
    const paymentMethod = network === 'MOOV' ? 'moov_money' : 'mixx_by_yas'

    // Create payment record
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId: identifier,
        amount: order.total,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: cleanPhone,
        paymentMethod: paymentMethod,
        operator: network
      }
    })

    // For development/demo without PayGate credentials
    if (!PAYGATE_AUTH_TOKEN || process.env.NODE_ENV === 'development') {
      console.log('🔧 PayGate Demo Mode - Payment initialized:', {
        identifier,
        phone: cleanPhone,
        amount: order.total,
        network
      })
      return NextResponse.json({
        message: 'Mode demo - Paiement simulé',
        demo: true,
        transactionId: identifier,
        tx_reference: identifier,
        network: network,
        phone: cleanPhone
      })
    }

    // Prepare PayGate request - network can be MOOV or TOGOCEL
    const paygateData = new URLSearchParams({
      auth_token: PAYGATE_AUTH_TOKEN,
      phone_number: cleanPhone,
      amount: order.total.toString(),
      identifier: identifier,
      network: network || 'MOOV' // MOOV for Moov Money, TOGOCEL for Mixx by Yas
    })

    try {
      // Call PayGate API
      const response = await fetch(`${PAYGATE_BASE_URL}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: paygateData.toString()
      })

      const result = await response.json()

      if (response.ok && result.status === 0) {
        // Update payment with PayGate data
        await db.payment.update({
          where: { id: payment.id },
          data: {
            paymentToken: result.tx_reference || identifier,
            metadata: JSON.stringify(result)
          }
        })

        return NextResponse.json({
          message: 'Paiement initialisé',
          success: true,
          transactionId: identifier,
          tx_reference: result.tx_reference,
          instructions: 'Vous allez recevoir une demande de confirmation sur votre téléphone.'
        })
      } else {
        // PayGate error
        const errorMessage = getPayGateErrorMessage(result.status || result.error_code)
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            errorMessage: errorMessage
          }
        })

        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        )
      }
    } catch (fetchError) {
      console.error('PayGate fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Erreur de connexion à PayGate' },
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
    const identifier = searchParams.get('identifier')
    const txReference = searchParams.get('tx_reference')

    if (!identifier && !txReference) {
      return NextResponse.json(
        { error: 'ID transaction ou référence requis' },
        { status: 400 }
      )
    }

    // Find payment in database first
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { transactionId: identifier || '' },
          { paymentToken: txReference || '' }
        ]
      },
      include: { order: true }
    })

    if (!payment) {
      return NextResponse.json(
        { error: 'Paiement non trouvé' },
        { status: 404 }
      )
    }

    // If already paid, return from database
    if (payment.status === 'paid') {
      return NextResponse.json({ payment })
    }

    // For demo mode, return database status
    if (!PAYGATE_AUTH_TOKEN || process.env.NODE_ENV === 'development') {
      return NextResponse.json({ payment, demo: true })
    }

    // Check status with PayGate
    const checkData = new URLSearchParams({
      auth_token: PAYGATE_AUTH_TOKEN,
      identifier: payment.transactionId || ''
    })

    const response = await fetch(`${PAYGATE_BASE_URL}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: checkData.toString()
    })

    const result = await response.json()

    if (response.ok && result.status === 0) {
      // Payment successful
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          metadata: JSON.stringify(result)
        }
      })

      await db.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: 'paid',
          status: 'confirmed'
        }
      })

      return NextResponse.json({
        payment: { ...payment, status: 'paid' },
        paid: true
      })
    }

    return NextResponse.json({ payment, result })
  } catch (error) {
    console.error('Get payment error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification du paiement' },
      { status: 500 }
    )
  }
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
