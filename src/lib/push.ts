import webpush from 'web-push'
import { db } from '@/lib/db'

/**
 * MAISON KHAN — Moteur de notifications push (Web Push).
 *
 * Les clients s'abonnent depuis leur navigateur (service worker /sw.js) via
 * /api/push/subscribe. Chaque appareil = une ligne PushSubscription.
 *
 * Tolérance aux pannes : un push ne doit JAMAIS faire échouer l'opération
 * métier. Tout est try/catch et journalisé. Les abonnements morts (appareil
 * réinitialisé, permission révoquée…) sont automatiquement supprimés
 * (HTTP 404/410 renvoyé par le service push).
 */

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) return false
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:contact@maison-khan.com',
    publicKey,
    privateKey
  )
  configured = true
  return true
}

export interface PushPayload {
  title: string
  body: string
  /** URL ouverte au clic sur la notification */
  url?: string
  /** Regroupe les notifications successives (une par commande) */
  tag?: string
}

/** Envoyer un push à TOUS les appareils d'un utilisateur. Ne lève jamais. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!userId) return
  if (!ensureConfigured()) {
    console.log('[push:skipped] VAPID keys absentes — envoi simulé :', payload.title)
    return
  }

  let subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
  try {
    subscriptions = await db.pushSubscription.findMany({
      where: { userId },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
  } catch (e) {
    console.error('[push:error] lecture abonnements :', e)
    return
  }

  if (subscriptions.length === 0) return

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || 'maison-khan',
  })

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
          { TTL: 24 * 60 * 60 } // expiré après 24 h si l'appareil est injoignable
        )
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          // Abonnement mort (permission révoquée / appareil perdu) → purge
          try {
            await db.pushSubscription.delete({ where: { id: sub.id } })
          } catch { /* déjà supprimé */ }
        } else {
          // Erreur temporaire (réseau…) → on garde l'abonnement pour le prochain envoi
          console.error(`[push:error] ${sub.endpoint.slice(0, 60)}… :`, status || e)
        }
      }
    })
  )
}

/** L'utilisateur a-t-il au moins un appareil abonné ? (utile aux tests/diagnostics) */
export async function hasPushSubscription(userId: string): Promise<boolean> {
  try {
    const count = await db.pushSubscription.count({ where: { userId } })
    return count > 0
  } catch {
    return false
  }
}

/**
 * Envoyer un push à TOUS les appareils abonnés (campagne admin).
 * Retourne le nombre d'envois réussis. Ne lève jamais.
 */
export async function sendPushToAll(payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) {
    console.log('[push:skipped] VAPID keys absentes — envoi simulé :', payload.title)
    return 0
  }

  let subscriptions: { id: string; endpoint: string; p256dh: string; auth: string }[]
  try {
    subscriptions = await db.pushSubscription.findMany({
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    })
  } catch (e) {
    console.error('[push:error] lecture abonnements :', e)
    return 0
  }

  if (subscriptions.length === 0) return 0

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag || 'maison-khan-campaign',
  })

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          data,
          { TTL: 24 * 60 * 60 }
        )
        return true
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          try {
            await db.pushSubscription.delete({ where: { id: sub.id } })
          } catch { /* déjà supprimé */ }
        } else {
          console.error(`[push:error] ${sub.endpoint.slice(0, 60)}… :`, status || e)
        }
        return false
      }
    })
  )

  return results.filter((r) => r.status === 'fulfilled' && r.value === true).length
}

/** Combien de clients (personnes distinctes) et d'appareils sont abonnés ? */
export async function getPushAudienceStats(): Promise<{ subscribers: number; devices: number }> {
  try {
    const devices = await db.pushSubscription.count()
    const subscribers = await db.pushSubscription.findMany({
      distinct: ['userId'],
      select: { userId: true },
    })
    return { subscribers: subscribers.length, devices }
  } catch {
    return { subscribers: 0, devices: 0 }
  }
}
