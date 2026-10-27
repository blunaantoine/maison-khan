import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    // L'identité vient UNIQUEMENT de la session (cookie signé) — l'ancien code
    // acceptait un userId dans le corps de la requête, donc n'importe qui
    // pouvait tester le « mot de passe actuel » de n'importe quel compte.
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })
    }
    const userId = authUser.id

    const limit = rateLimit(`chgpwd:${userId}`, 5, 15 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez plus tard.' },
        { status: 429 }
      )
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
    }

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      )
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        { error: 'Le mot de passe doit contenir au moins 8 caractères' },
        { status: 400 }
      )
    }

    // Find user
    const user = await db.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Utilisateur non trouvé' },
        { status: 404 }
      )
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password)
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Mot de passe actuel incorrect' },
        { status: 400 }
      )
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update password
    await db.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    })

    return NextResponse.json({
      message: 'Mot de passe modifié avec succès'
    })

  } catch (error) {
    console.error('Change password error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du changement de mot de passe' },
      { status: 500 }
    )
  }
}
