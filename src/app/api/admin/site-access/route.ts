import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { isSiteClosed, setSiteClosed } from '@/lib/site-access'

/**
 * GET /api/admin/site-access → { closed }            (admin / manager)
 * PUT /api/admin/site-access { closed: boolean }     (admin uniquement)
 */

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) {
    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
  }
  return NextResponse.json({ closed: await isSiteClosed() })
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Réservé aux administrateurs' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  if (typeof body.closed !== 'boolean') {
    return NextResponse.json({ error: 'Paramètre « closed » (true/false) requis' }, { status: 400 })
  }
  await setSiteClosed(body.closed)
  console.log(`[site-access] Site ${body.closed ? 'FERMÉ' : 'OUVERT'} au public par ${user.email}`)
  return NextResponse.json({ closed: body.closed })
}
