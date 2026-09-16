import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      )
    }

    // Anti brute-force : 8 tentatives par IP + email toutes les 15 minutes
    const ip = getClientIp(request)
    const limit = rateLimit(`login:${ip}:${String(email).toLowerCase()}`, 8, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: `Trop de tentatives. Réessayez dans ${Math.ceil(limit.retryAfterSeconds / 60)} minute(s).` },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      )
    }

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Ce compte a été désactivé' },
        { status: 401 }
      )
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password)

    if (!isValid) {
      return NextResponse.json(
        { error: 'Email ou mot de passe incorrect' },
        { status: 401 }
      )
    }

    // Return user (without password)
    const { password: _, ...userWithoutPassword } = user

    return NextResponse.json({
      message: 'Connexion réussie',
      user: userWithoutPassword
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la connexion' },
      { status: 500 }
    )
  }
}
