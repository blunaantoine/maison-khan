import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

/**
 * Journal des emails envoyés (admin / manager).
 *
 * GET /api/email-logs
 *   ?status=sent|failed|skipped   filtre par statut
 *   &type=payment_receipt|...     filtre par type
 *   &q=texte                      recherche dans destinataire / sujet / commande
 *   &limit=100                    1..200 (défaut 100)
 * → { logs, stats: { sent, failed, skipped, total, configured, emailoqui } }
 *
 * Les emails « skipped » = RESEND_API_KEY absente (emails simulés).
 * stats.emailoqui.configured = suivi EmailOqui actif (clé EMAILOQUI_API_KEY).
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

export async function GET(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || ''
    const type = searchParams.get('type') || ''
    const q = (searchParams.get('q') || '').trim()
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 100))

    const where: Prisma.EmailLogWhereInput = {}
    if (['sent', 'failed', 'skipped'].includes(status)) where.status = status
    if (type) where.type = type
    if (q) {
      where.OR = [
        { to: { contains: q } },
        { subject: { contains: q } },
        { orderId: { contains: q } },
      ]
    }

    const [logs, sent, failed, skipped, total] = await Promise.all([
      db.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      db.emailLog.count({ where: { status: 'sent' } }),
      db.emailLog.count({ where: { status: 'failed' } }),
      db.emailLog.count({ where: { status: 'skipped' } }),
      db.emailLog.count(),
    ])

    return NextResponse.json({
      logs,
      stats: {
        sent,
        failed,
        skipped,
        total,
        configured: Boolean(process.env.RESEND_API_KEY),
        emailoqui: {
          configured: Boolean(process.env.EMAILOQUI_API_KEY),
        },
        adminAlert: {
          configured: Boolean(
            (process.env.ADMIN_ALERT_EMAIL || '').trim() ||
            (await db.user.count({ where: { role: { in: ['admin', 'manager'] }, isActive: true, email: { not: '' } } }))
          ),
          addresses: (process.env.ADMIN_ALERT_EMAIL || '').split(',').map((e) => e.trim()).filter((e) => e.includes('@')),
        },
      },
    })
  } catch (error) {
    console.error('Email logs error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
