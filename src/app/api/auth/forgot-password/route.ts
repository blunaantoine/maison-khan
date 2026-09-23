import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
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

    console.log('[FORGOT-PASSWORD] Request for email:', email)

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
    const newPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase()
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
      return NextResponse.json({
        message: 'Email non configuré',
        newPassword: newPassword,
        note: 'Configurez RESEND_API_KEY pour envoyer des emails'
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
        // Return password if email fails
        return NextResponse.json({
          message: 'L\'email n\'a pas pu être envoyé',
          newPassword: newPassword
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
        message: 'Erreur d\'envoi d\'email',
        newPassword: newPassword
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
