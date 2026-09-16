import { NextRequest, NextResponse } from 'next/server'
import {
  isGoogleConfigured,
  buildGoogleAuthUrl,
  generateState,
  OAUTH_STATE_COOKIE
} from '@/lib/google-auth'

/**
 * GET /api/auth/google
 *
 * Démarre le flux OAuth Google : redirige (302) vers l'écran de consentement
 * Google avec un état CSRF stocké dans un cookie httpOnly éphémère.
 *
 * Si Google n'est pas configuré (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET absents),
 * renvoie 503 avec un message clair.
 */
export async function GET(request: NextRequest) {
  if (!isGoogleConfigured()) {
    return NextResponse.json(
      { error: 'La connexion Google n\'est pas configurée sur ce serveur' },
      { status: 503 }
    )
  }

  const state = generateState()
  const response = NextResponse.redirect(buildGoogleAuthUrl(request, state), 302)

  // Cookie anti-CSRF : doit correspondre au `state` renvoyé par Google au callback
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: request.headers.get('x-forwarded-proto') === 'https',
    maxAge: 600, // 10 minutes pour terminer la connexion
    path: '/'
  })

  return response
}
