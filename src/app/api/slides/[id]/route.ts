import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || user.role !== 'admin') return null
  return user
}

// DELETE - Delete a hero slide
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const { id } = await params
    
    await db.heroSlide.delete({
      where: { id }
    })
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting slide:', error)
    return NextResponse.json({ error: 'Failed to delete slide' }, { status: 500 })
  }
}
