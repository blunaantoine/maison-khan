import { NextResponse } from 'next/server'
import { getEmailLogs, getFailedEmails, sendOutOfStockNotification } from '@/lib/email'
import { db } from '@/lib/db'

// GET - Récupérer les logs d'emails
export async function GET() {
  try {
    const logs = getEmailLogs()
    const failedEmails = getFailedEmails()
    
    return NextResponse.json({
      logs,
      failedCount: failedEmails.length,
      totalCount: logs.length
    })
  } catch (error) {
    console.error('Error fetching email logs:', error)
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 })
  }
}

// POST - Retenter l'envoi d'un email échoué
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { productId, productName, category, previousStock } = body
    
    if (!productId || !productName || !category) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Récupérer le produit actuel
    const product = await db.product.findUnique({
      where: { id: productId }
    })
    
    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }
    
    // Retenter l'envoi
    const success = await sendOutOfStockNotification(
      productName,
      productId,
      previousStock || product.stock,
      category
    )
    
    if (success) {
      return NextResponse.json({ success: true, message: 'Email envoyé avec succès' })
    } else {
      return NextResponse.json({ success: false, message: 'Échec de l\'envoi' }, { status: 500 })
    }
  } catch (error) {
    console.error('Error retrying email:', error)
    return NextResponse.json({ error: 'Failed to retry email' }, { status: 500 })
  }
}
