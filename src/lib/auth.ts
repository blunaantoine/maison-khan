import { SignJWT, jwtVerify } from 'jose'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

/**
 * Module d'authentification sécurisé — Maison Khan
 *
 * Sécurité :
 *  - JWT signé avec HS256 + secret serveur (JWT_SECRET)
 *  - Cookie HttpOnly + Secure + SameSite=Lax (impossible à lire en JS)
 *  - Le rôle et l'id sont lus depuis le JWT, mais VALIDÉS en base pour
 *    chaque requête admin (au cas où l'utilisateur serait désactivé ou
 *    que son rôle ait changé après l'émission du token).
 *  - Durée de vie courte (24h) pour limiter l'impact d'un token volé.
 */

const COOKIE_NAME = 'mk_session'
const SESSION_DURATION = '24h'
const COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60 // 24h

function getSecret(): Uint8Array {
  const secret =
    process.env.JWT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'maison-khan-dev-fallback-secret-change-me'
  return new TextEncoder().encode(secret)
}

export interface SessionPayload {
  sub: string // user id
  email: string
  role: 'customer' | 'manager' | 'admin'
  // small random jitter to invalidate tokens after a password change etc.
  iat: number
}

/**
 * Sign a JWT for a given user.
 */
export async function signSession(payload: {
  userId: string
  email: string
  role: string
}): Promise<string> {
  const token = await new SignJWT({
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(SESSION_DURATION)
    .sign(getSecret())

  return token
}

/**
 * Verify a JWT and return the decoded payload, or null if invalid.
 * Works in both edge (middleware) and node runtimes.
 */
export async function verifySession(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
    })
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      role: payload.role as SessionPayload['role'],
      iat: payload.iat as number,
    }
  } catch {
    return null
  }
}

/**
 * Read the session cookie from a NextRequest.
 */
export function readSessionCookie(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE_NAME)?.value
}

/**
 * Build the Set-Cookie header value for a new session.
 */
export function buildSessionCookie(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  // Secure only in production (HTTPS). In dev (http) the cookie would be
  // dropped by browsers if Secure were set.
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure')
  }
  return parts.join('; ')
}

/**
 * Build the Set-Cookie header value to clear the session.
 */
export function buildClearSessionCookie(): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ].join('; ')
}

export const SESSION_COOKIE_NAME = COOKIE_NAME

/**
 * Get the authenticated user from a NextRequest, validating against the DB.
 * Returns null if not authenticated or if the user has been deactivated.
 *
 * Use this in API routes (node runtime) where db is available.
 */
export async function getAuthUser(req: NextRequest): Promise<{
  id: string
  email: string
  role: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  isActive: boolean
} | null> {
  const token = readSessionCookie(req)
  const session = await verifySession(token)
  if (!session) return null

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      isActive: true,
    },
  })

  if (!user || !user.isActive) return null

  // Optional: if the role in DB differs from the role in the JWT
  // (e.g. admin demoted a user), reject the request.
  if (user.role !== session.role) return null

  return user
}

/**
 * Require an authenticated user. Throws a 401 response if not authenticated.
 * Usage:
 *   const auth = await requireAuth(request)
 *   if (auth instanceof NextResponse) return auth
 */
export async function requireAuth(req: NextRequest) {
  const user = await getAuthUser(req)
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      ),
    }
  }
  return { user, response: null }
}

/**
 * Require a specific role. Returns a 403 response if the user's role
 * is not in the allowed list.
 */
export async function requireRole(
  req: NextRequest,
  allowedRoles: string[]
) {
  const { user, response } = await requireAuth(req)
  if (response) return { user: null, response }
  if (!allowedRoles.includes(user!.role)) {
    return {
      user,
      response: NextResponse.json(
        { error: 'Accès interdit — permissions insuffisantes' },
        { status: 403 }
      ),
    }
  }
  return { user, response: null }
}
