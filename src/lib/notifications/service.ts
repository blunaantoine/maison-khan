import { db } from '@/lib/db'
import {
  NOTIFICATION_LIMITS,
  isValidNotificationType,
  type NotificationType,
} from './types'

/**
 * MAISON KHAN — Service de notifications client (cloche 🔔).
 *
 * Couche métier unique entre les routes API et Prisma :
 *  - envoi manuel (admin) : destinataire(s) précis, par rôle, ou tous
 *  - notifications automatiques (événements métier → src/lib/notify.ts)
 *  - lecture/pagination/cotation côté destinataire (TOUJOURS filtré par userId)
 *  - historique groupé par envoi (batchId) + statistiques pour l'admin
 *
 * Tolérance aux pannes : les notifications automatiques ne doivent JAMAIS
 * faire échouer l'opération métier — les fonctions d'événement lèvent
 * silencieusement (journalisées). Les fonctions d'envoi manuel (API admin)
 * lèvent normalement : l'admin doit voir l'erreur.
 */

export interface ClientNotificationDto {
  id: string
  userId: string
  type: string
  title: string
  message: string
  link: string | null
  orderId: string | null
  senderId: string | null
  isRead: boolean
  readAt: Date | null
  createdAt: Date
}

export interface ListOptions {
  page?: number
  pageSize?: number
  type?: string | null
  unreadOnly?: boolean
}

const SELECT_FIELDS = {
  id: true,
  userId: true,
  type: true,
  title: true,
  message: true,
  link: true,
  orderId: true,
  senderId: true,
  isRead: true,
  readAt: true,
  createdAt: true,
} as const

function normalizePage(page?: number, pageSize?: number) {
  const p = Math.max(1, Math.floor(page || 1))
  const size = Math.min(50, Math.max(1, Math.floor(pageSize || NOTIFICATION_LIMITS.pageSize)))
  return { skip: (p - 1) * size, take: size, page: p, pageSize: size }
}

function newBatchId(): string {
  return crypto.randomUUID()
}

// ──────────────────────────────────────────────
// Envoi manuel (admin) — lève en cas d'erreur
// ──────────────────────────────────────────────

export interface ManualNotificationInput {
  type: string
  title: string
  message: string
  link?: string | null
  senderId: string
}

/** Envoie à des destinataires explicites (un ou plusieurs). */
export async function sendToUsers(
  input: ManualNotificationInput,
  userIds: string[]
): Promise<{ batchId: string; sentCount: number }> {
  if (!isValidNotificationType(input.type)) throw new Error('TYPE_INVALID')
  if (userIds.length === 0) throw new Error('NO_RECIPIENTS')
  if (userIds.length > NOTIFICATION_LIMITS.maxExplicitRecipients)
    throw new Error('TOO_MANY_RECIPIENTS')

  // Uniquement des utilisateurs existants, actifs — les ids inconnus sont ignorés
  const recipients = await db.user.findMany({
    where: { id: { in: userIds }, isActive: true },
    select: { id: true },
  })
  if (recipients.length === 0) throw new Error('NO_VALID_RECIPIENTS')

  const batchId = newBatchId()
  await db.clientNotification.createMany({
    data: recipients.map((r) => ({
      userId: r.id,
      type: input.type,
      title: input.title.trim(),
      message: input.message.trim(),
      link: input.link?.trim() || null,
      senderId: input.senderId,
      batchId,
    })),
  })
  return { batchId, sentCount: recipients.length }
}

/** Envoie à tous les utilisateurs actifs d'un rôle (ou tous rôles si null). */
export async function sendToRole(
  input: ManualNotificationInput,
  role: string | null
): Promise<{ batchId: string; sentCount: number }> {
  if (!isValidNotificationType(input.type)) throw new Error('TYPE_INVALID')
  const batchId = newBatchId()
  const recipients = await db.user.findMany({
    where: role ? { isActive: true, role } : { isActive: true },
    select: { id: true },
  })
  if (recipients.length === 0) throw new Error('NO_VALID_RECIPIENTS')

  // createMany par lots (SQLite limite le nombre de variables par requête)
  const CHUNK = 200
  for (let i = 0; i < recipients.length; i += CHUNK) {
    await db.clientNotification.createMany({
      data: recipients.slice(i, i + CHUNK).map((r) => ({
        userId: r.id,
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        link: input.link?.trim() || null,
        senderId: input.senderId,
        batchId,
      })),
    })
  }
  return { batchId, sentCount: recipients.length }
}

// ──────────────────────────────────────────────
// Notifications automatiques (événements métier) — jamais bloquantes
// ──────────────────────────────────────────────

/**
 * Notification automatique pour UN destinataire (paiement reçu, commande
 * expédiée…). senderId = null. Ne lève jamais : un échec est journalisé.
 */
export async function pushEventNotification(params: {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string | null
  orderId?: string | null
}): Promise<void> {
  try {
    await db.clientNotification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        link: params.link ?? null,
        orderId: params.orderId ?? null,
        senderId: null,
        batchId: newBatchId(),
      },
    })
  } catch (e) {
    console.error('[notifications] Notification automatique non créée :', e)
  }
}

// ──────────────────────────────────────────────
// Lecture côté destinataire — TOUJOURS filtré par userId
// ──────────────────────────────────────────────

export async function listForUser(
  userId: string,
  options: ListOptions = {}
): Promise<{ notifications: ClientNotificationDto[]; total: number; page: number; pageSize: number; unreadCount: number }> {
  const { skip, take, page, pageSize } = normalizePage(options.page, options.pageSize)
  const where = {
    userId,
    ...(options.type ? { type: options.type } : {}),
    ...(options.unreadOnly ? { isRead: false } : {}),
  }

  const [notifications, total, unreadCount] = await Promise.all([
    db.clientNotification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: SELECT_FIELDS,
    }),
    db.clientNotification.count({ where }),
    db.clientNotification.count({ where: { userId, isRead: false } }),
  ])

  return { notifications, total, page, pageSize, unreadCount }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    return await db.clientNotification.count({ where: { userId, isRead: false } })
  } catch {
    return 0
  }
}

/** Marque UNE notification comme lue — uniquement si elle appartient à l'utilisateur. */
export async function markRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await db.clientNotification.updateMany({
    where: { id: notificationId, userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return result.count > 0
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await db.clientNotification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  })
  return result.count
}

/** Supprime UNE notification — uniquement si elle appartient à l'utilisateur. */
export async function deleteForUser(userId: string, notificationId: string): Promise<boolean> {
  const result = await db.clientNotification.deleteMany({
    where: { id: notificationId, userId },
  })
  return result.count > 0
}

// ──────────────────────────────────────────────
// Historique & statistiques (admin)
// ──────────────────────────────────────────────

export interface NotificationBatch {
  batchId: string
  type: string
  title: string
  message: string
  link: string | null
  senderId: string | null
  senderName: string | null
  sentCount: number
  createdAt: string
}

/**
 * Historique des envois, groupé par batchId (un envoi « à tous » = 1 ligne
 * avec le nombre de destinataires, pas N lignes identiques).
 */
export async function getHistory(page = 1): Promise<{
  batches: NotificationBatch[]
  total: number
  page: number
  pageSize: number
}> {
  const pageSize = NOTIFICATION_LIMITS.historyPageSize
  const p = Math.max(1, Math.floor(page || 1))

  const [groups, totalGroups] = await Promise.all([
    db.clientNotification.groupBy({
      by: ['batchId'],
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
      skip: (p - 1) * pageSize,
      take: pageSize,
    }),
    db.clientNotification.groupBy({ by: ['batchId'], _count: { _all: true } }),
  ])

  const batchIds = groups.map((g) => g.batchId)
  if (batchIds.length === 0) {
    return { batches: [], total: totalGroups.length, page: p, pageSize }
  }

  // Un représentant par batch (le plus ancien du groupe = l'envoi d'origine)
  const representatives = await db.clientNotification.findMany({
    where: { batchId: { in: batchIds } },
    orderBy: { createdAt: 'asc' },
    select: { ...SELECT_FIELDS, batchId: true },
  })

  // Noms des auteurs (admin/manager) des envois manuels
  const senderIds = [
    ...new Set(
      representatives
        .map((r) => r.senderId)
        .filter((id): id is string => id !== null)
    ),
  ]
  const senders =
    senderIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : []

  const senderNames = new Map(senders.map((s) => [s.id, s]))
  const byBatch = new Map<string, (typeof representatives)[number]>()
  for (const rep of representatives) {
    if (!byBatch.has(rep.batchId)) byBatch.set(rep.batchId, rep)
  }
  const countByBatch = new Map(groups.map((g) => [g.batchId, g._count._all]))

  const batches: NotificationBatch[] = groups.map((g) => {
    const rep = byBatch.get(g.batchId)
    const sender = rep?.senderId ? senderNames.get(rep.senderId) : null
    return {
      batchId: g.batchId,
      type: rep?.type ?? 'system',
      title: rep?.title ?? '',
      message: rep?.message ?? '',
      link: rep?.link ?? null,
      senderId: rep?.senderId ?? null,
      senderName: sender
        ? `${sender.firstName || sender.lastName || sender.email}`.trim()
        : null,
      sentCount: countByBatch.get(g.batchId) ?? 1,
      createdAt: (g._max.createdAt ?? new Date()).toISOString(),
    }
  })

  return { batches, total: totalGroups.length, page: p, pageSize }
}

export interface NotificationStats {
  totalSent: number
  totalUnread: number
  sentToday: number
  byType: { type: string; count: number }[]
}

export async function getStats(): Promise<NotificationStats> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  const [totalSent, totalUnread, sentToday, byTypeRaw] = await Promise.all([
    db.clientNotification.count(),
    db.clientNotification.count({ where: { isRead: false } }),
    db.clientNotification.count({ where: { createdAt: { gte: startOfDay } } }),
    db.clientNotification.groupBy({ by: ['type'], _count: { _all: true } }),
  ])

  return {
    totalSent,
    totalUnread,
    sentToday,
    byType: byTypeRaw.map((g) => ({ type: g.type, count: g._count._all })),
  }
}

// ──────────────────────────────────────────────
// Destinataires disponibles pour le composer admin
// ──────────────────────────────────────────────

export interface RecipientOption {
  id: string
  label: string
  email: string
  role: string
}

/** Liste des destinataires potentiels (utilisateurs actifs), triée par nom. */
export async function getRecipients(): Promise<RecipientOption[]> {
  const users = await db.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { email: 'asc' }],
    take: 500, // garde-fou : au-delà, cibler par rôle ou par ids précis
  })
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    label: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email,
  }))
}
