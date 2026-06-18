import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Get cart
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const sessionId = request.headers.get('x-session-id')

    const where = userId ? { userId } : { sessionId }

    const cartItems = await db.cartItem.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            image: true,
            type: true,
            colors: {
              select: {
                id: true,
                colorName: true,
                colorValue: true,
                images: true,
                sizes: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ cartItems })
  } catch (error) {
    console.error('Get cart error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération du panier' },
      { status: 500 }
    )
  }
}

// POST - Add to cart
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const sessionId = request.headers.get('x-session-id')
    
    const body = await request.json()
    const { productId, colorId, colorName, size, quantity, price } = body

    if (!productId || !size || !price) {
      return NextResponse.json(
        { error: 'Informations manquantes' },
        { status: 400 }
      )
    }

    // Check if item already in cart
    const existingItem = await db.cartItem.findFirst({
      where: {
        productId,
        colorId: colorId || null,
        size,
        ...(userId ? { userId } : { sessionId })
      }
    })

    if (existingItem) {
      // Update quantity
      const updated = await db.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + (quantity || 1) }
      })
      return NextResponse.json({
        message: 'Quantité mise à jour',
        cartItem: updated
      })
    }

    // Create new cart item
    const cartItem = await db.cartItem.create({
      data: {
        userId: userId || null,
        sessionId: sessionId || null,
        productId,
        colorId: colorId || null,
        colorName: colorName || null,
        size,
        quantity: quantity || 1,
        price
      }
    })

    return NextResponse.json({
      message: 'Produit ajouté au panier',
      cartItem
    })
  } catch (error) {
    console.error('Add to cart error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout au panier' },
      { status: 500 }
    )
  }
}

// PUT - Update cart item
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const sessionId = request.headers.get('x-session-id')
    
    const body = await request.json()
    const { id, quantity } = body

    if (!id || quantity === undefined) {
      return NextResponse.json(
        { error: 'Informations manquantes' },
        { status: 400 }
      )
    }

    // Verify ownership
    const cartItem = await db.cartItem.findFirst({
      where: {
        id,
        ...(userId ? { userId } : { sessionId })
      }
    })

    if (!cartItem) {
      return NextResponse.json(
        { error: 'Article non trouvé dans le panier' },
        { status: 404 }
      )
    }

    if (quantity <= 0) {
      await db.cartItem.delete({ where: { id } })
      return NextResponse.json({ message: 'Article supprimé du panier' })
    }

    const updated = await db.cartItem.update({
      where: { id },
      data: { quantity }
    })

    return NextResponse.json({
      message: 'Panier mis à jour',
      cartItem: updated
    })
  } catch (error) {
    console.error('Update cart error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour du panier' },
      { status: 500 }
    )
  }
}

// DELETE - Remove from cart
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const sessionId = request.headers.get('x-session-id')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID article requis' },
        { status: 400 }
      )
    }

    // Verify ownership
    const cartItem = await db.cartItem.findFirst({
      where: {
        id,
        ...(userId ? { userId } : { sessionId })
      }
    })

    if (!cartItem) {
      return NextResponse.json(
        { error: 'Article non trouvé dans le panier' },
        { status: 404 }
      )
    }

    await db.cartItem.delete({ where: { id } })

    return NextResponse.json({ message: 'Article supprimé du panier' })
  } catch (error) {
    console.error('Delete cart error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression' },
      { status: 500 }
    )
  }
}
