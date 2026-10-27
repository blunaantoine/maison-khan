import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail, getPasswordResetEmail } from '@/lib/email'
import { trackEmailEvent, campaignLabel } from '@/lib/emailoqui'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { signResetToken } from '@/lib/reset-token'

const GENERIC_RESPONSE = {
  message: 'Si cet email existe, un lien de réinitialisation vient de lui être envoyé',
}

/**
 * Demande de réinitialisation : envoie un LIEN à usage unique (valable 30 min).
 * Le mot de passe actuel n'est PAS modifié tant que le propriétaire de la boîte
 * mail n'a pas cliqué et choisi un nouveau mot de passe — un tiers ne peut donc
 * plus verrouiller le compte de quelqu'un d'autre. Le lien n'est jamais renvoyé
 * dans la réponse HTTP.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email requis' }, { status: 400 })
    }
    const normalized = email.toLowerCase().trim()

    const ipLimit = rateLimit(`forgot:ip:${getClientIp(request)}`, 5, 15 * 60 * 1000)
    const emailLimit = rateLimit(`forgot:email:${normalized}`, 3, 60 * 60 * 1000)
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez plus tard.' }, { status: 429 })
    }

    const user = await db.user.findUnique({ where: { email: normalized } })
    // Même réponse que l'utilisateur existe ou non (pas d'énumération de comptes)
    if (!user || !user.isActive) return NextResponse.json(GENERIC_RESPONSE)

    const token = await signResetToken(user)
    const base = (process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/$/, '')
    const link = `${base}/reset-password?token=${encodeURIComponent(token)}`
    const subject = 'Réinitialisation de votre mot de passe'

    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY === 're_xxx') {
      try {
        await db.emailLog.create({
          data: { to: user.email, subject, type: 'password_reset', status: 'skipped', error: 'RESEND_API_KEY absente' },
        })
      } catch { /* jamais bloquant */ }
      return NextResponse.json(GENERIC_RESPONSE)
    }

    let ok = false
    let errorText: string | null = null
    try {
      const result = await sendEmail({ to: user.email, subject, html: getPasswordResetEmail(link) })
      ok = result.success
      if (!ok) errorText = String(result.error ?? 'erreur inconnue')
    } catch (e) {
      errorText = String(e)
    }

    trackEmailEvent({ email: user.email, type: ok ? 'SENT' : 'FAILED', campaign: campaignLabel('password_reset') })
    try {
      await db.emailLog.create({
        data: { to: user.email, subject, type: 'password_reset', status: ok ? 'sent' : 'failed', error: errorText },
      })
    } catch { /* jamais bloquant */ }

    return NextResponse.json(GENERIC_RESPONSE)
  } catch (error) {
    console.error('[FORGOT-PASSWORD] Error:', error)
    return NextResponse.json({ error: 'Erreur lors de la réinitialisation' }, { status: 500 })
  }
}
