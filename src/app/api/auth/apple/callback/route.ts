import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { signSession, buildSessionCookie } from '@/lib/auth'
import {
  isAppleConfigured,
  exchangeAppleCode,
  verifyAppleIdToken,
  parseAppleUserField,
  getAppleBaseUrl,
  APPLE_STATE_COOKIE
} from '@/lib/apple-auth'

/**
 * POST /api/auth/apple/callback  (retour d'Apple — response_mode=form_post)
 * GET  /api/auth/apple/callback  (sécurité / débogage uniquement)
 *
 * Étapes :
 *  1. Validation de l'état CSRF (cookie vs champ du formulaire)
 *  2. Échange du code d'autorisation contre l'id_token Apple
 *  3. Vérification cryptographique de l'id_token (clés publiques Apple/JWKS)
 *  4. Connexion : compte trouvé par appleId (« sub », connexions suivantes —
 *     Apple ne renvoie l'email qu'à la 1re connexion), sinon par email
 *     (liaison du compte existant), sinon création d'un compte client
 *     (mot de passe aléatoire inutilisable)
 *  5. Pose du cookie de session JWT (mk_session, HttpOnly, 24 h) via le
 *     système existant — identique à une connexion par mot de passe
 *  6. Redirection vers /?auth=apple (le front restaure la session via
 *     /api/auth/me et affiche le toast de bienvenue)
 *
 * Toute erreur → redirection vers /?auth=error (le front affiche un toast).
 */

/** Redirige vers l'accueil avec un indicateur d'erreur pour le front. */
function redirectError(baseUrl: string): NextResponse {
  const response = NextResponse.redirect(`${baseUrl}/?auth=error`, 302)
  // Nettoyer le cookie d'état dans tous les cas
  response.cookies.set(APPLE_STATE_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}

interface CallbackParams {
  code: string | null
  state: string | null
  oauthError: string | null
  userField: string | null
}

/** Extrait code/state/error/user du POST de formulaire d'Apple ou de la query string. */
async function readCallbackParams(request: NextRequest): Promise<CallbackParams> {
  const isFormPost =
    request.method === 'POST' &&
    (request.headers.get('content-type') || '').includes('form')

  if (isFormPost) {
    const form = await request.formData()
    return {
      code: (form.get('code') as string) || null,
      state: (form.get('state') as string) || null,
      oauthError: (form.get('error') as string) || null,
      userField: (form.get('user') as string) || null
    }
  }

  const url = new URL(request.url)
  return {
    code: url.searchParams.get('code'),
    state: url.searchParams.get('state'),
    oauthError: url.searchParams.get('error'),
    userField: url.searchParams.get('user')
  }
}

async function handleCallback(request: NextRequest) {
  // Base URL cohérente avec le proxy (Caddy en production)
  const host = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || new URL(request.url).host
  const isLocal = host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')
  const proto = request.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
  const siteBaseUrl = `${proto}://${host}`

  try {
    if (!isAppleConfigured()) {
      return redirectError(siteBaseUrl)
    }

    const params = await readCallbackParams(request)

    // L'utilisateur a refusé sur l'écran Apple, ou Apple a renvoyé une erreur
    if (params.oauthError || !params.code || !params.state) {
      console.error('[APPLE-AUTH] Retour Apple sans code :', params.oauthError || 'paramètres manquants')
      return redirectError(siteBaseUrl)
    }

    // 1. Anti-CSRF : le state doit correspondre au cookie posé au départ
    const cookieState = request.cookies.get(APPLE_STATE_COOKIE)?.value
    if (!cookieState || cookieState !== params.state) {
      console.error('[APPLE-AUTH] State CSRF invalide')
      return redirectError(siteBaseUrl)
    }

    // 2. Échange du code contre l'id_token (secret client = JWT ES256 signé .p8)
    const tokens = await exchangeAppleCode(params.code, request)
    if (!tokens?.id_token) {
      return redirectError(siteBaseUrl)
    }

    // 3. Vérification de l'id_token (signature Apple + issuer + audience)
    const payload = await verifyAppleIdToken(tokens.id_token)
    if (!payload) {
      return redirectError(siteBaseUrl)
    }

    // Nom / email de la première connexion (champ « user », présent une seule fois)
    const firstLogin = parseAppleUserField(params.userField)

    // Email : priorité à l'id_token, sinon celui de la 1re connexion.
    // Peut être une adresse de relais Apple (xyz@privaterelay.appleid.com) —
    // les emails de la boutique lui sont quand même transmis par Apple.
    const email = (payload.email || firstLogin.email || '').toLowerCase()

    // 4. Connexion ou création du compte
    //    a) Connexions suivantes : par l'identifiant Apple stable (« sub »)
    let user = await db.user.findUnique({ where: { appleId: payload.sub } })

    //    b) Première connexion : lier un compte existant par email
    //       (Apple a vérifié cet email, il appartient donc à cette personne)
    if (!user && email) {
      user = await db.user.findUnique({ where: { email } })
      if (user) {
        user = await db.user.update({
          where: { id: user.id },
          data: {
            appleId: payload.sub,
            emailVerified: true
          }
        })
        console.log('[APPLE-AUTH] Compte existant lié à Apple :', email)
      }
    }

    //    c) Aucun compte : création d'un compte client
    if (!user) {
      if (!email) {
        // Apple ne transmet plus l'email ET aucun compte ne correspond à ce
        // sub : impossible de créer un compte identifiable.
        console.error('[APPLE-AUTH] Email absent et compte inconnu — connexion refusée')
        return redirectError(siteBaseUrl)
      }

      const randomPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10)
      user = await db.user.create({
        data: {
          email,
          password: randomPassword,
          firstName: firstLogin.firstName || null,
          lastName: firstLogin.lastName || null,
          appleId: payload.sub,
          emailVerified: true,
          role: 'customer'
        }
      })
      console.log('[APPLE-AUTH] Nouveau compte client créé pour', email)
    } else if (!user.emailVerified) {
      // L'email a été vérifié par Apple : marquer le compte comme vérifié
      await db.user.update({ where: { id: user.id }, data: { emailVerified: true } })
    }

    if (!user.isActive) {
      console.error('[APPLE-AUTH] Compte désactivé :', user.email)
      return redirectError(siteBaseUrl)
    }

    // 5. Session JWT via le système existant (mk_session, HttpOnly, 24 h)
    const token = await signSession({ userId: user.id, email: user.email, role: user.role })
    const response = NextResponse.redirect(`${siteBaseUrl}/?auth=apple`, 302)
    // append (et non set) : on pose deux cookies (session + purge du state)
    response.headers.append('Set-Cookie', buildSessionCookie(token))
    response.headers.append(
      'Set-Cookie',
      `${APPLE_STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
    )
    return response
  } catch (error) {
    console.error('[APPLE-AUTH] Erreur callback :', error)
    return redirectError(siteBaseUrl)
  }
}

export async function POST(request: NextRequest) {
  return handleCallback(request)
}

export async function GET(request: NextRequest) {
  return handleCallback(request)
}
