import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

// GET - Fetch all colors
export async function GET() {
  try {
    const colors = await db.productColor.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(colors)
  } catch (error) {
    console.error('Error fetching colors:', error)
    return NextResponse.json({ error: 'Failed to fetch colors' }, { status: 500 })
  }
}

// DELETE - Delete all colors
export async function DELETE(request: NextRequest) {
  try {
    // Opération destructrice (supprime TOUTES les couleurs de TOUS les produits) :
    // administrateur uniquement + confirmation explicite.
    const user = await getAuthUser(request)
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 })
    }
    if (request.nextUrl.searchParams.get('confirm') !== 'DELETE_ALL_COLORS') {
      return NextResponse.json({ error: 'Confirmation requise (?confirm=DELETE_ALL_COLORS)' }, { status: 400 })
    }
    const result = await db.productColor.deleteMany({})
    console.log(`[COLORS] Deleted ${result.count} colors`)
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    console.error('Error deleting colors:', error)
    return NextResponse.json({ error: 'Failed to delete colors' }, { status: 500 })
  }
}
