import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getUnreadCount } from '@/lib/notifications/service'

/**
 * Compteur de notifications non lues du client connecté (badge 🔔).
 * Pollé toutes les 30 s par le header — volontairement minimal :
 * une seule requête COUNT indexée ([userId, isRead]).
 *
 * GET /api/client/notifications/unread-count → { count }
 */

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    const count = await getUnreadCount(user.id)
    return NextResponse.json({ count })
  } catch (error) {
    console.error('Unread count error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
