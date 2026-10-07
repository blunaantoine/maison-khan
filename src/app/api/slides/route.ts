import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || user.role !== 'admin') return null
  return user
}

/**
 * Garde-fou vidéos du hero : ~9 Mo de binaire une fois le base64 décodé
 * (le base64 occupe ≈ 4/3 de la taille du fichier). Au-delà, la vidéo est
 * refusée — une vidéo lourde ralentirait la boutique pour tous les visiteurs.
 */
const MAX_VIDEO_BASE64_LENGTH = 12 * 1024 * 1024

// GET - Fetch all hero slides
// Les slides vidéo sont renvoyées SANS leur base64 (trop lourd pour le JSON
// de la page d'accueil) : le champ `videoUrl` pointe vers la route média qui
// sert la vidéo en streaming (/api/slides/{id}/media).
export async function GET() {
  try {
    const slides = await db.heroSlide.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })

    return NextResponse.json(
      slides.map((s) =>
        s.type === 'video' && s.image && s.image.startsWith('data:video/')
          ? { ...s, image: null, videoUrl: `/api/slides/${s.id}/media?v=${s.updatedAt.getTime()}` }
          : { ...s, videoUrl: null }
      )
    )
  } catch (error) {
    console.error('Error fetching slides:', error)
    return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
  }
}

// POST - Create a new hero slide
export async function POST(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const body = await request.json()
    const { image, type, title, subtitle, link, interval } = body
    const slideType = type === 'video' ? 'video' : 'image'

    // ── Validation du média (avant tout enregistrement) ──
    if (typeof image !== 'string' || image.length === 0) {
      return NextResponse.json({ error: 'Média requis' }, { status: 400 })
    }
    if (slideType === 'video') {
      if (!image.startsWith('data:video/')) {
        return NextResponse.json({ error: 'Vidéo invalide — utilisez un fichier MP4 ou WebM' }, { status: 400 })
      }
      if (image.length > MAX_VIDEO_BASE64_LENGTH) {
        return NextResponse.json({ error: 'Vidéo trop lourde — 9 Mo maximum' }, { status: 400 })
      }
    } else if (!image.startsWith('data:image/') && !image.startsWith('http')) {
      return NextResponse.json({ error: 'Image invalide' }, { status: 400 })
    }
    
    // Get the max order
    const maxOrder = await db.heroSlide.aggregate({
      _max: { order: true }
    })
    
    const slide = await db.heroSlide.create({
      data: {
        image,
        type: slideType,
        title: title || null,
        subtitle: subtitle || null,
        link: link || null,
        interval: interval || 5000,
        order: (maxOrder._max.order || 0) + 1
      }
    })
    
    return NextResponse.json(slide)
  } catch (error) {
    console.error('Error creating slide:', error)
    return NextResponse.json({ error: 'Failed to create slide' }, { status: 500 })
  }
}
