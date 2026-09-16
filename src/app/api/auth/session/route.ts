import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifySession, SESSION_COOKIE } from '@/lib/google-auth'

/**
 * GET /api/auth/session
 *
 * Restaure la session d'un utilisateur connecté avec Google :
 * lit le cookie `mk_google_session` (signé HMAC), vérifie la signature,
 * puis renvoie l'utilisateur à jour de la base (même forme que /api/auth/login).
 *
 * Le frontend l'appelle au chargement quand aucun utilisateur n'est en
 * localStorage, et juste après le retour de Google sur /?auth=google.
 */
export async function GET(request: NextRequest) {
  try {
    const cookieValue = request.cookies.get(SESSION_COOKIE)?.value
    const userId = verifySession(cookieValue)

    if (!userId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Session restore error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la restauration de session' },
      { status: 500 }
    )
  }
}
