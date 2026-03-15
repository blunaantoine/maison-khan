import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST - Add image to subcategory
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { image, title, link } = body
    
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
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
