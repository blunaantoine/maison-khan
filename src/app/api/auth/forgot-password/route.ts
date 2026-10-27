import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomInt } from 'crypto'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { sendEmail, getPasswordResetEmail } from '@/lib/email'
import { trackEmailEvent, campaignLabel } from '@/lib/emailoqui'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Email requis' },
        { status: 400 }
      )
    }

    if (typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }

    // Anti-abus : ce endpoint réinitialise réellement le mot de passe, on le
    // limite par IP et par adresse (évite le verrouillage d'un compte par un tiers).
    const ipLimit = rateLimit(`forgot:ip:${getClientIp(request)}`, 5, 15 * 60 * 1000)
    const emailLimit = rateLimit(`forgot:email:${email.toLowerCase()}`, 3, 60 * 60 * 1000)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Trop de demandes. Réessayez plus tard.' },
        { status: 429 }
      )
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    // Always return success to avoid revealing if user exists
    if (!user) {
      console.log('[FORGOT-PASSWORD] User not found:', email)
      return NextResponse.json({
        message: 'Si cet email existe, un nouveau mot de passe a été envoyé'
      })
    }

    console.log('[FORGOT-PASSWORD] User found:', user.email)

    // Generate new random password
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    const newPassword = Array.from({ length: 14 }, () => alphabet[randomInt(alphabet.length)]).join('')
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update user password
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    console.log('[FORGOT-PASSWORD] Password updated for user:', user.email)

    // Check if RESEND_API_KEY is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxx') {
      console.log('[FORGOT-PASSWORD] RESEND_API_KEY not configured, returning password directly')
      // Journalisation (statut « skipped » = email simulé) — pas d'événement
      // EmailOqui car aucun email réel n'est parti.
      try {
        await db.emailLog.create({
          data: {
            to: user.email,
            subject: 'Réinitialisation de votre mot de passe',
            type: 'password_reset',
            status: 'skipped',
            error: 'RESEND_API_KEY absente',
          },
        })
      } catch { /* jamais bloquant */ }
      // Ne JAMAIS renvoyer le mot de passe dans la réponse : n'importe qui
      // pourrait alors prendre le contrôle de n'importe quel compte (admin inclus).
      return NextResponse.json({
        message: 'Si cet email existe, un nouveau mot de passe a été envoyé'
      })
    }

    // Send email
    try {
      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe',
        html: getPasswordResetEmail(newPassword)
      })

      // Télémétrie EmailOqui + journalisation admin — jamais bloquantes.
      trackEmailEvent({
        email: user.email,
        type: emailResult.success ? 'SENT' : 'FAILED',
        campaign: campaignLabel('password_reset'),
      })
      try {
        await db.emailLog.create({
          data: {
            to: user.email,
            subject: 'Réinitialisation de votre mot de passe',
            type: 'password_reset',
            status: emailResult.success ? 'sent' : 'failed',
            error: emailResult.success ? null : String(emailResult.error ?? 'erreur inconnue'),
          },
        })
      } catch { /* jamais bloquant */ }

      if (!emailResult.success) {
        console.error('[FORGOT-PASSWORD] Failed to send email:', emailResult.error)
        return NextResponse.json({
          message: 'Si cet email existe, un nouveau mot de passe a été envoyé'
        })
      }

      console.log('[FORGOT-PASSWORD] Email sent successfully to:', user.email)
      return NextResponse.json({
        message: 'Un nouveau mot de passe a été envoyé à votre email'
      })
    } catch (emailError) {
      console.error('[FORGOT-PASSWORD] Email error:', emailError)
      trackEmailEvent({
        email: user.email,
        type: 'FAILED',
        campaign: campaignLabel('password_reset'),
      })
      try {
        await db.emailLog.create({
          data: {
            to: user.email,
            subject: 'Réinitialisation de votre mot de passe',
            type: 'password_reset',
            status: 'failed',
            error: String(emailError),
          },
        })
      } catch { /* jamais bloquant */ }
      return NextResponse.json({
        message: 'Si cet email existe, un nouveau mot de passe a été envoyé'
      })
    }

  } catch (error) {
    console.error('[FORGOT-PASSWORD] Error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la réinitialisation' },
      { status: 500 }
    )
  }
}
