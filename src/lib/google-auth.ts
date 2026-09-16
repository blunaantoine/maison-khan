import crypto from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * MAISON KHAN — Connexion avec Google (OAuth 2.0, flux "authorization code").
 *
 * Ce module contient la logique partagée entre les routes :
 *  - GET /api/auth/google            → redirection vers l'écran de consentement Google
 *  - GET /api/auth/google/callback   → échange du code, création/connexion du compte
 *  - GET /api/auth/session           → restauration de session (cookie signé)
 *  - POST /api/auth/logout           → déconnexion (efface le cookie de session)
 *
 * Configuration (.env) :
 *  - GOOGLE_CLIENT_ID      : ID client OAuth Google (Google Cloud Console)
 *  - GOOGLE_CLIENT_SECRET  : Secret client OAuth Google
 *  - AUTH_SECRET           : secret de signature du cookie de session (aléatoire, 32+)
 *  - GOOGLE_REDIRECT_URI   : (optionnel) URI de retour exacte si l'autodétection
 *                            ne convient pas. Par défaut : {base}/api/auth/google/callback
 *
 * Dans Google Cloud Console → « Identifiants » → « ID client OAuth 2.0 »,
 * ajoutez l'URI de redirection autorisée :
 *   https://shop.maison-khan.com/api/auth/google/callback
 */

export const SESSION_COOKIE = 'mk_google_session'
export const OAUTH_STATE_COOKIE = 'mk_oauth_state'
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 // 7 jours

/** Google est-il configuré sur ce serveur ? */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/** Secret de signature du cookie de session. */
function getSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.GOOGLE_CLIENT_SECRET
  if (!secret) {
    console.warn('[GOOGLE-AUTH] AUTH_SECRET non défini — secret de développement utilisé (non sécurisé en production)')
    return 'mk-insecure-dev-secret-change-me'
  }
  return secret
}

/**
 * URL de base du site, déduite des en-têtes du proxy (Caddy en production).
 * Utilisée pour construire l'URI de redirection OAuth sans configuration manuelle.
 */
export function getBaseUrl(request: NextRequest): string {
  const envUri = process.env.GOOGLE_REDIRECT_URI
  if (envUri) {
    // L'env contient l'URI de retour complète : on en déduit la base
    return envUri.replace(/\/api\/auth\/google\/callback\/?$/, '')
  }
  const host = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || new URL(request.url).host
  const isLocal = host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')
  const proto = request.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
  return `${proto}://${host}`
}

/** URI de redirection OAuth (doit être identique au consentement et à l'échange du code). */
export function getRedirectUri(request: NextRequest): string {
  return process.env.GOOGLE_REDIRECT_URI || `${getBaseUrl(request)}/api/auth/google/callback`
}

/** URL de l'écran de consentement Google. */
export function buildGoogleAuthUrl(request: NextRequest, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: getRedirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

/** Valeur du cookie de session : `{userId}.{hmac}`. */
export function signSession(userId: string): string {
  const mac = crypto.createHmac('sha256', getSecret()).update(userId).digest('hex')
  return `${userId}.${mac}`
}

/** Vérifie le cookie de session et renvoie l'userId, ou null si invalide. */
export function verifySession(value: string | undefined | null): string | null {
  if (!value) return null
  const idx = value.lastIndexOf('.')
  if (idx <= 0) return null
  const userId = value.slice(0, idx)
  const mac = value.slice(idx + 1)
  const expected = crypto.createHmac('sha256', getSecret()).update(userId).digest('hex')
  const macBuf = Buffer.from(mac, 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (macBuf.length !== expectedBuf.length || macBuf.length === 0) return null
  return crypto.timingSafeEqual(macBuf, expectedBuf) ? userId : null
}

/** Génère un état CSRF aléatoire pour le flux OAuth. */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}
