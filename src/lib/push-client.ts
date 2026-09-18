/**
 * MAISON KHAN — Helpers client pour les notifications push (Web Push).
 *
 * Cycle complet côté navigateur :
 *  1. registerServiceWorker()      → installe /sw.js (une seule fois par appareil)
 *  2. subscribeToPush()            → demande la permission + crée l'abonnement
 *                                    push (clé publique VAPID) + l'enregistre
 *                                    côté serveur (POST /api/push/subscribe)
 *  3. unsubscribeFromPush()        → désabonnement navigateur + serveur
 *
 * Tout est SSR-safe et n'échoue jamais : chaque fonction retourne un état
 * explicite que l'UI affiche.
 */

export type PushClientState =
  | 'unsupported'    // navigateur sans Service Worker / Push (ou context non sécurisé)
  | 'denied'         // permission bloquée par l'utilisateur
  | 'inactive'       // supporté, permission pas encore demandée
  | 'subscribed'     // abonné : les push arrivent
  | 'granted-unsubscribed' // permission ok mais appareil non abonné (rare)

/** Décode la clé publique VAPID (base64url) en Uint8Array pour pushManager. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
  return output
}

/** Le navigateur sait-t-il recevoir des push ? (SSR-safe) */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** État synchrone rapide pour l'UI (sans requête réseau). */
export function getQuickPushState(): PushClientState {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  return 'inactive'
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.error('[push-client] SW non enregistré :', e)
    return null
  }
}

/**
 * Active les notifications sur CET appareil :
 * permission → abonnement push → enregistrement serveur.
 * Retourne l'état final (jamais d'exception).
 */
export async function subscribeToPush(): Promise<PushClientState> {
  if (!isPushSupported()) return 'unsupported'

  // 1. Permission (doit venir d'un clic utilisateur)
  let permission: NotificationPermission
  try {
    permission = await Notification.requestPermission()
  } catch {
    return 'denied'
  }
  if (permission !== 'granted') return 'denied'

  // 2. Service worker + abonnement push
  const registration = await getRegistration()
  if (!registration) return 'unsupported'

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) {
    console.error('[push-client] NEXT_PUBLIC_VAPID_PUBLIC_KEY absente')
    return 'unsupported'
  }

  let subscription: PushSubscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    })
  } catch (e) {
    console.error('[push-client] Abonnement push impossible :', e)
    return 'denied'
  }

  // 3. Enregistrement côté serveur
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(subscription.toJSON()),
    })
    if (!res.ok) return 'granted-unsubscribed'
  } catch (e) {
    console.error('[push-client] Enregistrement serveur impossible :', e)
    return 'granted-unsubscribed'
  }

  return 'subscribed'
}

/**
 * Désactive les notifications sur cet appareil (bouton « Désactiver »).
 */
export async function unsubscribeFromPush(): Promise<PushClientState> {
  if (!isPushSupported()) return 'unsupported'
  try {
    // getRegistration (pas .ready) : résout immédiatement avec null si aucun SW
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return 'inactive'
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      // D'abord prévenir le serveur (avec l'endpoint), puis le navigateur
      try {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      } catch { /* le désabonnement navigateur reste la priorité */ }
      await subscription.unsubscribe()
    }
  } catch (e) {
    console.error('[push-client] Désabonnement impossible :', e)
  }
  return 'inactive'
}

/**
 * Vérifie l'état réel : permission + abonnement navigateur + abonnement serveur.
 * Utilisé au chargement du dashboard pour afficher le bon état du bouton.
 */
export async function checkPushState(): Promise<PushClientState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'

  try {
    // getRegistration (pas .ready) : résout immédiatement avec null si aucun SW,
    // là où .ready pendrait indéfiniment (bouton jamais mis à jour)
    const registration = await navigator.serviceWorker.getRegistration()
    if (!registration) return Notification.permission === 'granted' ? 'granted-unsubscribed' : 'inactive'
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) return Notification.permission === 'granted' ? 'granted-unsubscribed' : 'inactive'

    // Abonnement navigateur présent — le serveur le connaît-il encore ?
    const res = await fetch('/api/push/subscribe', { credentials: 'include' })
    if (res.ok) {
      const data = (await res.json()) as { subscribed?: boolean }
      return data.subscribed ? 'subscribed' : 'granted-unsubscribed'
    }
    if (res.status === 401) return 'inactive'
    return 'granted-unsubscribed'
  } catch {
    return 'inactive'
  }
}
