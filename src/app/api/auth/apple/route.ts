import { NextRequest, NextResponse } from 'next/server'
import {
  isAppleConfigured,
  buildAppleAuthUrl,
  generateAppleState,
  getAppleBaseUrl,
  APPLE_STATE_COOKIE
} from '@/lib/apple-auth'

/**
 * GET /api/auth/apple
 *
 * Démarre le flux « Sign in with Apple » : redirige (302) vers l'écran de
 * connexion Apple avec un état CSRF stocké dans un cookie httpOnly éphémère.
 *
 * ⚠️ Spécificité Apple : le retour se fait par un POST de formulaire cross-site
 * (response_mode=form_post). Un cookie SameSite=Lax ne serait PAS transmis —
 * d'où SameSite=None + Secure en production (HTTPS obligatoire).
 *
 * Si Apple n'est pas configuré (APPLE_CLIENT_ID / APPLE_TEAM_ID /
 * APPLE_KEY_ID / APPLE_PRIVATE_KEY absents), renvoie 503 avec un message clair.
 */
export async function GET(request: NextRequest) {
  if (!isAppleConfigured()) {
    return NextResponse.json(
      { error: 'La connexion Apple n\'est pas configurée sur ce serveur' },
      { status: 503 }
    )
  }

  const state = generateAppleState()
  const response = NextResponse.redirect(buildAppleAuthUrl(request, state), 302)

  // Le flux est-il servi en HTTPS ? (Caddy en production, http en dev local)
  const isHttps = request.headers.get('x-forwarded-proto') === 'https'
    || new URL(request.url).protocol === 'https:'

  // Cookie anti-CSRF : doit correspondre au `state` renvoyé par Apple au callback.
  // SameSite=None + Secure est requis pour survivre au form_post cross-site d'Apple ;
  // en développement (http), on retombe sur Lax (le vrai flux Apple exige de toute
  // façon un domaine HTTPS enregistré chez Apple).
  response.cookies.set(APPLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 600, // 10 minutes pour terminer la connexion
    path: '/'
  })

  // L'URL de base sert uniquement à la journalisation (aucune redirection ici)
  console.log('[APPLE-AUTH] Démarrage du flux depuis', getAppleBaseUrl(request))

  return response
}
