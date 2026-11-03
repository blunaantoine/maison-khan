import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

/**
 * Images de l'atelier — gestion d'une image (admin).
 *
 * PUT    (admin) : met à jour la légende et/ou l'ordre (flèches ↑↓ de l'admin).
 * DELETE (admin) : supprime l'image.
 */

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || (user.role !== 'admin' && user.role !== 'manager')) return null
  return user
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const { id } = await params
    const body = await request.json()
    const { caption, order } = body

    const data: { caption?: string | null; order?: number } = {}
    if (caption !== undefined) {
      data.caption = typeof caption === 'string' ? caption.trim().slice(0, 120) || null : null
    }
    if (typeof order === 'number' && Number.isFinite(order) && order >= 0) {
      data.order = Math.floor(order)
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Rien à mettre à jour' }, { status: 400 })
    }

    const updated = await db.atelierImage.update({ where: { id }, data })
    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating atelier image:', error)
    return NextResponse.json({ error: 'Failed to update atelier image' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const { id } = await params
    await db.atelierImage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting atelier image:', error)
    return NextResponse.json({ error: 'Failed to delete atelier image' }, { status: 500 })
  }
}
