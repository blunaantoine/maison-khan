import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  listForUser,
  markRead,
  markAllRead,
  deleteForUser,
} from '@/lib/notifications/service'
import { NOTIFICATION_LIMITS, isValidNotificationType } from '@/lib/notifications/types'

/**
 * Notifications in-app du client connecté (cloche 🔔).
 *
 * GET    /api/client/notifications?page=1&type=order&unread=1&pageSize=15
 *        → { notifications, total, page, pageSize, unreadCount }
 * PUT    /api/client/notifications        body: { id }  → marquer UNE comme lue
 *                                     body: { all: true } → tout marquer lu
 * DELETE /api/client/notifications        body: { id }  → supprimer UNE
 *
 * Sécurité (défense en profondeur) :
 *  - le middleware (edge) exige une session valide avant d'atteindre la route
 *  - getAuthUser() re-valide l'utilisateur en base (actif, rôle cohérent)
 *  - TOUTES les requêtes sont filtrées par userId — impossible de lire,
 *    modifier ou supprimer la notification d'un autre utilisateur.
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get('pageSize') || '', 10) || NOTIFICATION_LIMITS.pageSize)
    )
    const typeParam = searchParams.get('type')
    const type =
      typeParam && isValidNotificationType(typeParam) ? typeParam : null
    const unreadOnly = searchParams.get('unread') === '1'

    const result = await listForUser(user.id, { page, pageSize, type, unreadOnly })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Client notifications GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    if (body.all === true) {
      const count = await markAllRead(user.id)
      return NextResponse.json({ message: 'Tout marqué comme lu', count })
    }

    if (typeof body.id !== 'string' || !body.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    const ok = await markRead(user.id, body.id)
    if (!ok) {
      // Introuvable OU déjà lue OU appartient à un autre utilisateur
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      )
    }
    return NextResponse.json({ message: 'Notification lue' })
  } catch (error) {
    console.error('Client notifications PUT error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body.id !== 'string' || !body.id) {
      return NextResponse.json({ error: 'ID requis' }, { status: 400 })
    }

    const ok = await deleteForUser(user.id, body.id)
    if (!ok) {
      return NextResponse.json(
        { error: 'Notification introuvable' },
        { status: 404 }
      )
    }
    return NextResponse.json({ message: 'Notification supprimée' })
  } catch (error) {
    console.error('Client notifications DELETE error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
