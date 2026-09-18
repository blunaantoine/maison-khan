import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Journal des emails envoyés aux clients (admin / manager).
 *
 * GET /api/email-logs → { logs, stats: { sent, failed, skipped, total } }
 * Les emails « skipped » = RESEND_API_KEY absente (emails simulés).
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

    const [logs, sent, failed, skipped] = await Promise.all([
      db.emailLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      db.emailLog.count({ where: { status: 'sent' } }),
      db.emailLog.count({ where: { status: 'failed' } }),
      db.emailLog.count({ where: { status: 'skipped' } }),
    ])

    return NextResponse.json({
      logs,
      stats: {
        sent,
        failed,
        skipped,
        total: sent + failed + skipped,
        configured: Boolean(process.env.RESEND_API_KEY),
      },
    })
  } catch (error) {
    console.error('Email logs error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
