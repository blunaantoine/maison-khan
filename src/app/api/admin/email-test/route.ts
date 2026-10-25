import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'

/**
 * Envoi d'un e-mail de test depuis le panneau admin (onglet E-mails).
 *
 * POST /api/admin/email-test  { to: "adresse@domaine" }
 * → { success: true }  ou  { success: false, error }
 *
 * Sert à vérifier en un clic que la configuration Resend (clé, domaine,
 * délivrabilité) fonctionne, sans attendre une vraie commande.
 * Chaque test est journalisé dans EmailLog (type « test »).
 */

async function authorize(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-role')
  if (!userId || !role) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  if (user.role !== 'admin' && user.role !== 'manager') return null
  return user
}

const TEST_HTML = `
  <!DOCTYPE html>
  <html lang="fr"><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:24px;background:#EDE8E1;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;padding:40px;text-align:center;">
      <p style="margin:0;font-family:Georgia,serif;font-size:24px;letter-spacing:5px;color:#0A0A0A;">MAISON KHAN</p>
      <p style="margin:6px 0 24px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#C4A77D;">Test d'envoi</p>
      <h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:22px;color:#15803D;">✓ Configuration e-mail opérationnelle</h1>
      <p style="margin:0;color:#6B6560;font-size:14px;line-height:1.6;">
        Si vous lisez cet e-mail, l'envoi fonctionne : clé Resend valide,
        domaine vérifié, réception OK.<br><br>
        Les reçus de paiement et les alertes staff partiront correctement.
      </p>
    </div>
  </body></html>`

export async function POST(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const to = typeof body?.to === 'string' ? body.to.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'Adresse e-mail invalide' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      await db.emailLog.create({
        data: { to, subject: 'Test d\'envoi — configuration e-mail', type: 'test', status: 'skipped', error: 'RESEND_API_KEY absente' },
      }).catch(() => undefined)
      return NextResponse.json(
        { success: false, error: 'RESEND_API_KEY absente — ajoutez-la dans .env puis relancez update.sh' },
        { status: 400 }
      )
    }

    const result = await sendEmail({
      to,
      subject: 'Test d\'envoi — configuration e-mail ✓',
      html: TEST_HTML,
    })

    await db.emailLog.create({
      data: {
        to,
        subject: 'Test d\'envoi — configuration e-mail',
        type: 'test',
        status: result.success ? 'sent' : 'failed',
        error: result.success ? null : String(result.error ?? 'erreur inconnue'),
      },
    }).catch(() => undefined)

    if (!result.success) {
      return NextResponse.json({ success: false, error: 'Échec d\'envoi via Resend — voir le journal' }, { status: 502 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email test error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
