import crypto from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * MAISON KHAN — Connexion avec Google (OAuth 2.0, flux "authorization code").
 *
 * Routes :
 *  - GET /api/auth/google            → redirection vers l'écran de consentement Google
 *  - GET /api/auth/google/callback   → échange du code, création/connexion du compte,
 *                                      pose du cookie de session JWT (système existant)
 *  - GET /api/auth/google/status     → le bouton ne s'affiche que si Google est configuré
 *
 * La session réutilise le système JWT de src/lib/auth.ts (signSession +
 * buildSessionCookie) : cookie HttpOnly mk_session, 24 h, identique à une
 * connexion par mot de passe.
 *
 * Configuration (.env) :
 *  - GOOGLE_CLIENT_ID      : ID client OAuth Google (Google Cloud Console)
 *  - GOOGLE_CLIENT_SECRET  : Secret client OAuth Google
 *  - GOOGLE_REDIRECT_URI   : (optionnel) URI de retour exacte si l'autodétection
 *                            ne convient pas. Par défaut : {base}/api/auth/google/callback
 *
 * Dans Google Cloud Console → « Identifiants » → « ID client OAuth 2.0 »,
 * ajoutez l'URI de redirection autorisée :
 *   https://shop.maison-khan.com/api/auth/google/callback
 */

export const OAUTH_STATE_COOKIE = 'mk_oauth_state'

/** Google est-il configuré sur ce serveur ? */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
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

/** Génère un état CSRF aléatoire pour le flux OAuth. */
export function generateState(): string {
  return crypto.randomBytes(16).toString('hex')
}
