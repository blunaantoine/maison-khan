import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHash } from 'crypto'
import { notifyPaymentConfirmed, notifyPaymentFailed } from '@/lib/notify'

const PAYDUNYA_MASTER_KEY  = process.env.PAYDUNYA_MASTER_KEY  || ''
const PAYDUNYA_PRIVATE_KEY = process.env.PAYDUNYA_PRIVATE_KEY || ''
const PAYDUNYA_TOKEN = process.env.PAYDUNYA_TOKEN || ''
const PAYDUNYA_MODE = process.env.PAYDUNYA_MODE || 'test'

const PAYDUNYA_BASE_URL =
  PAYDUNYA_MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1'

async function decrementStock(orderId: string, orderNumber: string) {
  try {
    const orderItems = await db.orderItem.findMany({ where: { orderId } })

    for (const item of orderItems) {
      if (!item.productId || !item.colorName) continue

      const productColor = await db.productColor.findFirst({
        where: { productId: item.productId, colorName: item.colorName }
      })
      if (!productColor) continue

      const sizes = JSON.parse(productColor.sizes) as { size: string; price: number; stock: number }[]
      const updatedSizes = sizes.map(s => {
        if (s.size === item.size) {
          const newStock = Math.max(0, s.stock - item.quantity)
          return { ...s, stock: newStock }
        }
        return s
      })

      await db.productColor.update({
        where: { id: productColor.id },
        data: { sizes: JSON.stringify(updatedSizes) }
      })
    }
  } catch (e) {
    console.error('[Stock]  Erreur décrémentation:', e)
  }
}

async function releaseStock(orderId: string, orderNumber: string) {
  try {
    const orderItems = await db.orderItem.findMany({ where: { orderId } })

    for (const item of orderItems) {
      if (!item.productId || !item.colorName) continue

      const productColor = await db.productColor.findFirst({
        where: { productId: item.productId, colorName: item.colorName }
      })
      if (!productColor) continue

      const sizes = JSON.parse(productColor.sizes) as { size: string; price: number; stock: number }[]
      const updatedSizes = sizes.map(s => {
        if (s.size === item.size) {
          const newStock = s.stock + item.quantity
          return { ...s, stock: newStock }
        }
        return s
      })

      await db.productColor.update({
        where: { id: productColor.id },
        data: { sizes: JSON.stringify(updatedSizes) }
      })
    }
  } catch (e) {
    console.error('[Stock]  Erreur libération stock:', e)
  }
}

export async function POST(request: NextRequest) {

  try {
    const contentType = request.headers.get('content-type') || ''
    let body: any = {}

    if (contentType.includes('application/json')) {
      body = await request.json()
    } else {
      const text = await request.text()
      console.log('[PayDunya Callback] Raw body:', text)
      const params = new URLSearchParams(text)
      params.forEach((value, key) => { body[key] = value })
    }

    const hash    = body?.['data[hash]']
    const token   = body?.['data[invoice][token]']
    const status  = body?.['data[status]']
    const orderId = body?.['data[custom_data][order_id]']

    const expectedHash = createHash('sha512').update(PAYDUNYA_MASTER_KEY).digest('hex')
    if (hash !== expectedHash) {
      console.warn('[Callback] Hash invalide — requête non PayDunya')
      return NextResponse.json({ received: false }, { status: 403 })
    }

    if (!token) {
      console.warn('[PayDunya Callback] Token manquant')
      return NextResponse.json({ received: true, error: 'token manquant' })
    }

    const confirmRes = await fetch(`${PAYDUNYA_BASE_URL}/checkout-invoice/confirm/${token}`, {
      method: 'GET',
      headers: {
        'PAYDUNYA-MASTER-KEY': PAYDUNYA_MASTER_KEY,
        'PAYDUNYA-PRIVATE-KEY': PAYDUNYA_PRIVATE_KEY,
        'PAYDUNYA-TOKEN': PAYDUNYA_TOKEN
      }
    })
    const invoice = await confirmRes.json()
    const payment = await db.payment.findFirst({
      where: { transactionId: token },
      include: { order: true }
    })

    if (!payment) {
      console.warn('[PayDunya Callback] Payment non trouvé pour token:', token)
      if (orderId && status === 'completed') {
        await db.order.update({
          where: { id: orderId },
          data: { paymentStatus: 'paid', status: 'paid' }
        })
        await decrementStock(orderId, orderId)
      }
      return NextResponse.json({ received: true })
    }

    if (payment.status === 'completed') {
      return NextResponse.json({ received: true, status: 'already_processed' })
    }

    let newStatus = 'pending'
    switch (status) {
      case 'completed': newStatus = 'completed'; break
      case 'cancelled': newStatus = 'cancelled'; break
      case 'failed': newStatus = 'failed'; break
    }

    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        paidAt: status === 'completed' ? new Date() : null,
        metadata: JSON.stringify({ ...body, callbackAt: new Date().toISOString() })
      }
    })

    if (status === 'completed') {

      // Notification admin + reçu de paiement par email au client
      const paidOrder = await db.order.findUnique({
        where: { id: payment.orderId },
        include: { items: true },
      })
      if (paidOrder) await notifyPaymentConfirmed(paidOrder)

      await db.$transaction(async (tx) => {

        const orderItems = await tx.orderItem.findMany({
          where: { orderId: payment.orderId }
        })

        for (const item of orderItems) {
          if (!item.productId || !item.colorName) continue

          const productColor = await tx.productColor.findFirst({
            where: { productId: item.productId, colorName: item.colorName }
          })
          if (!productColor) continue

          const sizes = JSON.parse(productColor.sizes) as { size: string; price: number; stock: number }[]
          const sizeInfo = sizes.find(s => s.size === item.size)

          if (!sizeInfo || sizeInfo.stock < item.quantity) {
            throw new Error(`Stock insuffisant pour ${item.productName} taille ${item.size}`)
          }

          const updatedSizes = sizes.map(s =>
            s.size === item.size
              ? { ...s, stock: Math.max(0, s.stock - item.quantity) }
              : s
          )

          await tx.productColor.update({
            where: { id: productColor.id },
            data: { sizes: JSON.stringify(updatedSizes) }
          })
        }

        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'paid', status: 'paid' }
        })
      })

    } else if (status === 'cancelled' || status === 'failed') {

      // Statut de commande dans le vocabulaire de l'app :
      // 'payment_failed' (badge rouge + bouton « Réessayer le paiement » du
      // tableau de bord client) ou 'cancelled'. L'ancien code écrivait 'failed',
      // statut inconnu de l'interface → aucun badge ni bouton affiché.
      await db.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus: status,
          status: status === 'failed' ? 'payment_failed' : 'cancelled',
        },
      })

      // Notification admin (échec/annulation)
      const failedOrder = await db.order.findUnique({
        where: { id: payment.orderId },
        include: { items: true },
      })
      if (failedOrder) await notifyPaymentFailed(failedOrder, status === 'failed' ? 'failed' : 'cancelled')

    }

    return NextResponse.json({ received: true, status: newStatus })

  } catch (error) {
    console.error('[PayDunya Callback] Erreur:', error)
    return NextResponse.json({ received: true })
  }
}

export async function GET() {
  return NextResponse.json({ endpoint: 'PayDunya IPN Callback', status: 'active' })
}