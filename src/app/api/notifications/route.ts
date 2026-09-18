import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Centre de notifications (admin / manager).
 *
 * GET   /api/notifications            → { notifications, unreadCount } (50 dernières)
 * PUT   /api/notifications            → { id } marque une notification lue
 *                                      → { all: true } marque tout comme lu
 * DELETE /api/notifications           → { read: true } efface les notifications lues
 *                                      → { all: true } efface tout
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
  if (user.role !== 'admin' && user.role !== 'manager') return null
  return user
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.notification.count({ where: { isRead: false } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('Notifications GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const body = await request.json()

    if (body.all) {
      await db.notification.updateMany({
        where: { isRead: false },
        data: { isRead: true },
      })
      return NextResponse.json({ message: 'Tout marqué comme lu' })
    }

    if (!body.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    await db.notification.update({
      where: { id: body.id },
      data: { isRead: true },
    })
    return NextResponse.json({ message: 'Notification lue' })
  } catch (error) {
    console.error('Notifications PUT error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))

    if (body.all) {
      await db.notification.deleteMany({})
      return NextResponse.json({ message: 'Notifications effacées' })
    }

    await db.notification.deleteMany({ where: { isRead: true } })
    return NextResponse.json({ message: 'Notifications lues effacées' })
  } catch (error) {
    console.error('Notifications DELETE error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
