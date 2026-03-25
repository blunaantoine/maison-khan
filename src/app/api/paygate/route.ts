import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PayGate Configuration
const PAYGATE_AUTH_TOKEN = process.env.PAYGATE_AUTH_TOKEN || ''
const PAYGATE_BASE_URL = process.env.PAYGATE_BASE_URL || 'https://paygateglobal.com/api/v1'

// Valid network codes according to PayGate documentation
const VALID_NETWORKS = ['FLOOZ', 'TMONEY'] as const
type Network = typeof VALID_NETWORKS[number]

// Helper function for PayGate error messages (for transaction registration)
function getPayGateErrorMessage(code: number): string {
  const messages: Record<number, string> = {
    0: 'Transaction enregistrée avec succès',
    2: 'Jeton d\'authentification invalide - Vérifiez votre clé API PayGate',
    4: 'Paramètres invalides - Vérifiez les données envoyées',
    6: 'Doublon détecté - Une transaction avec le même identifiant existe déjà'
  }
  return messages[code] || `Erreur PayGate (code: ${code})`
}

// Helper function for payment status messages
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
  console.log(`\n${'='.repeat(60)}`)
  console.log(`🔴 [${requestId}] PayGate POST Request - START`)
  console.log(`${'='.repeat(60)}`)

  try {
    const body = await request.json()
    const { orderId, phoneNumber, network } = body

    console.log(`📋 [${requestId}] Request data:`, {
      orderId,
      phoneNumber,
      network,
      hasToken: !!PAYGATE_AUTH_TOKEN,
      tokenPreview: PAYGATE_AUTH_TOKEN ? `${PAYGATE_AUTH_TOKEN.substring(0, 8)}...` : 'none'
    })

    // ========== VALIDATIONS ==========

    if (!orderId) {
      console.log(`❌ [${requestId}] Missing orderId`)
      return NextResponse.json({ 
        success: false,
        error: 'ID commande requis' 
      }, { status: 400 })
    }

    if (!phoneNumber) {
      console.log(`❌ [${requestId}] Missing phone number`)
      return NextResponse.json({ 
        success: false,
        error: 'Numéro de téléphone requis' 
      }, { status: 400 })
    }

    if (!network) {
      console.log(`❌ [${requestId}] Missing network`)
      return NextResponse.json({ 
        success: false,
        error: 'Réseau de paiement requis (FLOOZ ou TMONEY)' 
      }, { status: 400 })
    }

    // Validate network - FLOOZ (Moov Money) or TMONEY (T-Money/Togocel)
    const upperNetwork = network.toUpperCase() as Network
    if (!VALID_NETWORKS.includes(upperNetwork)) {
      console.log(`❌ [${requestId}] Invalid network: ${network}`)
      return NextResponse.json({ 
        success: false,
        error: `Réseau invalide: "${network}". Utilisez FLOOZ (Moov Money) ou TMONEY (T-Money)` 
      }, { status: 400 })
    }

    // Clean phone number - extract only digits
    let cleanPhone = phoneNumber.toString().replace(/[\s\-\(\)\+]/g, '')
    
    // Remove country code if present (+228 for Togo)
    if (cleanPhone.startsWith('228')) {
      cleanPhone = cleanPhone.substring(3)
    }
    
    // Validate phone format (8 digits for Togo)
    const phoneRegex = /^[0-9]{8}$/
    if (!phoneRegex.test(cleanPhone)) {
      console.log(`❌ [${requestId}] Invalid phone format: "${phoneNumber}" -> "${cleanPhone}"`)
      return NextResponse.json({ 
        success: false,
        error: `Numéro invalide: "${cleanPhone}". Format attendu: 8 chiffres (ex: 90123456)` 
      }, { status: 400 })
    }

    console.log(`✅ [${requestId}] Phone validated: ${phoneNumber} -> ${cleanPhone}`)

    // ========== CHECK ORDER ==========

    console.log(`🔍 [${requestId}] Looking up order: ${orderId}`)
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { items: true }
    })

    if (!order) {
      console.log(`❌ [${requestId}] Order not found: ${orderId}`)
      return NextResponse.json({ 
        success: false,
        error: 'Commande non trouvée' 
      }, { status: 404 })
    }

    console.log(`✅ [${requestId}] Order found:`, {
      orderNumber: order.orderNumber,
      total: order.total,
      paymentStatus: order.paymentStatus
    })

    if (order.paymentStatus === 'paid') {
      console.log(`❌ [${requestId}] Order already paid`)
      return NextResponse.json({ 
        success: false,
        error: 'Cette commande est déjà payée' 
      }, { status: 400 })
    }

    const amount = order.total
    if (amount <= 0) {
      console.log(`❌ [${requestId}] Invalid amount: ${amount}`)
      return NextResponse.json({ 
        success: false,
        error: 'Montant invalide - Le total doit être supérieur à 0' 
      }, { status: 400 })
    }

    // ========== CHECK TOKEN ==========

    if (!PAYGATE_AUTH_TOKEN || PAYGATE_AUTH_TOKEN === '') {
      console.log(`⚠️ [${requestId}] PayGate token not configured`)
      
      const identifier = `DEMO-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      await db.payment.create({
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

      return NextResponse.json({
        success: false,
        demo: true,
        error: 'MODE DEMO - PayGate non configuré. Veuillez ajouter votre clé API PayGate dans .env',
        configHelp: 'Ajoutez PAYGATE_AUTH_TOKEN=votre_token dans le fichier .env'
      })
    }

    // ========== CREATE PAYMENT RECORD ==========

    // Generate unique identifier for this transaction
    const identifier = `${order.orderNumber}-${Date.now()}`

    console.log(`📝 [${requestId}] Creating payment record with identifier: ${identifier}`)
    
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

    console.log(`✅ [${requestId}] Payment record created: ${payment.id}`)

    // ========== CALL PAYGATE API ==========

    // Build request body according to PayGate documentation
    const requestBody = new URLSearchParams()
    requestBody.append('auth_token', PAYGATE_AUTH_TOKEN)
    requestBody.append('phone_number', cleanPhone)
    requestBody.append('amount', amount.toString())
    requestBody.append('identifier', identifier)
    requestBody.append('network', upperNetwork)
    requestBody.append('description', `Commande ${order.orderNumber} - MAISON KHAN`)

    const paygateUrl = `${PAYGATE_BASE_URL}/pay`
    
    console.log(`🚀 [${requestId}] Calling PayGate API:`)
    console.log(`   URL: ${paygateUrl}`)
    console.log(`   Phone: ${cleanPhone}`)
    console.log(`   Amount: ${amount} FCFA`)
    console.log(`   Network: ${upperNetwork}`)
    console.log(`   Identifier: ${identifier}`)

    const response = await fetch(paygateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: requestBody.toString()
    })

    const responseText = await response.text()
    console.log(`📥 [${requestId}] PayGate raw response: ${responseText}`)

    let result
    try {
      result = JSON.parse(responseText)
    } catch {
      console.log(`❌ [${requestId}] Failed to parse PayGate response as JSON`)
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          errorMessage: 'Réponse invalide de PayGate'
        }
      })
      return NextResponse.json({ 
        success: false,
        error: 'Réponse invalide de PayGate',
        details: responseText
      }, { status: 500 })
    }

    console.log(`📥 [${requestId}] PayGate parsed response:`, JSON.stringify(result, null, 2))

    // ========== HANDLE PAYGATE RESPONSE ==========
    // Status codes from PayGate:
    // 0 = Transaction registered successfully
    // 2 = Invalid auth token
    // 4 = Invalid parameters
    // 6 = Duplicate detected

    if (response.ok && result.status === 0) {
      console.log(`✅ [${requestId}] PayGate transaction registered successfully!`)
      
      // Update payment with tx_reference from PayGate
      await db.payment.update({
        where: { id: payment.id },
        data: {
          paymentToken: result.tx_reference,
          metadata: JSON.stringify(result)
        }
      })

      console.log(`✅ [${requestId}] Payment flow completed successfully`)
      console.log(`${'='.repeat(60)}\n`)

      return NextResponse.json({
        success: true,
        message: 'Demande de paiement envoyée',
        transactionId: identifier,
        tx_reference: result.tx_reference,
        instructions: `Vous allez recevoir une demande de confirmation sur votre téléphone ${cleanPhone}. Veuillez entrer votre code PIN pour valider le paiement de ${amount} FCFA.`,
        network: upperNetwork === 'FLOOZ' ? 'Moov Money (Flooz)' : 'T-Money (Togocel)',
        amount: amount
      })
    } else {
      // Error from PayGate
      const errorCode = result.status ?? -1
      const errorMessage = getPayGateErrorMessage(errorCode)
      
      console.log(`❌ [${requestId}] PayGate error: ${errorMessage} (code: ${errorCode})`)
      
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: 'failed',
          errorMessage: errorMessage
        }
      })

      console.log(`${'='.repeat(60)}\n`)

      return NextResponse.json({ 
        success: false,
        error: errorMessage,
        errorCode: errorCode,
        details: result
      }, { status: 400 })
    }
  } catch (error) {
    console.error(`❌ [${requestId}] Payment error:`, error)
    console.log(`${'='.repeat(60)}\n`)
    return NextResponse.json({ 
      success: false,
      error: 'Erreur lors de l\'initialisation du paiement',
      details: error instanceof Error ? error.message : String(error)
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
      return NextResponse.json({ 
        success: false,
        error: 'Identifiant ou tx_reference requis' 
      }, { status: 400 })
    }

    // Find payment in database
    const payment = await db.payment.findFirst({
      where: identifier 
        ? { transactionId: identifier }
        : { paymentToken: tx_reference },
      include: { order: true }
    })

    if (!payment) {
      return NextResponse.json({ 
        success: false,
        error: 'Paiement non trouvé' 
      }, { status: 404 })
    }

    // If we have a tx_reference, check status with PayGate
    if (payment.paymentToken && PAYGATE_AUTH_TOKEN) {
      try {
        const statusBody = new URLSearchParams()
        statusBody.append('auth_token', PAYGATE_AUTH_TOKEN)
        statusBody.append('tx_reference', payment.paymentToken)

        const statusResponse = await fetch(`${PAYGATE_BASE_URL}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: statusBody.toString()
        })

        const statusResult = await statusResponse.json()
        console.log('PayGate status check:', statusResult)

        // Payment status codes:
        // 0 = Payment successful
        // 2 = Pending/In progress
        // 4 = Expired
        // 6 = Cancelled

        if (statusResult.status === 0) {
          // Payment confirmed - update database
          await db.payment.update({
            where: { id: payment.id },
            data: {
              status: 'completed',
              paidAt: new Date(),
              metadata: JSON.stringify(statusResult)
            }
          })

          await db.order.update({
            where: { id: payment.orderId },
            data: {
              paymentStatus: 'paid',
              status: 'paid'
            }
          })

          return NextResponse.json({
            success: true,
            status: 'paid',
            message: 'Paiement confirmé',
            payment: { ...payment, status: 'completed' },
            paygateData: statusResult
          })
        } else if (statusResult.status === 2) {
          return NextResponse.json({
            success: true,
            status: 'pending',
            message: 'Paiement en cours',
            payment
          })
        } else {
          const statusMessage = getPaymentStatusMessage(statusResult.status)
          return NextResponse.json({
            success: true,
            status: 'failed',
            message: statusMessage,
            payment,
            paygateData: statusResult
          })
        }
      } catch (statusError) {
        console.error('Error checking PayGate status:', statusError)
      }
    }

    return NextResponse.json({ 
      success: true,
      payment
    })
  } catch (error) {
    console.error('Get payment error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Erreur lors de la vérification du paiement' 
    }, { status: 500 })
  }
}
