'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCheck, Trash2, AlertCircle } from 'lucide-react'
import {
  getTypeMeta,
  timeAgo,
  parseNotificationLink,
  type ClientNotificationItem,
} from './meta'

/**
 * Cloche de notifications du client (header, desktop + mobile).
 *
 * - badge rouge du nombre de non-lues (polling 30 s + refresh au retour
 *   sur l'onglet — fiable, cohérent avec le polling 30 s de l'admin)
 * - dropdown : 10 dernières notifications (titre, message, type, date,
 *   état lu/non lu), marquer lu, tout marquer lu, supprimer, navigation
 * - états : chargement (skeletons), vide, erreur — jamais de crash
 *
 * Le composant n'est monté que lorsque l'utilisateur est connecté
 * (condition gérée par le header dans page.tsx).
 */

interface NotificationBellProps {
  /** Navigation interne : section SPA ('account', 'catalogue'…) + onglet optionnel */
  onNavigate: (section: string, tab?: string) => void
  className?: string
}

const POLL_INTERVAL_MS = 30_000

export function NotificationBell({ onNavigate, className }: NotificationBellProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [items, setItems] = useState<ClientNotificationItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // ── Compteur non-lues : polling 30 s + retour d'onglet/fenêtre ──
  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch('/api/client/notifications/unread-count', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = (await res.json()) as { count?: number }
        if (mounted.current) setUnreadCount(data.count ?? 0)
      }
    } catch {
      // silencieux : le prochain poll réessaiera
    }
  }, [])

  useEffect(() => {
    refreshCount()
    const interval = setInterval(() => {
      // Ne pas poller en arrière-plan (économie batterie/data mobile)
      if (document.visibilityState === 'visible') refreshCount()
    }, POLL_INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshCount()
    }
    // Synchronisation instantanée quand le compteur change ailleurs dans l'app
    // (ex. onglet « Mes Notifications » du dashboard qui marque des notifs lues)
    const onExternalChange = () => refreshCount()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('mk-notifications-changed', onExternalChange)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('mk-notifications-changed', onExternalChange)
    }
  }, [refreshCount])

  /** Notifie le reste de l'app (badge de la cloche) d'un changement de compteur. */
  const emitCountChanged = useCallback(() => {
    window.dispatchEvent(new CustomEvent('mk-notifications-changed'))
  }, [])

  // ── Liste des 10 dernières notifications (à l'ouverture) ──
  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/client/notifications?pageSize=10', {
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { notifications?: ClientNotificationItem[] }
      if (!mounted.current) return
      setItems(data.notifications ?? [])
    } catch {
      if (mounted.current) {
        setError(true)
        setItems([])
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) fetchList()
  }

  // ── Actions ──

  const markRead = useCallback(async (id: string) => {
    // Optimiste : l'UI est immédiate, la requête suit
    setItems((prev) =>
      prev ? prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)) : prev
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    emitCountChanged()
    try {
      await fetch('/api/client/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
    } catch {
      // non bloquant : le prochain refresh corrigera
    }
  }, [emitCountChanged])

  const handleItemClick = (n: ClientNotificationItem) => {
    if (!n.isRead) markRead(n.id)
    const target = parseNotificationLink(n.link)
    setOpen(false)
    if (!target) return
    if (target.kind === 'route') {
      router.push(target.value)
    } else {
      onNavigate(target.value, target.tab)
    }
  }

  const markAllRead = async () => {
    if (busy) return
    setBusy(true)
    const previousItems = items
    const previousCount = unreadCount
    setItems((prev) => (prev ? prev.map((n) => ({ ...n, isRead: true })) : prev))
    setUnreadCount(0)
    try {
      const res = await fetch('/api/client/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      })
      if (!res.ok) throw new Error()
      emitCountChanged()
    } catch {
      // Restauration en cas d'échec
      setItems(previousItems)
      setUnreadCount(previousCount)
    } finally {
      setBusy(false)
    }
  }

  const deleteItem = async (n: ClientNotificationItem) => {
    if (busy) return
    const previousItems = items
    const wasUnread = !n.isRead
    setItems((prev) => (prev ? prev.filter((i) => i.id !== n.id) : prev))
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1))
      emitCountChanged()
    }
    try {
      const res = await fetch('/api/client/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: n.id }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setItems(previousItems)
      if (wasUnread) refreshCount()
    }
  }

  const unreadInList = items?.filter((n) => !n.isRead).length ?? 0

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          className={`relative ${className ?? ''}`}
          aria-label={
            unreadCount > 0
              ? `Notifications — ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`
              : 'Notifications'
          }
        >
          {/* Cloche — même style que l'icône panier du header (trait fin) */}
          <svg className="w-5 h-5 text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 17h5l-1.4-2.1A2 2 0 0118 13.8V11a6 6 0 00-4.5-5.8V5a1.5 1.5 0 00-3 0v.2A6 6 0 006 11v2.8c0 .4-.1.8-.4 1.1L4 17h11zm-3 0v.5a3 3 0 01-6 0V17"
            />
          </svg>
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B91C1C] text-white text-[10px] font-bold flex items-center justify-center"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[calc(100vw-2rem)] max-w-[400px] sm:w-[400px] p-0 border-[#E5E0DA] bg-white rounded-none shadow-xl"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E0DA]">
          <p
            className="font-display text-lg text-[#0A0A0A]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Notifications
            {unreadCount > 0 && (
              <span className="ml-2 text-xs font-sans text-[#B91C1C] align-middle">
                {unreadCount} non lue{unreadCount > 1 ? 's' : ''}
              </span>
            )}
          </p>
          {unreadInList > 0 && (
            <button
              onClick={markAllRead}
              disabled={busy}
              className="flex items-center gap-1 text-xs uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B] disabled:opacity-50 transition-colors"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tout lire
            </button>
          )}
        </div>

        {/* Contenu */}
        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 flex-shrink-0 rounded-none" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <AlertCircle className="h-8 w-8 text-[#B91C1C]" />
              <p className="text-sm text-[#6B6560]">
                Impossible de charger les notifications.
              </p>
              <button
                onClick={fetchList}
                className="text-xs uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B]"
              >
                Réessayer
              </button>
            </div>
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <svg className="w-10 h-10 text-[#E5E0DA]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.4-2.1A2 2 0 0118 13.8V11a6 6 0 00-4.5-5.8V5a1.5 1.5 0 00-3 0v.2A6 6 0 006 11v2.8c0 .4-.1.8-.4 1.1L4 17h11zm-3 0v.5a3 3 0 01-6 0V17" />
              </svg>
              <p className="text-sm text-[#6B6560]">Aucune notification pour le moment</p>
              <p className="text-xs text-[#9C9A92]">
                Paiements reçus, suivi de commandes et offres personnalisées apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#EDE8E1]">
              {items.map((n) => {
                const meta = getTypeMeta(n.type)
                const Icon = meta.icon
                return (
                  <li key={n.id} className="group relative">
                    <button
                      onClick={() => handleItemClick(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                        n.isRead ? 'opacity-70 hover:bg-[#F8F6F3]' : 'bg-[#F8F6F3]/60 hover:bg-[#F0EDE8]'
                      }`}
                      title={n.link ? 'Ouvrir' : 'Marquer comme lue'}
                    >
                      <span
                        className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-none"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="flex-1 min-w-0 pr-6">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#0A0A0A] truncate">{n.title}</span>
                          {!n.isRead && (
                            <span
                              className="w-2 h-2 rounded-full bg-[#B91C1C] flex-shrink-0"
                              aria-label="Non lue"
                            />
                          )}
                        </span>
                        <span className="block text-[13px] leading-snug text-[#6B6560] mt-0.5 line-clamp-2">
                          {n.message}
                        </span>
                        <span className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-[#9C9A92]">{timeAgo(n.createdAt)}</span>
                          <span
                            className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
                            style={{ backgroundColor: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </span>
                      </span>
                    </button>
                    {/* Supprimer (apparaît au survol, toujours visible au tactile) */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteItem(n)
                      }}
                      disabled={busy}
                      aria-label="Supprimer la notification"
                      title="Supprimer"
                      className="absolute top-2.5 right-2.5 p-1.5 text-[#9C9A92] hover:text-[#B91C1C] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Pied : toutes les notifications */}
        <div className="border-t border-[#E5E0DA]">
          <button
            onClick={() => {
              setOpen(false)
              onNavigate('account', 'notifications')
            }}
            className="w-full py-3 text-xs font-medium uppercase tracking-widest text-[#9C7C5C] hover:text-[#8B6B4B] hover:bg-[#F8F6F3] transition-colors"
          >
            Voir toutes les notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
