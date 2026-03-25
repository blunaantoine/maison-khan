// API Products - Simplified with ProductColor (image + color)
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Fetch all products with colors
export async function GET() {
  try {
    const products = await db.product.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        colors: {
          orderBy: { order: 'asc' }
        }
      }
    })
    
    // Parse JSON fields and calculate min price
    const productsWithParsedData = products.map(p => {
      let minPrice = Infinity
      let totalStock = 0
      
      const colors = p.colors.map(c => {
        const images = JSON.parse(c.images || '[]')
        const sizes = JSON.parse(c.sizes || '[]')
        
        sizes.forEach((s: { price: number; stock: number }) => {
          if (s.price > 0 && s.price < minPrice) {
            minPrice = s.price
          }
          totalStock += s.stock || 0
        })
        
        return {
          ...c,
          images,
          sizes
        }
      })
      
      return {
        ...p,
        sizes: JSON.parse(p.sizes),
        minPrice: minPrice === Infinity ? 0 : minPrice,
        totalStock,
        colors
      }
    })
    
    return NextResponse.json(productsWithParsedData)
  } catch (error) {
    console.error('Error fetching products:', error)
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
  }
}

// POST - Create a new product with colors
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, category, subCategory, genre, image, sizes, type, isBestSeller, isNew, colors } = body
    
    console.log('[PRODUCT] Creating product:', { name, category, colorsCount: colors?.length })
    
    const result = await db.$transaction(async (tx) => {
      // 1. Create the product
      const product = await tx.product.create({
        data: {
          name,
          description: description || null,
          category,
          subCategory: subCategory || null,
          genre: genre || 'femme',
          image: image || (colors?.[0]?.images?.[0] || ''),
          sizes: JSON.stringify(sizes || []),
          type: type || 'chaussure',
          isBestSeller: isBestSeller ?? false,
          isNew: isNew ?? true
        }
      })
      
      // 2. Create colors with images and sizes
      if (colors && colors.length > 0) {
        for (let i = 0; i < colors.length; i++) {
          const color = colors[i]
          
          await tx.productColor.create({
            data: {
              productId: product.id,
              colorName: color.colorName,
              colorValue: color.colorValue,
              images: JSON.stringify(color.images || []),
              sizes: JSON.stringify(color.sizes || []),
              order: i
            }
          })
          
          console.log('[PRODUCT] Color created:', color.colorName, 'with', color.images?.length, 'images')
        }
      }
      
      // Fetch complete product
      return await tx.product.findUnique({
        where: { id: product.id },
        include: {
          colors: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })
    
    console.log('[PRODUCT] Product created successfully:', result?.id)
    
    // Calculate min price for response
    let minPrice = Infinity
    result?.colors.forEach(c => {
      const sizes = JSON.parse(c.sizes || '[]')
      sizes.forEach((s: { price: number }) => {
        if (s.price > 0 && s.price < minPrice) {
          minPrice = s.price
        }
      })
    })
    
    return NextResponse.json({
      ...result,
      sizes: JSON.parse(result?.sizes || '[]'),
      minPrice: minPrice === Infinity ? 0 : minPrice,
      colors: result?.colors.map(c => ({
        ...c,
        images: JSON.parse(c.images || '[]'),
        sizes: JSON.parse(c.sizes || '[]')
      }))
    })
  } catch (error) {
    console.error('[PRODUCT] Error creating product:', error)
    return NextResponse.json({ error: 'Failed to create product', details: String(error) }, { status: 500 })
  }
}

// PUT - Update a product with colors
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { id, name, description, category, subCategory, genre, image, sizes, type, isActive, isBestSeller, isNew, colors } = body
    
    console.log('[PRODUCT] Updating product:', { id, name, colorsCount: colors?.length })
    
    const result = await db.$transaction(async (tx) => {
      // 1. Update product
      const product = await tx.product.update({
        where: { id },
        data: {
          name,
          description: description || null,
          category,
          subCategory: subCategory || null,
          genre: genre || 'femme',
          image: image || '',
          sizes: JSON.stringify(sizes || []),
          type: type || 'chaussure',
          isActive: isActive ?? true,
          isBestSeller: isBestSeller ?? false,
          isNew: isNew ?? true
        }
      })
      
      // 2. Delete existing colors
      await tx.productColor.deleteMany({
        where: { productId: id }
      })
      
      // 3. Create new colors
      if (colors && colors.length > 0) {
        for (let i = 0; i < colors.length; i++) {
          const color = colors[i]
          
          await tx.productColor.create({
            data: {
              productId: id,
              colorName: color.colorName,
              colorValue: color.colorValue,
              images: JSON.stringify(color.images || []),
              sizes: JSON.stringify(color.sizes || []),
              order: i
            }
          })
        }
      }
      
      return await tx.product.findUnique({
        where: { id },
        include: {
          colors: {
            orderBy: { order: 'asc' }
          }
        }
      })
    })
    
    console.log('[PRODUCT] Product updated successfully')
    
    // Calculate min price
    let minPrice = Infinity
    result?.colors.forEach(c => {
      const sizes = JSON.parse(c.sizes || '[]')
      sizes.forEach((s: { price: number }) => {
        if (s.price > 0 && s.price < minPrice) {
          minPrice = s.price
        }
      })
    })
    
    return NextResponse.json({
      ...result,
      sizes: JSON.parse(result?.sizes || '[]'),
      minPrice: minPrice === Infinity ? 0 : minPrice,
      colors: result?.colors.map(c => ({
        ...c,
        images: JSON.parse(c.images || '[]'),
        sizes: JSON.parse(c.sizes || '[]')
      }))
    })
  } catch (error) {
    console.error('[PRODUCT] Error updating product:', error)
    return NextResponse.json({ error: 'Failed to update product', details: String(error) }, { status: 500 })
  }
}

// DELETE - Delete a product
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }
    
    await db.product.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting product:', error)
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 })
  }
}
