import crypto from 'crypto'
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from 'jose'
import type { NextRequest } from 'next/server'

/**
 * MAISON KHAN — Connexion avec Apple (« Sign in with Apple », OAuth 2.0 / OIDC).
 *
 * Routes :
 *  - GET /api/auth/apple            → redirection vers l'écran de connexion Apple
 *  - POST /api/auth/apple/callback  → retour d'Apple (form_post) : échange du code,
 *                                     création/connexion du compte, pose du cookie
 *                                     de session JWT (système existant src/lib/auth.ts)
 *  - GET /api/auth/apple/status     → le bouton ne s'affiche que si Apple est configuré
 *
 * La session réutilise le système JWT existant (signSession + buildSessionCookie) :
 * cookie HttpOnly mk_session, 24 h, identique à une connexion par mot de passe.
 *
 * Configuration (.env) :
 *  - APPLE_CLIENT_ID    : Services ID Apple (ex. com.maisonkhan.web)
 *  - APPLE_TEAM_ID      : Team ID (10 caractères — App Store Connect / Account Details)
 *  - APPLE_KEY_ID       : Key ID (10 caractères — clé « Sign in with Apple » .p8)
 *  - APPLE_PRIVATE_KEY  : contenu de la clé privée .p8 (PEM, ou sur une ligne avec \n)
 *  - APPLE_REDIRECT_URI : (optionnel) URI de retour exacte si l'autodétection
 *                         ne convient pas. Par défaut : {base}/api/auth/apple/callback
 *
 * Dans Apple Developer (developer.apple.com) → Certificates, Identifiers & Profiles :
 *  1. Identifiers → + → Services ID → activer « Sign in with Apple » →
 *     Domain : shop.maison-khan.com
 *     Return URL : https://shop.maison-khan.com/api/auth/apple/callback
 *  2. Keys → + → cocher « Sign in with Apple » → associer le Services ID →
 *     noter le Key ID et télécharger le fichier .p8 (téléchargeable UNE fois).
 *
 * Différences avec le flux Google :
 *  - Le retour d'Apple est un POST cross-site (response_mode=form_post) : le cookie
 *    d'état CSRF doit être SameSite=None + Secure (HTTPS) pour accompagner la requête.
 *  - L'échange du code exige un « client secret » qui est un JWT ES256 signé avec
 *    la clé privée .p8 (regénéré ici à chaque échange, valable ~6 mois).
 *  - L'id_token est vérifié contre les clés publiques Apple (JWKS).
 *  - Apple ne transmet l'email (et le nom) qu'à la PREMIÈRE connexion : les
 *    connexions suivantes s'appuient sur l'identifiant stable « sub » stocké
 *    dans User.appleId.
 */

export const APPLE_STATE_COOKIE = 'mk_apple_state'

/** Apple est-il configuré sur ce serveur ? */
export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_CLIENT_ID &&
    process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID &&
    process.env.APPLE_PRIVATE_KEY
  )
}

/**
 * URL de base du site, déduite des en-têtes du proxy (Caddy en production).
 * Utilisée pour construire l'URI de retour sans configuration manuelle.
 */
export function getAppleBaseUrl(request: NextRequest): string {
  const envUri = process.env.APPLE_REDIRECT_URI
  if (envUri) {
    return envUri.replace(/\/api\/auth\/apple\/callback\/?$/, '')
  }
  const host = request.headers.get('x-forwarded-host')
    || request.headers.get('host')
    || new URL(request.url).host
  const isLocal = host.startsWith('localhost') || host.startsWith('127.') || host.startsWith('0.0.0.0')
  const proto = request.headers.get('x-forwarded-proto') || (isLocal ? 'http' : 'https')
  return `${proto}://${host}`
}

/** URI de retour OAuth (doit être identique à celle enregistrée chez Apple). */
export function getAppleRedirectUri(request: NextRequest): string {
  return process.env.APPLE_REDIRECT_URI || `${getAppleBaseUrl(request)}/api/auth/apple/callback`
}

/** URL de l'écran de connexion Apple. */
export function buildAppleAuthUrl(request: NextRequest, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.APPLE_CLIENT_ID || '',
    redirect_uri: getAppleRedirectUri(request),
    response_type: 'code',
    // form_post : Apple renvoie le code (et le nom/email à la 1re connexion)
    // via un POST de formulaire — obligatoire pour obtenir le nom et l'email.
    response_mode: 'form_post',
    scope: 'name email',
    state
  })
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`
}

/** Génère un état CSRF aléatoire pour le flux OAuth. */
export function generateAppleState(): string {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * Normalise la clé privée .p8 : accepte un PEM complet, une clé sur une seule
 * ligne avec des « \n » littéraux (pratique dans .env), ou le corps base64 nu.
 */
export function normalizeApplePrivateKey(raw: string): string {
  let key = raw.trim()
  key = key.replace(/\\n/g, '\n').replace(/\\r/g, '')
  if (!key.includes('-----BEGIN')) {
    const body = key.replace(/\s+/g, '')
    key = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`
  }
  return key
}

/**
 * Secret client OAuth Apple : JWT ES256 signé avec la clé .p8.
 * Regénéré à chaque échange (durée ~6 mois, maximum accepté par Apple).
 */
export async function createAppleClientSecret(privateKeyPem?: string): Promise<string> {
  const pem = normalizeApplePrivateKey(privateKeyPem || process.env.APPLE_PRIVATE_KEY || '')
  const key = await importPKCS8(pem, 'ES256')
  const now = Math.floor(Date.now() / 1000)
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: process.env.APPLE_KEY_ID })
    .setIssuer(process.env.APPLE_TEAM_ID || '')
    .setSubject(process.env.APPLE_CLIENT_ID || '')
    .setAudience('https://appleid.apple.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 15777000) // 6 mois (limite Apple)
    .sign(key)
}

// Clés publiques Apple (JWKS) — jose met en cache et suit la rotation des clés
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'))

export interface AppleIdTokenPayload {
  sub: string
  email?: string
  email_verified?: boolean
  is_private_email?: boolean
}

/**
 * Vérifie l'id_token Apple (signature via JWKS, issuer, audience, expiration)
 * et retourne son payload — ou null si invalide.
 */
export async function verifyAppleIdToken(idToken: string): Promise<AppleIdTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: process.env.APPLE_CLIENT_ID,
      algorithms: ['RS256']
    })
    if (!payload.sub) return null
    return {
      sub: payload.sub as string,
      email: payload.email as string | undefined,
      email_verified: payload.email_verified === true || payload.email_verified === 'true',
      is_private_email: payload.is_private_email === true || payload.is_private_email === 'true'
    }
  } catch (error) {
    console.error('[APPLE-AUTH] id_token invalide :', error)
    return null
  }
}

export interface AppleTokenResponse {
  id_token?: string
  access_token?: string
  error?: string
  error_description?: string
}

/** Échange le code d'autorisation contre l'id_token Apple. */
export async function exchangeAppleCode(
  code: string,
  request: NextRequest
): Promise<AppleTokenResponse | null> {
  const clientSecret = await createAppleClientSecret()
  const response = await fetch('https://appleid.apple.com/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.APPLE_CLIENT_ID || '',
      client_secret: clientSecret,
      redirect_uri: getAppleRedirectUri(request)
    })
  })

  const data = await response.json().catch(() => null) as AppleTokenResponse | null
  if (!response.ok || !data?.id_token) {
    console.error('[APPLE-AUTH] Échange du code échoué :', data?.error || response.status)
    return null
  }
  return data
}

export interface AppleFirstLoginUser {
  firstName?: string
  lastName?: string
  email?: string
}

/**
 * Décode le champ `user` du form_post Apple — présent uniquement à la
 * PREMIÈRE autorisation : { "name": { "firstName": "...", "lastName": "..." }, "email": "..." }
 */
export function parseAppleUserField(userField: FormDataEntryValue | string | null): AppleFirstLoginUser {
  if (!userField) return {}
  try {
    const parsed = JSON.parse(String(userField))
    return {
      firstName: parsed?.name?.firstName || undefined,
      lastName: parsed?.name?.lastName || undefined,
      email: parsed?.email || undefined
    }
  } catch {
    return {}
  }
}
