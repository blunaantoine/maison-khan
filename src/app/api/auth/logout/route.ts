import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/google-auth'

/**
 * POST /api/auth/logout
 *
 * Déconnexion : efface le cookie de session Google (`mk_google_session`).
 * Sans cela, un utilisateur déconnecté serait reconnecté automatiquement
 * au rechargement de la page via /api/auth/session.
 */
export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
    path: '/'
  })
  return response
}
