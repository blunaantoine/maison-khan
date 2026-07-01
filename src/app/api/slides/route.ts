import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || user.role !== 'admin') return null
  return user
}

// GET - Fetch all hero slides
export async function GET() {
  try {
    const slides = await db.heroSlide.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })
    
    return NextResponse.json(slides)
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
    
    // Get the max order
    const maxOrder = await db.heroSlide.aggregate({
      _max: { order: true }
    })
    
    const slide = await db.heroSlide.create({
      data: {
        image,
        type: type || 'image',
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
