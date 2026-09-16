import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, buildSessionCookie } from '@/lib/auth'
import { isGoogleConfigured, getRedirectUri, OAUTH_STATE_COOKIE } from '@/lib/google-auth'

/**
 * GET /api/auth/google/callback
 *
 * Retour de Google après consentement. Étapes :
 *  1. Validation de l'état CSRF (cookie vs paramètre)
 *  2. Échange du code d'autorisation contre un jeton d'accès
 *  3. Récupération du profil Google (email vérifié, nom)
 *  4. Connexion : compte existant trouvé par email, sinon création d'un
 *     compte client (mot de passe aléatoire inutilisable)
 *  5. Pose du cookie de session JWT (mk_session, HttpOnly, 24 h) via le
 *     système existant — identique à une connexion par mot de passe
 *  6. Redirection vers /?auth=google (le front restaure la session via
 *     /api/auth/me et affiche le toast de bienvenue)
 *
 * Toute erreur → redirection vers /?auth=error (le front affiche un toast).
 */

interface GoogleTokenResponse {
  access_token?: string
  error?: string
}

interface GoogleUserProfile {
  sub?: string
  email?: string
  email_verified?: boolean | string
  name?: string
  given_name?: string
  family_name?: string
}

/** Redirige vers l'accueil avec un indicateur d'erreur pour le front. */
function redirectError(baseUrl: string): NextResponse {
  const response = NextResponse.redirect(`${baseUrl}/?auth=error`, 302)
  // Nettoyer le cookie d'état dans tous les cas
  response.cookies.set(OAUTH_STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}

export async function GET(request: NextRequest) {
  // Base URL cohérente avec le proxy (Caddy en production)
  const host = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || new URL(request.url).host
  const isLocal = host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')
  const proto = request.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
  const siteBaseUrl = `${proto}://${host}`

  try {
    if (!isGoogleConfigured()) {
      return redirectError(siteBaseUrl)
    }

    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const oauthError = url.searchParams.get('error')

    // L'utilisateur a refusé sur l'écran Google, ou Google a renvoyé une erreur
    if (oauthError || !code || !state) {
      return redirectError(siteBaseUrl)
    }

    // 1. Anti-CSRF : le state doit correspondre au cookie posé au départ
    const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value
    if (!cookieState || cookieState !== state) {
      console.error('[GOOGLE-AUTH] State CSRF invalide')
      return redirectError(siteBaseUrl)
    }

    // 2. Échange du code contre un jeton d'accès
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: getRedirectUri(request),
        grant_type: 'authorization_code'
      })
    })

    const tokens = await tokenResponse.json() as GoogleTokenResponse
    if (!tokenResponse.ok || !tokens.access_token) {
      console.error('[GOOGLE-AUTH] Échange du code échoué:', tokens.error || tokenResponse.status)
      return redirectError(siteBaseUrl)
    }

    // 3. Profil Google (email vérifié)
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    if (!profileResponse.ok) {
      console.error('[GOOGLE-AUTH] Récupération du profil échouée:', profileResponse.status)
      return redirectError(siteBaseUrl)
    }

    const profile = await profileResponse.json() as GoogleUserProfile
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true'
    if (!profile.email || !emailVerified) {
      console.error('[GOOGLE-AUTH] Email Google manquant ou non vérifié')
      return redirectError(siteBaseUrl)
    }

    const email = profile.email.toLowerCase()

    // 4. Connexion ou création du compte (les emails Google sont vérifiés :
    //    si l'email correspond à un compte existant, il appartient à cette personne)
    let user = await db.user.findUnique({ where: { email } })

    if (!user) {
      // Nouveau compte client — mot de passe aléatoire (connexion via Google uniquement)
      const randomPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
      const firstName = profile.given_name || profile.name?.split(' ')[0] || null
      const lastName = profile.family_name || (profile.name ? profile.name.split(' ').slice(1).join(' ') : null) || null

      user = await db.user.create({
        data: {
          email,
          password: randomPassword,
          firstName,
          lastName,
          emailVerified: true,
          role: 'customer'
        }
      })
      console.log('[GOOGLE-AUTH] Nouveau compte client créé pour', email)
    } else if (!user.emailVerified) {
      // L'email a été vérifié par Google : marquer le compte comme vérifié
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    }

    if (!user.isActive) {
      console.error('[GOOGLE-AUTH] Compte désactivé:', email)
      return redirectError(siteBaseUrl)
    }

    // 5. Session JWT via le système existant (mk_session, HttpOnly, 24 h)
    const token = await signSession({ userId: user.id, email: user.email, role: user.role })
    const response = NextResponse.redirect(`${siteBaseUrl}/?auth=google`, 302)
    // append (et non set) : on pose deux cookies (session + purge du state)
    response.headers.append('Set-Cookie', buildSessionCookie(token))
    response.headers.append(
      'Set-Cookie',
      `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    )
    return response
  } catch (error) {
    console.error('[GOOGLE-AUTH] Erreur callback:', error)
    return redirectError(siteBaseUrl)
  }
}
