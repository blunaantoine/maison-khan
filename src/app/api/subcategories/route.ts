import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Fetch all subcategories grouped by category
export async function GET() {
  try {
    const categories = await db.menuCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    })
    
    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching subcategories:', error)
    return NextResponse.json({ error: 'Failed to fetch subcategories' }, { status: 500 })
  }
}

// POST - Create a new subcategory
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, slug, menuCategoryId, genre } = body
    
    // Get max order for this category
    const maxOrder = await db.subCategory.aggregate({
      where: { menuCategoryId },
      _max: { order: true }
    })
    
    const subCategory = await db.subCategory.create({
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        menuCategoryId,
        genre: genre || 'all',
        order: (maxOrder._max.order || 0) + 1,
        isActive: true
      }
    })
    
    return NextResponse.json(subCategory)
  } catch (error) {
    console.error('Error creating subcategory:', error)
    return NextResponse.json({ error: 'Failed to create subcategory' }, { status: 500 })
  }
}

// DELETE - Delete a subcategory
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }
    
    await db.subCategory.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting subcategory:', error)
    return NextResponse.json({ error: 'Failed to delete subcategory' }, { status: 500 })
  }
}

// PUT - Update a subcategory
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, slug, isActive, genre } = body
    
    const subCategory = await db.subCategory.update({
      where: { id },
      data: {
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
        genre: genre || 'all',
        isActive: isActive !== undefined ? isActive : true
      }
    })
    
    return NextResponse.json(subCategory)
  } catch (error) {
    console.error('Error updating subcategory:', error)
    return NextResponse.json({ error: 'Failed to update subcategory' }, { status: 500 })
  }
}
