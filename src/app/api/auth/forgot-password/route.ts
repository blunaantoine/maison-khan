import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { sendEmail, getPasswordResetEmail } from '@/lib/email'

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

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    // Always return success to avoid revealing if user exists
    if (!user) {
      return NextResponse.json({
        message: 'Si cet email existe, un nouveau mot de passe a été envoyé'
      })
    }

    // Generate new random password
    const newPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase()
    const hashedPassword = await bcrypt.hash(newPassword, 12)

    // Update user password
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    // Check if RESEND_API_KEY is configured
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxx') {
      return NextResponse.json({
        message: 'Le service d\'email n\'est pas configuré. Contactez l\'administrateur pour réinitialiser votre mot de passe.'
      })
    }

    // Send email
    try {
      const emailResult = await sendEmail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe',
        html: getPasswordResetEmail(newPassword)
      })

      if (!emailResult.success) {
        return NextResponse.json({
          message: 'L\'email n\'a pas pu être envoyé. Contactez l\'administrateur.'
        })
      }

      return NextResponse.json({
        message: 'Un nouveau mot de passe a été envoyé à votre email'
      })
    } catch (emailError) {
      console.error('[FORGOT-PASSWORD] Email sending failed:', emailError instanceof Error ? emailError.message : 'unknown')
      return NextResponse.json({
        message: 'Erreur d\'envoi d\'email. Contactez l\'administrateur.'
      })
    }

  } catch (error) {
    console.error('[FORGOT-PASSWORD] Error:', error instanceof Error ? error.message : 'unknown')
    return NextResponse.json(
      { error: 'Erreur lors de la réinitialisation' },
      { status: 500 }
    )
  }
}
