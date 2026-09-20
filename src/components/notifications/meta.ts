import {
  Package,
  CircleDollarSign,
  MessageSquare,
  Gift,
  Settings,
  User,
  Bell,
} from 'lucide-react'
import {
  NOTIFICATION_TYPE_LABELS,
  type NotificationType,
} from '@/lib/notifications/types'

/**
 * Métadonnées d'affichage des notifications client (icône + couleurs marque).
 * Le registre des types vit dans src/lib/notifications/types.ts — pour ajouter
 * un type : l'y déclarer, puis ajouter une entrée TYPE_DISPLAY_META ici.
 */

export interface TypeDisplayMeta {
  icon: typeof Bell
  color: string
  bg: string
  label: string
}

export const TYPE_DISPLAY_META: Record<string, TypeDisplayMeta> = {
  order: { icon: Package, color: '#9C7C5C', bg: '#F8F6F3', label: NOTIFICATION_TYPE_LABELS.order },
  payment: { icon: CircleDollarSign, color: '#15803D', bg: '#F0F7F1', label: NOTIFICATION_TYPE_LABELS.payment },
  message: { icon: MessageSquare, color: '#7C3AED', bg: '#F5F0FB', label: NOTIFICATION_TYPE_LABELS.message },
  promotion: { icon: Gift, color: '#B91C1C', bg: '#FDF2F2', label: NOTIFICATION_TYPE_LABELS.promotion },
  system: { icon: Settings, color: '#0A0A0A', bg: '#EDE8E1', label: NOTIFICATION_TYPE_LABELS.system },
  account: { icon: User, color: '#B45309', bg: '#FDF6E8', label: NOTIFICATION_TYPE_LABELS.account },
}

export const FALLBACK_TYPE_META: TypeDisplayMeta = {
  icon: Bell,
  color: '#0A0A0A',
  bg: '#EDE8E1',
  label: 'Notification',
}

export function getTypeMeta(type: string): TypeDisplayMeta {
  return TYPE_DISPLAY_META[type] ?? FALLBACK_TYPE_META
}

/** Date relative en français : « à l'instant », « il y a 15 min », « hier »… */
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'hier'
  if (d < 7) return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Format de notification renvoyé par l'API client. */
export interface ClientNotificationItem {
  id: string
  userId: string
  type: string
  title: string
  message: string
  link: string | null
  orderId: string | null
  senderId: string | null
  isRead: boolean
  readAt: string | null
  createdAt: string
}

/**
 * Interprète le lien d'une notification.
 *  - '/…' ou '/produit/xxx' → route réelle du site (kind: 'route')
 *  - '#section'            → section SPA (kind: 'section')
 *  - '#section:tab'        → section SPA + onglet dashboard (kind: 'section')
 */
export function parseNotificationLink(
  link: string | null | undefined
): { kind: 'route' | 'section'; value: string; tab?: string } | null {
  if (!link) return null
  if (link.startsWith('#')) {
    const [section, tab] = link.slice(1).split(':')
    if (!section) return null
    return { kind: 'section', value: section, tab: tab || undefined }
  }
  if (link.startsWith('/') && !link.startsWith('//')) {
    return { kind: 'route', value: link }
  }
  return null
}
