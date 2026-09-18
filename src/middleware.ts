import { NextRequest, NextResponse } from 'next/server'
import { verifySession, readSessionCookie } from '@/lib/auth'

/**
 * Middleware RBAC — Maison Khan
 *
 * Protège les routes API sensibles en vérifiant le JWT dans le cookie
 * HttpOnly AVANT que la route ne s'exécute (edge runtime).
 *
 * Matrice de permissions :
 *
 *   /api/admin/*         → manager + admin
 *   /api/admin/users/*   → admin seulement
 *   /api/notifications/* → manager + admin (centre de notifications)
 *   /api/email-logs/*    → manager + admin (journal des emails)
 *   /api/orders  (POST)  → client authentifié
 *   /api/cart            → client authentifié
 *   /api/addresses       → client authentifié
 *
 * Note : le middleware valide le JWT, mais la vérification finale du
 * rôle en base de données est faite par getAuthUser() dans chaque route.
 * C'est une défense en profondeur : même si le middleware est contourné,
 * la route re-vérifie.
 */

// Simple in-memory rate limiter for auth endpoints (per IP).
// Note: this resets on every cold start, but it's enough to slow down
// brute-force attacks in production. For a more robust solution, use
// Upstash Ratelimit or similar.
const authAttempts = new Map<string, { count: number; reset: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 10 // 10 attempts per minute per IP

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = authAttempts.get(ip)
  if (!entry || entry.reset < now) {
    authAttempts.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count += 1
  return true
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xreal = req.headers.get('x-real-ip')
  if (xreal) return xreal
  return 'unknown'
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const method = req.method.toUpperCase()

  // ──────────────────────────────────────────────────────────────
  // 1. Rate-limit auth endpoints (login, register, forgot-password)
  // ──────────────────────────────────────────────────────────────
  if (
    pathname === '/api/auth/login' ||
    pathname === '/api/auth/register' ||
    pathname === '/api/auth/forgot-password'
  ) {
    const ip = getClientIp(req)
    if (!rateLimit(ip)) {
      return NextResponse.json(
        {
          error:
            'Trop de tentatives. Réessayez dans une minute.',
        },
        { status: 429 }
      )
    }
    // Don't return — let the request go through to the route handler.
    return NextResponse.next()
  }

  // ──────────────────────────────────────────────────────────────
  // 2. Admin routes — require manager or admin role
  // ──────────────────────────────────────────────────────────────
  const isAdminPanelRoute =
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/notifications') ||
    pathname.startsWith('/api/email-logs')

  if (isAdminPanelRoute) {
    const token = readSessionCookie(req)
    const session = await verifySession(token)

    if (!session) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      )
    }

    const role = session.role
    // /api/admin/users is admin-only
    if (pathname.startsWith('/api/admin/users')) {
      if (role !== 'admin') {
        return NextResponse.json(
          { error: 'Accès réservé aux administrateurs' },
          { status: 403 }
        )
      }
    } else {
      // Other /api/admin/* require manager or admin
      if (role !== 'admin' && role !== 'manager') {
        return NextResponse.json(
          { error: 'Accès interdit — permissions insuffisantes' },
          { status: 403 }
        )
      }
    }

    // Inject the user id + role into request headers so the route can
    // read them WITHOUT needing to re-verify the JWT. The route will
    // STILL fetch the user from DB to confirm isActive + role.
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-auth-user-id', session.sub)
    requestHeaders.set('x-auth-role', session.role)
    requestHeaders.set('x-auth-email', session.email)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  // ──────────────────────────────────────────────────────────────
  // 3. Admin-only write routes (products, slides, content, settings, menu, subcategories, variants)
  //    These are not under /api/admin/ but need admin protection on writes.
  // ──────────────────────────────────────────────────────────────
  const isAdminWriteRoute =
    (pathname === '/api/products' && method !== 'GET') ||
    (pathname === '/api/slides' && method !== 'GET') ||
    (pathname === '/api/content' && method !== 'GET') ||
    (pathname === '/api/menu' && method !== 'GET') ||
    (pathname === '/api/subcategories' && method !== 'GET') ||
    (pathname === '/api/variants' && method !== 'GET') ||
    pathname.startsWith('/api/settings/') && method !== 'GET'

  if (isAdminWriteRoute) {
    const token = readSessionCookie(req)
    const session = await verifySession(token)

    if (!session) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      )
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Accès réservé aux administrateurs' },
        { status: 403 }
      )
    }

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-auth-user-id', session.sub)
    requestHeaders.set('x-auth-role', session.role)
    requestHeaders.set('x-auth-email', session.email)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  // ──────────────────────────────────────────────────────────────
  // 4. User-only routes — require authenticated customer
  // ──────────────────────────────────────────────────────────────
  const isUserRoute =
    (pathname.startsWith('/api/cart') && method !== 'GET') ||
    pathname.startsWith('/api/addresses') ||
    (pathname === '/api/orders' && method === 'GET')

  if (isUserRoute) {
    const token = readSessionCookie(req)
    const session = await verifySession(token)

    if (!session) {
      return NextResponse.json(
        { error: 'Authentification requise' },
        { status: 401 }
      )
    }

    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-auth-user-id', session.sub)
    requestHeaders.set('x-auth-role', session.role)
    requestHeaders.set('x-auth-email', session.email)
    return NextResponse.next({
      request: { headers: requestHeaders },
    })
  }

  return NextResponse.next()
}

export const config = {
  // Only run middleware on API routes that need protection.
  matcher: [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/admin/:path*',
    '/api/notifications',
    '/api/email-logs',
    '/api/cart/:path*',
    '/api/addresses/:path*',
    '/api/orders',
    '/api/products',
    '/api/slides',
    '/api/slides/:path*',
    '/api/content',
    '/api/menu',
    '/api/subcategories',
    '/api/variants',
    '/api/settings/:path*',
  ],
}
