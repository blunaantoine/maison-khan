import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

// GET - Récupérer tout le contenu ou par catégorie
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    
    const where = category ? { category } : {}
    
    const contents = await db.siteContent.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }]
    })
    
    return NextResponse.json(contents)
  } catch (error) {
    console.error('Error fetching content:', error)
    return NextResponse.json({ error: 'Erreur lors de la récupération du contenu' }, { status: 500 })
  }
}

// POST - Créer ou mettre à jour du contenu
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const body = await request.json()
    const { key, value, description, category } = body
    
    if (!key || value === undefined) {
      return NextResponse.json({ error: 'Key et value sont requis' }, { status: 400 })
    }
    
    const content = await db.siteContent.upsert({
      where: { key },
      update: { value, description, category: category || 'general' },
      create: { key, value, description, category: category || 'general' }
    })
    
    return NextResponse.json(content)
  } catch (error) {
    console.error('Error saving content:', error)
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde du contenu' }, { status: 500 })
  }
}

// DELETE - Supprimer du contenu
export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    
    if (!key) {
      return NextResponse.json({ error: 'Key est requis' }, { status: 400 })
    }
    
    await db.siteContent.delete({
      where: { key }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting content:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression du contenu' }, { status: 500 })
  }
}
