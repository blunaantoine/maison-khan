import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyPaymentConfirmed, notifyPaymentFailed } from '@/lib/notify'

/**
 * PayGate Callback Endpoint
 * Receives payment confirmations from PayGate
 * 
 * Payment status codes:
 * 0 = Success
 * 2 = Pending
 * 4 = Expired
 * 6 = Cancelled
 */
export async function POST(request: NextRequest) {
  console.log('\n[PayGate Callback] Réception notification')

  try {
    const contentType = request.headers.get('content-type') || ''
    let data: Record<string, string | number> = {}

    if (contentType.includes('application/json')) {
      data = await request.json()
    } else {
      const formData = await request.formData()
      formData.forEach((value, key) => { data[key] = value.toString() })
    }


    const { tx_reference, identifier, payment_reference, amount, datetime, payment_method, phone_number } = data

    // Find payment
    const payment = await db.payment.findFirst({
      where: {
        OR: [
          { transactionId: identifier as string },
          { paymentToken: tx_reference as string }
        ]
      },
      include: { order: true }
    })

    if (!payment) {
      console.log('[PayGate Callback] Paiement non trouvé:', identifier || tx_reference)
      return NextResponse.json({ received: true, error: 'Payment not found' })
    }

    console.log(`[PayGate Callback] Paiement trouvé: ${payment.id}, commande: ${payment.order.orderNumber}`)

    // Le corps du callback n'est PAS authentifié : n'importe qui pourrait
    // envoyer « status: 0 » avec un identifiant connu et marquer une commande
    // payée. On ne croit donc que le statut reconfirmé auprès de l'API PayGate.
    const authToken = process.env.PAYGATE_AUTH_TOKEN
    const baseUrl = process.env.PAYGATE_BASE_URL || 'https://paygateglobal.com/api/v1'
    const reference = payment.paymentToken || (tx_reference as string)
    let verifiedStatus: number | null = null
    if (authToken && reference) {
      try {
        const body = new URLSearchParams()
        body.append('auth_token', authToken)
        body.append('tx_reference', reference)
        const res = await fetch(`${baseUrl}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
          signal: AbortSignal.timeout(10_000),
        })
        const json = await res.json()
        if (typeof json?.status === 'number') verifiedStatus = json.status
      } catch (e) {
        console.error('[PayGate Callback] Vérification impossible:', e)
      }
    }
    if (verifiedStatus === null) {
      console.warn('[PayGate Callback] Statut non vérifiable auprès de PayGate — ignoré')
      return NextResponse.json({ received: true, verified: false })
    }
    const status = verifiedStatus

    // Determine new status
    let newStatus = 'pending'
    let orderStatus = payment.order.status

    switch (status) {
      case 0:
        newStatus = 'completed'
        orderStatus = 'paid'
        console.log('[PayGate Callback] ✅ Paiement CONFIRMÉ')
        break
      case 2:
        newStatus = 'pending'
        console.log('[PayGate Callback] ⏳ Paiement en cours')
        break
      case 4:
        newStatus = 'expired'
        console.log('[PayGate Callback] ⏰ Paiement expiré')
        break
      case 6:
        newStatus = 'cancelled'
        console.log('[PayGate Callback] ❌ Paiement annulé')
        break
    }

    // Update payment
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paymentToken: tx_reference as string,
        paidAt: status === 0 ? new Date() : null,
        metadata: JSON.stringify({ ...data, callbackAt: new Date().toISOString() })
      }
    })

    // Update order if paid
    if (status === 0) {
      await db.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'paid', status: 'paid' }
      })
      console.log(`[PayGate Callback] Commande ${payment.order.orderNumber} marquée PAYÉE`)
      console.log(`  Référence: ${payment_reference}`)
      console.log(`  Montant: ${amount} FCFA`)
      console.log(`  Téléphone: ${phone_number}`)
      console.log(`  Méthode: ${payment_method}`)

      // Notification admin + reçu de paiement par email au client
      const paidOrder = await db.order.findUnique({
        where: { id: payment.orderId },
        include: { items: true },
      })
      if (paidOrder) await notifyPaymentConfirmed(paidOrder)
    } else if (status === 4 || status === 6) {
      // Expiré (4) ou annulé (6) → notification admin
      const failedOrder = await db.order.findUnique({
        where: { id: payment.orderId },
        include: { items: true },
      })
      if (failedOrder) {
        await notifyPaymentFailed(failedOrder, status === 6 ? 'cancelled' : 'failed')
      }
    }

    // Always return 200 to prevent retries
    return NextResponse.json({ received: true, status: newStatus })

  } catch (error) {
    console.error('[PayGate Callback] Erreur:', error)
    return NextResponse.json({ received: true })
  }
}

// GET - Test endpoint
export async function GET() {
  return NextResponse.json({ 
    endpoint: 'PayGate Callback',
    status: 'active',
    expectedFields: ['tx_reference', 'identifier', 'payment_reference', 'amount', 'datetime', 'payment_method', 'phone_number', 'status']
  })
}
