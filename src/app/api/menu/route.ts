import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Fetch menu categories with subcategories and images
export async function GET() {
  try {
    const categories = await db.menuCategory.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: { order: 'asc' },
          include: {
            images: {
              where: { isActive: true },
              orderBy: { order: 'asc' }
            }
          }
        }
      }
    })
    
    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching menu:', error)
    return NextResponse.json({ error: 'Failed to fetch menu' }, { status: 500 })
  }
}

// POST - Create a menu category
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, slug, subCategories } = body
    
    const category = await db.menuCategory.create({
      data: {
        name,
        slug,
        subCategories: {
          create: subCategories?.map((sub: { name: string; slug: string }) => ({
            name: sub.name,
            slug: sub.slug
          })) || []
        }
      },
      include: {
        subCategories: {
          include: {
            images: true
          }
        }
      }
    })
    
    return NextResponse.json(category)
  } catch (error) {
    console.error('Error creating menu category:', error)
    return NextResponse.json({ error: 'Failed to create menu category' }, { status: 500 })
  }
}
