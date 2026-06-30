import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

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
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const result = await db.productColor.deleteMany({})
    console.log(`[COLORS] Deleted ${result.count} colors`)
    return NextResponse.json({ success: true, count: result.count })
  } catch (error) {
    console.error('Error deleting colors:', error)
    return NextResponse.json({ error: 'Failed to delete colors' }, { status: 500 })
  }
}
