import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PayGate Configuration
const PAYGATE_AUTH_TOKEN = process.env.PAYGATE_AUTH_TOKEN || ''
const PAYGATE_BASE_URL = process.env.PAYGATE_BASE_URL || 'https://paygateglobal.com/api/v1'

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

// POST - Initialize payment (Étape 1 et 2)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { orderId, phoneNumber, network } = body

    console.log('🔴 PayGate POST Request:', { orderId, phoneNumber, network, hasToken: !!PAYGATE_AUTH_TOKEN })

    // Validation des données obligatoires
    if (!orderId) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Numéro de téléphone requis' },
        { status: 400 }
      )
    }

    if (!network) {
      return NextResponse.json(
        { error: 'Réseau de paiement requis (FLOOZ ou MIXX)' },
        { status: 400 }
      )
    }

    // Nettoyer le numéro de téléphone - format local 8 chiffres
    let cleanPhone = phoneNumber.replace(/[\s\-\(\)]/g, '')
    
    if (cleanPhone.startsWith('+228')) {
      cleanPhone = cleanPhone.substring(4)
    } else if (cleanPhone.startsWith('228')) {
      cleanPhone = cleanPhone.substring(3)
    }
    
    const phoneRegex = /^[0-9]{8}$/
    if (!phoneRegex.test(cleanPhone)) {
      console.log('🔴 Invalid phone format:', cleanPhone)
      return NextResponse.json(
        { error: `Numéro de téléphone invalide: ${cleanPhone}. Format attendu: 8 chiffres` },
        { status: 400 }
      )
    }

    console.log('✅ Phone cleaned:', phoneNumber, '->', cleanPhone)

    // 🟢 Étape 1: Vérifier que la commande existe
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

    // 🟢 Étape 1: Vérifier le montant côté backend (SÉCURITÉ)
    const amount = order.total
    if (amount <= 0) {
      return NextResponse.json(
        { error: 'Montant invalide' },
        { status: 400 }
      )
    }

    // Générer un identifiant unique pour la transaction
    const identifier = `PG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    // 🟢 Enregistrer la transaction en base AVANT d'appeler PayGate
    const payment = await db.payment.create({
      data: {
        orderId: order.id,
        transactionId: identifier,
        amount: amount,
        currency: 'XOF',
        status: 'pending',
        phoneNumber: cleanPhone,
        paymentMethod: network === 'FLOOZ' ? 'moov_money' : 'mixx_by_yas',
        operator: network
      }
    })

    console.log('✅ Payment record created:', payment.id)

    // Si pas de token, mode démo
    if (!PAYGATE_AUTH_TOKEN) {
      console.log('⚠️ PayGate: No auth token configured, using demo mode')
      return NextResponse.json({
        message: 'Mode demo - PayGate non configuré',
        demo: true,
        transactionId: identifier,
        tx_reference: identifier,
        network: network,
        phone: cleanPhone
      })
    }

    // 🟢 Étape 2: Appel API PayGate (depuis le backend)
    // Définir les URLs de callback et retour
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maison-khan.com'
    const callbackUrl = `${baseUrl}/api/paygate/callback`
    const returnUrl = `${baseUrl}/payment-success`

    // Préparer les données pour PayGate
    const paygateData = {
      amount: amount.toString(),
      phone_number: cleanPhone,
      network: network, // FLOOZ ou MIXX
      identifier: identifier,
      callback_url: callbackUrl,
      return_url: returnUrl
    }

    console.log('🚀 Calling PayGate API:', {
      url: `${PAYGATE_BASE_URL}/pay`,
      phone: cleanPhone,
      amount: amount,
      network,
      identifier,
      callback_url: callbackUrl
    })

    try {
      const response = await fetch(`${PAYGATE_BASE_URL}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${PAYGATE_AUTH_TOKEN}`
        },
        body: JSON.stringify(paygateData)
      })

      const result = await response.json()
      console.log('📥 PayGate Response:', { status: response.status, result })

      if (response.ok && result.status === 0) {
        // 🟢 Mettre à jour le paiement avec les données PayGate
        await db.payment.update({
          where: { id: payment.id },
          data: {
            paymentToken: result.tx_reference || identifier,
            metadata: JSON.stringify(result)
          }
        })

        console.log('✅ PayGate Payment Success:', result.tx_reference)

        return NextResponse.json({
          message: 'Paiement initialisé',
          success: true,
          transactionId: identifier,
          tx_reference: result.tx_reference,
          instructions: 'Vous allez recevoir une demande de confirmation sur votre téléphone.'
        })
      } else {
        // Erreur PayGate
        const errorCode = result.status || result.error_code
        const errorMessage = getPayGateErrorMessage(errorCode)
        console.log('❌ PayGate Error:', { errorCode, errorMessage, result })
        
        await db.payment.update({
          where: { id: payment.id },
          data: {
            status: 'failed',
            errorMessage: errorMessage
          }
        })

        return NextResponse.json(
          { error: errorMessage, details: result },
          { status: 400 }
        )
      }
    } catch (fetchError) {
      console.error('❌ PayGate fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Erreur de connexion à PayGate', details: String(fetchError) },
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

// GET - Vérifier le statut d'un paiement (pour polling)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const identifier = searchParams.get('identifier')

    if (!identifier) {
      return NextResponse.json(
        { error: 'ID transaction requis' },
        { status: 400 }
      )
    }

    // Trouver le paiement dans la base
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { transactionId: identifier },
          { paymentToken: identifier }
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

    return NextResponse.json({ payment })
  } catch (error) {
    console.error('Get payment error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la vérification du paiement' },
      { status: 500 }
    )
  }
}
