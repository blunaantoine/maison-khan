import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  sendToUsers,
  sendToRole,
  getHistory,
  getStats,
  getRecipients,
} from '@/lib/notifications/service'
import {
  isValidNotificationType,
  validateNotificationTitle,
  validateNotificationMessage,
  validateNotificationLink,
  NOTIFICATION_TYPE_LABELS,
} from '@/lib/notifications/types'

/**
 * Interface ADMIN des notifications in-app (cloche 🔔 client).
 *
 * GET  /api/admin/notifications?page=1
 *      → { batches (historique groupé par envoi), total, page, pageSize,
 *          stats { totalSent, totalUnread, sentToday, byType },
 *          recipients (liste de destinataires pour le composer) }
 *
 * POST /api/admin/notifications
 *      body: {
 *        type: 'order'|'payment'|'message'|'promotion'|'system'|'account',
 *        title, message, link?,
 *        target: 'user' | 'users' | 'role' | 'all',
 *        userId? , userIds? , role? ('customer'|'manager'|'admin')
 *      }
 *      → { message, sentCount }
 *
 * Sécurité (défense en profondeur) :
 *  - middleware : /api/admin/* exige manager ou admin (JWT edge)
 *  - authorize() : re-validation en base (actif + rôle cohérent)
 *  - un client ne peut JAMAIS atteindre ces routes (403 middleware).
 */

const ALLOWED_ROLES = ['customer', 'manager', 'admin']

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
  if (user.role !== role) return null // rôle changé après émission du JWT
  return user
}

export async function GET(request: NextRequest) {
  try {
    const admin = await authorize(request)
    if (!admin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)

    const [history, stats, recipients] = await Promise.all([
      getHistory(page),
      getStats(),
      getRecipients(),
    ])

    return NextResponse.json({ ...history, stats, recipients })
  } catch (error) {
    console.error('Admin notifications GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await authorize(request)
    if (!admin) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { type, title, message, link, target } = body

    // ── Validation des champs ──
    if (typeof type !== 'string' || !isValidNotificationType(type)) {
      return NextResponse.json(
        {
          error: `Type invalide — types acceptés : ${Object.values(NOTIFICATION_TYPE_LABELS).join(', ')}`,
        },
        { status: 400 }
      )
    }

    if (typeof title !== 'string') {
      return NextResponse.json({ error: 'Titre requis' }, { status: 400 })
    }
    const titleError = validateNotificationTitle(title)
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 })

    if (typeof message !== 'string') {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }
    const messageError = validateNotificationMessage(message)
    if (messageError) return NextResponse.json({ error: messageError }, { status: 400 })

    if (link !== undefined && link !== null && link !== '') {
      if (typeof link !== 'string') {
        return NextResponse.json({ error: 'Lien invalide' }, { status: 400 })
      }
      const linkError = validateNotificationLink(link)
      if (linkError) return NextResponse.json({ error: linkError }, { status: 400 })
    }

    const input = {
      type,
      title,
      message,
      link: typeof link === 'string' && link.trim() ? link.trim() : null,
      senderId: admin.id,
    }

    // ── Validation du destinataire + envoi ──
    let result: { batchId: string; sentCount: number }

    if (target === 'user') {
      if (typeof body.userId !== 'string' || !body.userId) {
        return NextResponse.json({ error: 'Destinataire requis' }, { status: 400 })
      }
      try {
        result = await sendToUsers(input, [body.userId])
      } catch (e) {
        return NextResponse.json(
          { error: 'Destinataire introuvable ou inactif' },
          { status: 400 }
        )
      }
    } else if (target === 'users') {
      if (
        !Array.isArray(body.userIds) ||
        body.userIds.length === 0 ||
        !body.userIds.every((id: unknown) => typeof id === 'string')
      ) {
        return NextResponse.json(
          { error: 'Sélectionnez au moins un destinataire' },
          { status: 400 }
        )
      }
      try {
        result = await sendToUsers(input, body.userIds)
      } catch (e) {
        const code = e instanceof Error ? e.message : ''
        if (code === 'TOO_MANY_RECIPIENTS') {
          return NextResponse.json(
            { error: 'Maximum 100 destinataires par envoi' },
            { status: 400 }
          )
        }
        return NextResponse.json(
          { error: 'Aucun destinataire valide trouvé' },
          { status: 400 }
        )
      }
    } else if (target === 'role' || target === 'all') {
      const role = target === 'all' ? null : body.role
      if (target === 'role' && (typeof role !== 'string' || !ALLOWED_ROLES.includes(role))) {
        return NextResponse.json(
          { error: 'Rôle invalide — clients, managers ou administrateurs' },
          { status: 400 }
        )
      }
      try {
        result = await sendToRole(input, role)
      } catch {
        return NextResponse.json(
          { error: 'Aucun destinataire actif trouvé pour cette cible' },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: 'Cible invalide — un utilisateur, plusieurs, un rôle ou tous' },
        { status: 400 }
      )
    }

    const plural = result.sentCount > 1 ? 's' : ''
    return NextResponse.json({
      message: `Notification envoyée à ${result.sentCount} destinataire${plural}`,
      sentCount: result.sentCount,
      batchId: result.batchId,
    })
  } catch (error) {
    console.error('Admin notifications POST error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
