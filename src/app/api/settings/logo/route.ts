import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

async function authorizeAdmin(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user || user.role !== 'admin') return null
  return user
}

// GET - Fetch logo
export async function GET() {
  try {
    const logo = await db.siteSetting.findUnique({
      where: { key: 'logo' }
    })
    
    return NextResponse.json(logo)
  } catch (error) {
    console.error('Error fetching logo:', error)
    return NextResponse.json({ error: 'Failed to fetch logo' }, { status: 500 })
  }
}

// POST - Save logo
export async function POST(request: NextRequest) {
  try {
    const admin = await authorizeAdmin(request)
    if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

    const body = await request.json()
    const { value } = body
    
    const logo = await db.siteSetting.upsert({
      where: { key: 'logo' },
      update: { value },
      create: { key: 'logo', value }
    })
    
    return NextResponse.json(logo)
  } catch (error) {
    console.error('Error saving logo:', error)
    return NextResponse.json({ error: 'Failed to save logo' }, { status: 500 })
  }
}
