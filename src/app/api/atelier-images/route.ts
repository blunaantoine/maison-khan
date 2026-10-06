import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

/**
 * Images de l'atelier (production artisanale) — carrousels accueil + à propos.
 *
 * GET  (public)            : images actives, ordonnées.
 * POST (admin / manager)   : ajoute une image (data URL base64 compressée
 *                             côté admin, pattern identique au Hero Slider)
 *                             + légende optionnelle.
 */

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) return null
  return user
}

// GET - Images actives pour les carrousels (accueil + à propos)
export async function GET() {
  try {
    const images = await db.atelierImage.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })
    return NextResponse.json(images)
  } catch (error) {
    console.error('Error fetching atelier images:', error)
    return NextResponse.json({ error: 'Failed to fetch atelier images' }, { status: 500 })
  }
}

// POST - Ajouter une image d'atelier
export async function POST(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const body = await request.json()
    const { image, caption } = body

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image requise' }, { status: 400 })
    }

    const maxOrder = await db.atelierImage.aggregate({
      _max: { order: true }
    })

    const created = await db.atelierImage.create({
      data: {
        image,
        caption: caption && typeof caption === 'string' ? caption.trim().slice(0, 120) || null : null,
        order: (maxOrder._max.order || 0) + 1
      }
    })

    return NextResponse.json(created)
  } catch (error) {
    console.error('Error creating atelier image:', error)
    return NextResponse.json({ error: 'Failed to create atelier image' }, { status: 500 })
  }
}
