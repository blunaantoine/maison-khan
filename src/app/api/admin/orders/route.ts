import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { notifyStatusChanged } from '@/lib/notify'

/**
 * Defense in depth: the middleware already validated the JWT and checked
 * the role, but we re-verify against the DB here in case:
 *  - the user was deactivated after the JWT was issued
 *  - the user's role was changed after the JWT was issued
 */
async function authorize(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-role')
  if (!userId || !role) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  if (user.role !== role) return null
  if (user.role !== 'admin' && user.role !== 'manager') return null
  return user
}

// GET - Get all orders (admin)
export async function GET(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const paymentStatus = searchParams.get('paymentStatus')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search } },
        { customerEmail: { contains: search } },
        { customerPhone: { contains: search } },
        { customerFirstName: { contains: search } },
        { customerLastName: { contains: search } }
      ]
    }

    const [orders, total] = await Promise.all([
      db.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, image: true }
              }
            }
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              paymentMethod: true,
              createdAt: true
            }
          },
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phone: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      db.order.count({ where })
    ])

    // Stats
    const stats = await db.order.groupBy({
      by: ['status'],
      _count: true,
      _sum: { total: true }
    })

    return NextResponse.json({ orders, total, stats })
  } catch (error) {
    console.error('Admin get orders error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}

// PUT - Update order (admin)
export async function PUT(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { id, status, paymentStatus, trackingNumber, notes, estimatedDelivery } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (paymentStatus) updateData.paymentStatus = paymentStatus
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber
    if (notes !== undefined) updateData.notes = notes
    if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery

    // Ancien statut avant mise à jour (pour l'email de changement de statut)
    const previous = await db.order.findUnique({
      where: { id },
      select: { status: true },
    })

    const order = await db.order.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        payments: true
      }
    })

    // Notification admin + email au client si le statut a changé (non bloquant)
    if (previous && previous.status !== order.status) {
      await notifyStatusChanged(order, previous.status, order.status)
    }

    return NextResponse.json({
      message: 'Commande mise à jour',
      order
    })
  } catch (error) {
    console.error('Admin update order error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la commande' },
      { status: 500 }
    )
  }
}

// DELETE - Delete order (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    // Delete related items and payments first
    await db.orderItem.deleteMany({ where: { orderId: id } })
    await db.payment.deleteMany({ where: { orderId: id } })
    
    // Delete order
    await db.order.delete({ where: { id } })

    return NextResponse.json({ message: 'Commande supprimée' })
  } catch (error) {
    console.error('Admin delete order error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la commande' },
      { status: 500 }
    )
  }
}
