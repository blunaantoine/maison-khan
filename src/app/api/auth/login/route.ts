import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { signSession, buildSessionCookie } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

// Hash bcrypt factice (coût 10) pour égaliser le temps de réponse
const DUMMY_HASH = bcrypt.hashSync('maison-khan-dummy-password', 10)

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

    if (typeof email !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }

    // Anti brute-force PAR COMPTE (en plus de la limite par IP du middleware) :
    // empêche de deviner un mot de passe en changeant d'adresse IP.
    const accountLimit = rateLimit(`login:acct:${email.toLowerCase()}`, 8, 15 * 60 * 1000)
    if (!accountLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives sur ce compte. Réessayez dans quelques minutes.' },
        { status: 429 }
      )
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (!user) {
      // Même durée que pour un vrai compte : on ne révèle pas si l'email existe
      await bcrypt.compare(password, DUMMY_HASH)
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

    // Sign JWT and set HttpOnly cookie
    const token = await signSession({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    // Return user (without password)
    const { password: _, ...userWithoutPassword } = user

    const response = NextResponse.json({
      message: 'Connexion réussie',
      user: userWithoutPassword
    })
    response.headers.set('Set-Cookie', buildSessionCookie(token))
    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la connexion' },
      { status: 500 }
    )
  }
}
