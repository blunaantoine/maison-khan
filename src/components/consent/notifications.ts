/**
 * MAISON KHAN — Helpers pour les notifications navigateur (Web Notification API).
 *
 * Toutes les fonctions sont SSR-safe et n'échouent jamais :
 * - `isNotificationSupported()` / `getNotificationPermission()` : lecture synchrone
 * - `requestNotificationPermission()` : à n'appeler QUE depuis un geste utilisateur
 *   explicite (clic) — exigence des navigateurs (sinon la demande est bloquée/ignorée)
 * - `sendBrowserNotification()` : no-op si non supporté ou permission non accordée
 */

/** Permission courante ; `'unsupported'` si l'API n'existe pas (SSR ou vieux navigateur). */
export type NotificationPermissionState = NotificationPermission | 'unsupported';

/** true si l'API Notification est disponible dans ce contexte. */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** Permission actuelle du navigateur ('granted' | 'denied' | 'default' | 'unsupported'). */
export function getNotificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Demande la permission d'afficher des notifications.
 * ⚠️ Doit être déclenchée par un clic utilisateur (jamais au chargement de la page).
 * Retourne 'unsupported' si l'API est absente, 'denied' en cas d'échec.
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/**
 * Envoie une notification navigateur.
 * Ne fait rien silencieusement si l'API est absente ou si la permission
 * n'a pas été accordée ('granted').
 */
export function sendBrowserNotification(
  title: string,
  body: string,
  options?: { icon?: string; tag?: string }
): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: options?.icon,
      tag: options?.tag,
    });
    // Refermer la notification système après quelques secondes (bonne pratique)
    window.setTimeout(() => notification.close(), 8000);
  } catch {
    // L'échec d'envoi ne doit jamais remonter dans l'UI
  }
}
