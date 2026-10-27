import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { verifyResetToken, passwordFingerprint } from '@/lib/reset-token'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

/** POST /api/auth/reset-password { token, password } — consomme le lien reçu par e-mail. */
export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit(`reset:ip:${getClientIp(request)}`, 10, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
    }

    const { token, password } = await request.json()
    if (typeof token !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir entre 8 et 128 caractères' }, { status: 400 })
    }

    const invalid = NextResponse.json({ error: 'Lien invalide ou expiré. Refaites une demande.' }, { status: 400 })
    const claims = await verifyResetToken(token)
    if (!claims) return invalid

    const user = await db.user.findUnique({ where: { id: claims.userId } })
    // Usage unique : le lien est lié à l'empreinte de l'ancien mot de passe
    if (!user || !user.isActive || passwordFingerprint(user.password) !== claims.ph) return invalid

    await db.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(password, 12) },
    })

    return NextResponse.json({ message: 'Mot de passe modifié. Vous pouvez vous connecter.' })
  } catch (error) {
    console.error('[RESET-PASSWORD] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la réinitialisation' }, { status: 500 })
  }
}
