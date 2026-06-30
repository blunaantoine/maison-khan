import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

// GET - Fetch all variants for a product
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    
    if (productId) {
      const variants = await db.productVariant.findMany({
        where: { productId, isActive: true },
        orderBy: { order: 'asc' }
      })
      return NextResponse.json(variants)
    }
    
    // Return all variants with product info
    const variants = await db.productVariant.findMany({
      include: { product: true },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(variants)
  } catch (error) {
    console.error('Error fetching variants:', error)
    return NextResponse.json({ error: 'Failed to fetch variants' }, { status: 500 })
  }
}

// POST - Create a new variant
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const body = await request.json()
    const { productId, colorName, colorValue, price, stock, images } = body
    
    // Get max order for this product's variants
    const maxOrder = await db.productVariant.aggregate({
      where: { productId },
      _max: { order: true }
    })
    
    const variant = await db.productVariant.create({
      data: {
        productId,
        colorName,
        colorValue,
        price: price || 0,
        stock: stock || 0,
        images: JSON.stringify(images || []),
        order: (maxOrder._max.order || 0) + 1
      }
    })
    
    // Update product's main image if this is the first variant
    const existingVariants = await db.productVariant.count({
      where: { productId }
    })
    
    if (existingVariants === 1 && images && images.length > 0) {
      await db.product.update({
        where: { id: productId },
        data: { image: images[0] }
      })
    }
    
    return NextResponse.json(variant)
  } catch (error) {
    console.error('Error creating variant:', error)
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 })
  }
}

// PUT - Update a variant
export async function PUT(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const body = await request.json()
    const { id, colorName, colorValue, price, stock, images, isActive } = body
    
    const variant = await db.productVariant.update({
      where: { id },
      data: {
        colorName,
        colorValue,
        price,
        stock,
        images: images ? JSON.stringify(images) : undefined,
        isActive: isActive !== undefined ? isActive : undefined
      }
    })
    
    return NextResponse.json(variant)
  } catch (error) {
    console.error('Error updating variant:', error)
    return NextResponse.json({ error: 'Failed to update variant' }, { status: 500 })
  }
}

// DELETE - Delete a variant
export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    
    await db.productVariant.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting variant:', error)
    return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 })
  }
}
