/**
 * MAISON KHAN — Registre des types de notifications client.
 *
 * SOURCE DE VÉRITÉ UNIQUE pour les types de notifications in-app (cloche 🔔).
 * Pour ajouter un type plus tard : ajouter une entrée ici + les métadonnées
 * d'affichage (icône/couleur) dans src/components/notifications/meta.ts.
 * Aucun type n'est codé en dur ailleurs — tout passe par NOTIFICATION_TYPES.
 */

export const NOTIFICATION_TYPES = {
  ORDER: 'order',
  PAYMENT: 'payment',
  MESSAGE: 'message',
  PROMOTION: 'promotion',
  SYSTEM: 'system',
  ACCOUNT: 'account',
} as const

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES]

/** Libellés FR (partagés backend/frontend, sans dépendance React). */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  order: 'Commande',
  payment: 'Paiement',
  message: 'Message',
  promotion: 'Promotion',
  system: 'Système',
  account: 'Compte',
}

const VALID_TYPES = new Set<string>(Object.values(NOTIFICATION_TYPES))

/** Le type fourni (admin ou événement métier) est-il connu du registre ? */
export function isValidNotificationType(type: string): type is NotificationType {
  return VALID_TYPES.has(type)
}

// ──────────────────────────────────────────────
// Limites & validation des contenus
// ──────────────────────────────────────────────

export const NOTIFICATION_LIMITS = {
  titleMin: 3,
  titleMax: 80,
  messageMin: 3,
  messageMax: 500,
  linkMax: 200,
  /** Nombre de notifications retournées par page (API client). */
  pageSize: 15,
  /** Nombre maximal de destinataires explicites par envoi manuel. */
  maxExplicitRecipients: 100,
  /** Nombre de batchs d'envoi affichés par page (historique admin). */
  historyPageSize: 20,
} as const

/**
 * Lien interne d'une notification.
 * Formats acceptés :
 *   - '/' ou '/produit/xxx'  → page du site (route réelle)
 *   - '#section'             → section SPA ('#account', '#catalogue'…)
 *   - '#section:tab'         → section + onglet dashboard ('#account:orders')
 * Refusé : liens externes (http, //…), javascript:, espaces, > 200 car.
 */
export function isValidNotificationLink(link: string): boolean {
  if (link.length === 0 || link.length > NOTIFICATION_LIMITS.linkMax) return false
  if (/\s/.test(link)) return false
  if (link.startsWith('//')) return false // protocole relatif externe
  if (link.startsWith('/')) return /^\/[a-zA-Z0-9\-/_]*$/.test(link)
  if (link.startsWith('#')) return /^#[a-z]+(:[a-z]+)?$/.test(link)
  return false
}

/** Valide un titre de notification. Retourne l'erreur ou null si valide. */
export function validateNotificationTitle(title: string): string | null {
  const t = title.trim()
  if (t.length < NOTIFICATION_LIMITS.titleMin)
    return `Le titre doit contenir au moins ${NOTIFICATION_LIMITS.titleMin} caractères`
  if (t.length > NOTIFICATION_LIMITS.titleMax)
    return `Le titre ne peut pas dépasser ${NOTIFICATION_LIMITS.titleMax} caractères`
  return null
}

/** Valide un message de notification. Retourne l'erreur ou null si valide. */
export function validateNotificationMessage(message: string): string | null {
  const m = message.trim()
  if (m.length < NOTIFICATION_LIMITS.messageMin)
    return `Le message doit contenir au moins ${NOTIFICATION_LIMITS.messageMin} caractères`
  if (m.length > NOTIFICATION_LIMITS.messageMax)
    return `Le message ne peut pas dépasser ${NOTIFICATION_LIMITS.messageMax} caractères`
  return null
}

/** Valide un lien de notification (facultatif). Retourne l'erreur ou null. */
export function validateNotificationLink(link: string | null | undefined): string | null {
  if (!link || !link.trim()) return null // lien facultatif
  if (!isValidNotificationLink(link.trim()))
    return 'Lien invalide — formats acceptés : /, /produit/…, #section ou #section:onglet (lien interne uniquement)'
  return null
}
