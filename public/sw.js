/**
 * MAISON KHAN — Service Worker des notifications push.
 *
 * Reçoit les push du serveur (src/lib/push.ts) et affiche les notifications
 * système, même quand le site est fermé. Au clic : ouverture/retour sur le site.
 */

const ICON = '/android-chrome-192x192.png'
const BADGE = '/favicon-32x32.png'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Réception d'un push serveur ──────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'MAISON KHAN', body: '', url: '/', tag: 'maison-khan' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: ICON,
      badge: BADGE,
      tag: data.tag,
      // Une nouvelle notif remplace l'ancienne du même tag sans vibrer
      renotify: false,
      lang: 'fr',
      vibrate: [200, 100, 200],
      data: { url: data.url },
    })
  )
})

// ── Clic sur une notification ────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Le site est déjà ouvert ? On le focalise.
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      // Sinon on l'ouvre.
      return self.clients.openWindow(url)
    })
  )
})
