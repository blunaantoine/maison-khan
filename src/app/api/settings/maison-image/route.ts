import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

// GET - Fetch maison image
export async function GET() {
  try {
    const setting = await db.siteSetting.findUnique({
      where: { key: 'maison_image' }
    })
    
    return NextResponse.json(setting || { value: null })
  } catch (error) {
    console.error('Error fetching maison image:', error)
    return NextResponse.json({ error: 'Failed to fetch maison image' }, { status: 500 })
  }
}

// POST - Update maison image
export async function POST(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    const { value } = await request.json()
    
    const setting = await db.siteSetting.upsert({
      where: { key: 'maison_image' },
      update: { value },
      create: { key: 'maison_image', value }
    })
    
    return NextResponse.json(setting)
  } catch (error) {
    console.error('Error updating maison image:', error)
    return NextResponse.json({ error: 'Failed to update maison image' }, { status: 500 })
  }
}

// DELETE - Remove maison image
export async function DELETE(request: NextRequest) {
  try {
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    await db.siteSetting.delete({
      where: { key: 'maison_image' }
    })
    
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: true })
  }
}
