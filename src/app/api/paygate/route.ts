import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PayGate Configuration
const PAYGATE_AUTH_TOKEN = process.env.PAYGATE_AUTH_TOKEN || ''
const PAYGATE_BASE_URL = process.env.PAYGATE_BASE_URL || 'https://paygateglobal.com/api/v1'

// Valid network codes according to PayGate documentation
const VALID_NETWORKS = ['FLOOZ', 'TMONEY'] as const
type Network = typeof VALID_NETWORKS[number]

// PayGate error codes for transaction registration
function getPayGateErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    0: 'Transaction enregistrée avec succès',
    2: 'Jeton d\'authentification invalide - Vérifiez votre clé API PayGate',
    4: 'Paramètres invalides - Vérifiez les données envoyées',
    6: 'Doublon détecté - Une transaction avec le même identifiant existe déjà'
  }
  return messages[code] || `Erreur PayGate (code: ${code})`
}

// PayGate payment status codes
function getPaymentStatusMessage(status: number): string {
  const messages: Record<number, string> = {
    0: 'Paiement réussi',
    2: 'Paiement en cours de traitement',
    4: 'Transaction expirée',
    6: 'Transaction annulée'
  }
  return messages[status] || `Statut inconnu (${status})`
}

// POST - Initialize payment
export async function POST(request: NextRequest) {
  const requestId = `REQ-${Date.now()}`
  console.log(`\n${'='.repeat(50)}`)
  console.log(`[PayGate] ${requestId} - Demande de paiement`)

  try {
    const body = await request.json()
    const { orderId, phoneNumber, network } = body

    console.log(`[${requestId}] orderId: ${orderId}, phone: ${phoneNumber}, network: ${network}`)

    // Validations
    if (!orderId) {
      return NextResponse.json({ success: false, error: 'ID commande requis' }, { status: 400 })
    }

    if (!phoneNumber) {
      return NextResponse.json({ success: false, error: 'Numéro de téléphone requis' }, { status: 400 })
    }

    if (!network) {
      return NextResponse.json({ success: false, error: 'Réseau requis (FLOOZ ou TMONEY)' }, { status: 400 })
    }

    // Validate network
    const upperNetwork = network.toUpperCase() as Network
    if (!VALID_NETWORKS.includes(upperNetwork)) {
      return NextResponse.json({ 
        success: false, 
        error: `Réseau invalide. Utilisez FLOOZ (Moov Money) ou TMONEY (T-Money)` 
      }, { status: 400 })
    }

    // Clean and validate phone number
    let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '')
    if (cleanPhone.startsWith('228')) {
      cleanPhone = cleanPhone.substring(3)
    }
    
    if (!/^[0-9]{8}$/.test(cleanPhone)) {
      return NextResponse.json({ 
        success: false, 
        error: `Numéro invalide. Format attendu: 8 chiffres (ex: 90123456)` 
      }, { status: 400 })
    }

    // Check PayGate token
    if (!PAYGATE_AUTH_TOKEN) {
      console.log(`[${requestId}] ERREUR: Token PayGate non configuré`)
      return NextResponse.json({ 
        success: false, 
        error: 'Configuration PayGate manquante. Contactez l\'administrateur.' 
      }, { status: 500 })
    }

    // Find order
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })

    if (!order) {
      return NextResponse.json({ success: false, error: 'Commande non trouvée' }, { status: 404 })
    }

    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ success: false, error: 'Cette commande est déjà payée' }, { status: 400 })
    }

    const amount = order.total
    if (amount <= 0) {
      return NextResponse.json({ success: false, error: 'Montant invalide' }, { status: 400 })
    }

    // Generate unique identifier
    const identifier = `${order.orderNumber}-${Date.now()}`

    // Create payment record
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId: identifier,
        amount: amount,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: cleanPhone,
        paymentMethod: upperNetwork === 'FLOOZ' ? 'moov_money' : 't_money',
        operator: upperNetwork
      }
    })

    console.log(`[${requestId}] Payment record created: ${payment.id}`)

    // Call PayGate API
    const formData = new URLSearchParams()
    formData.append('auth_token', PAYGATE_AUTH_TOKEN)
    formData.append('phone_number', cleanPhone)
    formData.append('amount', amount.toString())
    formData.append('identifier', identifier)
    formData.append('network', upperNetwork)
    formData.append('description', `Commande ${order.orderNumber} - MAISON KHAN`)

    console.log(`[${requestId}] Appel PayGate: phone=${cleanPhone}, amount=${amount}, network=${upperNetwork}`)

    const response = await fetch(`${PAYGATE_BASE_URL}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString()
    })

    const result = await response.json()
    console.log(`[${requestId}] Réponse PayGate:`, result)

    // Handle response
    if (response.ok && result.status === 0) {
      // Success
      await db.payment.update({
        where: { id: payment.id },
        data: { paymentToken: result.tx_reference, metadata: JSON.stringify(result) }
      })

      console.log(`[${requestId}] ✅ Succès! tx_reference: ${result.tx_reference}`)
      console.log(`${'='.repeat(50)}\n`)

      return NextResponse.json({
        success: true,
        message: 'Demande de paiement envoyée',
        transactionId: identifier,
        tx_reference: result.tx_reference,
        instructions: `Vous allez recevoir une demande de confirmation sur le ${cleanPhone}. Entrez votre code PIN pour valider.`,
        network: upperNetwork === 'FLOOZ' ? 'Moov Money (Flooz)' : 'T-Money (Togocel)',
        amount: amount
      })
    } else {
      // Error
      const errorCode = result.status ?? -1
      const errorMessage = getPayGateErrorMessage(errorCode)
      
      await db.payment.update({
        where: { id: payment.id },
        data: { status: 'failed', errorMessage: errorMessage }
      })

      console.log(`[${requestId}] ❌ Erreur: ${errorMessage}`)
      console.log(`${'='.repeat(50)}\n`)

      return NextResponse.json({ 
        success: false, 
        error: errorMessage, 
        errorCode 
      }, { status: 400 })
    }
  } catch (error) {
    console.error(`[${requestId}] Erreur:`, error)
    return NextResponse.json({ 
      success: false, 
      error: 'Erreur lors de l\'initialisation du paiement' 
    }, { status: 500 })
  }
}

// GET - Check payment status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identifier = searchParams.get('identifier')
    const tx_reference = searchParams.get('tx_reference')

    if (!identifier && !tx_reference) {
      return NextResponse.json({ success: false, error: 'Identifiant requis' }, { status: 400 })
    }

    const payment = await db.payment.findFirst({
      where: identifier 
        ? { transactionId: identifier }
        : { paymentToken: tx_reference },
      include: { order: true }
    })

    if (!payment) {
      return NextResponse.json({ success: false, error: 'Paiement non trouvé' }, { status: 404 })
    }

    // Check status with PayGate if we have a token
    if (payment.paymentToken && PAYGATE_AUTH_TOKEN) {
      const statusBody = new URLSearchParams()
      statusBody.append('auth_token', PAYGATE_AUTH_TOKEN)
      statusBody.append('tx_reference', payment.paymentToken)

      const statusResponse = await fetch(`${PAYGATE_BASE_URL}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: statusBody.toString()
      })

      const statusResult = await statusResponse.json()
      console.log('PayGate status:', statusResult)

      if (statusResult.status === 0) {
        // Payment confirmed
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'completed', paidAt: new Date(), metadata: JSON.stringify(statusResult) }
        })

        await db.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'paid', status: 'paid' }
        })

        return NextResponse.json({
          success: true,
          status: 'paid',
          message: 'Paiement confirmé',
          payment
        })
      }
    }

    return NextResponse.json({ success: true, payment })
  } catch (error) {
    console.error('Get payment error:', error)
    return NextResponse.json({ success: false, error: 'Erreur' }, { status: 500 })
  }
}
