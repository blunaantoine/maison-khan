import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

// Écriture réservée aux administrateurs (la route n'était pas protégée)
async function isAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  return Boolean(user && user.role === 'admin')
}


// POST - Add image to subcategory
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdmin(request))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }
    const { id } = await params
    const body = await request.json()
    const { image, title, link } = body
    if (typeof id !== 'string' || typeof image !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }
    
    // Get max order
    const maxOrder = await db.menuImage.aggregate({
      where: { subCategoryId: id },
      _max: { order: true }
    })
    
    const menuImage = await db.menuImage.create({
      data: {
        subCategoryId: id,
        image,
        title: title || null,
        link: link || null,
        order: (maxOrder._max.order || 0) + 1
      }
    })
    
    return NextResponse.json(menuImage)
  } catch (error) {
    console.error('Error adding menu image:', error)
    return NextResponse.json({ error: 'Failed to add image' }, { status: 500 })
  }
}

// DELETE - Remove image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!(await isAdmin(request))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const imageId = searchParams.get('imageId')
    
    if (!imageId) {
      return NextResponse.json({ error: 'Image ID required' }, { status: 400 })
    }
    
    await db.menuImage.delete({
      where: { id: imageId }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting menu image:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
