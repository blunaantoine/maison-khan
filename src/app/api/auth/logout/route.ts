import { NextRequest, NextResponse } from 'next/server'
import { buildClearSessionCookie } from '@/lib/auth'

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ message: 'Déconnexion réussie' })
  response.headers.set('Set-Cookie', buildClearSessionCookie())
  return response
}
