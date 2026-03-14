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
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // Update user password
    await db.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    // Send email
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      html: getPasswordResetEmail(newPassword)
    })

    if (!emailResult.success) {
      console.error('Failed to send email:', emailResult.error)
      // Still return success to user, but log the error
      return NextResponse.json({
        message: 'Si cet email existe, un nouveau mot de passe a été envoyé',
        // For demo: return password if email fails
        newPassword: newPassword
      })
    }

    return NextResponse.json({
      message: 'Un nouveau mot de passe a été envoyé à votre email'
    })

  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la réinitialisation' },
      { status: 500 }
    )
  }
}
