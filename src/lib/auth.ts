import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Verify that the request comes from an authenticated admin user.
 * Usage in any API route:
 *
 *   const check = await requireAdmin(request)
 *   if (check) return check  // 401/403 response
 *
 * Returns null if the user is admin, otherwise returns an error NextResponse.
 */
export async function requireAdmin(request: NextRequest) {
  const userId = request.headers.get('x-user-id')

  if (!userId) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  })

  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
  }

  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
  }

  return null
}

/**
 * Extract the authenticated user id from the request, or null.
 */
export function getUserId(request: NextRequest): string | null {
  const userId = request.headers.get('x-user-id')
  return userId && userId.trim() !== '' ? userId : null
}
