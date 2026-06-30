import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

// GET - Get all orders (admin)
export async function GET(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

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
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

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

    const order = await db.order.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        payments: true
      }
    })

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
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

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
