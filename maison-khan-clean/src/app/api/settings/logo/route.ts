import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
export async function POST(request: Request) {
  try {
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
