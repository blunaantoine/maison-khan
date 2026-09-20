'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCheck, ChevronLeft, ChevronRight, Trash2, RefreshCw, AlertCircle } from 'lucide-react'
import {
  getTypeMeta,
  timeAgo,
  parseNotificationLink,
  TYPE_DISPLAY_META,
  type ClientNotificationItem,
} from './meta'

/**
 * Onglet « Notifications » du dashboard client — page "toutes les notifications".
 *
 * - filtres par type (Commande, Paiement, Message, Promotion, Système, Compte)
 * - filtre non lues, pagination (15/page), tri par date (serveur)
 * - marquer lu (clic), tout marquer lu, supprimer
 * - clic sur une notification → navigation vers la page concernée
 */

interface ClientNotificationsTabProps {
  onNavigate: (section: string, tab?: string) => void
}

interface ListResponse {
  notifications: ClientNotificationItem[]
  total: number
  page: number
  pageSize: number
  unreadCount: number
}

const TYPE_FILTERS = [
  { id: '', label: 'Toutes' },
  ...Object.entries(TYPE_DISPLAY_META).map(([id, m]) => ({ id, label: m.label })),
]

export function ClientNotificationsTab({ onNavigate }: ClientNotificationsTabProps) {
  const router = useRouter()
  const [items, setItems] = useState<ClientNotificationItem[] | null>(null)
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const fetchList = useCallback(
    async (opts?: { page?: number; type?: string; unread?: boolean }) => {
      const p = opts?.page ?? page
      const t = opts?.type ?? typeFilter
      const u = opts?.unread ?? unreadOnly
      setLoading(true)
      setError(false)
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: '15' })
        if (t) params.set('type', t)
        if (u) params.set('unread', '1')
        const res = await fetch(`/api/client/notifications?${params.toString()}`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error()
        const data = (await res.json()) as ListResponse
        if (!mounted.current) return
        setItems(data.notifications)
        setTotal(data.total)
        setUnreadCount(data.unreadCount)
      } catch {
        if (mounted.current) {
          setError(true)
          setItems([])
        }
      } finally {
        if (mounted.current) setLoading(false)
      }
    },
    [page, typeFilter, unreadOnly]
  )

  useEffect(() => {
    fetchList()
    // recharge quand les filtres changent (la page est remise à 1 par les setters)
  }, [fetchList])

  const changeTypeFilter = (t: string) => {
    setTypeFilter(t)
    setPage(1)
    fetchList({ page: 1, type: t, unread: unreadOnly })
  }

  const toggleUnreadOnly = () => {
    const next = !unreadOnly
    setUnreadOnly(next)
    setPage(1)
    fetchList({ page: 1, type: typeFilter, unread: next })
  }

  const changePage = (p: number) => {
    setPage(p)
    fetchList({ page: p })
  }

  const markRead = async (id: string) => {
    setItems((prev) => (prev ? prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)) : prev))
    setUnreadCount((c) => Math.max(0, c - 1))
    // Synchronise instantanément le badge de la cloche (header)
    window.dispatchEvent(new CustomEvent('mk-notifications-changed'))
    try {
      await fetch('/api/client/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
    } catch {
      /* non bloquant */
    }
  }

  const handleItemClick = (n: ClientNotificationItem) => {
    if (!n.isRead) markRead(n.id)
    const target = parseNotificationLink(n.link)
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
    try {
      await fetch('/api/client/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      })
      if (mounted.current) {
        setItems((prev) => (prev ? prev.map((n) => ({ ...n, isRead: true })) : prev))
        setUnreadCount(0)
        window.dispatchEvent(new CustomEvent('mk-notifications-changed'))
      }
    } catch {
      /* non bloquant */
    } finally {
      setBusy(false)
    }
  }

  const deleteItem = async (n: ClientNotificationItem) => {
    if (busy) return
    const previous = items
    const wasUnread = !n.isRead
    setItems((prev) => (prev ? prev.filter((i) => i.id !== n.id) : prev))
    setTotal((t) => Math.max(0, t - 1))
    if (wasUnread) {
      setUnreadCount((c) => Math.max(0, c - 1))
      window.dispatchEvent(new CustomEvent('mk-notifications-changed'))
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
      setItems(previous)
      fetchList()
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / 15))

  return (
    <div>
      {/* En-tête + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h3
            className="font-display text-2xl text-[#0A0A0A]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Mes Notifications
          </h3>
          <p className="text-sm text-[#6B6560] mt-0.5">
            {unreadCount > 0
              ? `${unreadCount} non lue${unreadCount > 1 ? 's' : ''} sur ${total}`
              : `${total} notification${total > 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchList()}
            className="flex items-center gap-1 text-[#9C7C5C] hover:text-[#8B6B4B] text-sm uppercase tracking-wider transition-colors"
            aria-label="Actualiser"
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              disabled={busy}
              className="flex items-center gap-1 text-[#9C7C5C] hover:text-[#8B6B4B] text-sm uppercase tracking-wider transition-colors disabled:opacity-50"
            >
              <CheckCheck className="h-4 w-4" />
              Tout marquer lu
            </button>
          )}
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            onClick={() => changeTypeFilter(f.id)}
            className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border ${
              typeFilter === f.id
                ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                : 'text-[#6B6560] border-[#E5E0DA] hover:border-[#9C7C5C] hover:text-[#0A0A0A]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={toggleUnreadOnly}
          className={`ml-auto px-3 py-1.5 text-xs uppercase tracking-wider transition-colors border flex items-center gap-1.5 ${
            unreadOnly
              ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
              : 'text-[#6B6560] border-[#E5E0DA] hover:border-[#B91C1C] hover:text-[#B91C1C]'
          }`}
        >
          {!unreadOnly && unreadCount > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-[#B91C1C]" aria-hidden />
          )}
          Non lues
        </button>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4 bg-white border border-[#E5E0DA] p-4">
              <Skeleton className="h-11 w-11 flex-shrink-0 rounded-none" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-12 bg-white border border-[#E5E0DA]">
          <AlertCircle className="h-10 w-10 text-[#B91C1C]" />
          <p className="text-sm text-[#6B6560]">Impossible de charger vos notifications.</p>
          <button
            onClick={() => fetchList()}
            className="text-sm uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B]"
          >
            Réessayer
          </button>
        </div>
      ) : !items || items.length === 0 ? (
        <div className="text-center py-12 bg-[#EDE8E1]">
          <p className="text-[#6B6560]">
            {unreadOnly || typeFilter
              ? 'Aucune notification pour ce filtre.'
              : 'Aucune notification pour le moment.'}
          </p>
          {(unreadOnly || typeFilter) && (
            <button
              onClick={() => {
                setTypeFilter('')
                setUnreadOnly(false)
                setPage(1)
                fetchList({ page: 1, type: '', unread: false })
              }}
              className="mt-3 text-sm uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B]"
            >
              Réinitialiser les filtres
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((n) => {
            const meta = getTypeMeta(n.type)
            const Icon = meta.icon
            return (
              <div
                key={n.id}
                className={`group relative flex items-start gap-4 p-4 border transition-colors ${
                  n.isRead
                    ? 'bg-white border-[#E5E0DA] opacity-70'
                    : 'bg-[#F8F6F3] border-[#C4A77D]/40'
                }`}
              >
                <button
                  onClick={() => handleItemClick(n)}
                  className="flex flex-1 items-start gap-4 text-left min-w-0"
                  title={n.link ? 'Ouvrir la page concernée' : 'Marquer comme lue'}
                >
                  <span
                    className="flex-shrink-0 w-11 h-11 flex items-center justify-center"
                    style={{ backgroundColor: meta.bg, color: meta.color }}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="flex-1 min-w-0 pr-8">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#0A0A0A]">{n.title}</span>
                      {!n.isRead && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#B91C1C] flex-shrink-0"
                          aria-label="Non lue"
                        />
                      )}
                      <span
                        className="text-[10px] uppercase tracking-widest px-1.5 py-0.5"
                        style={{ backgroundColor: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </span>
                    <span className="block text-sm text-[#6B6560] mt-1 break-words">{n.message}</span>
                    <span className="block text-xs text-[#9C9A92] mt-1">{timeAgo(n.createdAt)}</span>
                  </span>
                </button>
                <button
                  onClick={() => deleteItem(n)}
                  disabled={busy}
                  aria-label="Supprimer la notification"
                  title="Supprimer"
                  className="absolute top-3 right-3 p-1.5 text-[#9C9A92] hover:text-[#B91C1C] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => changePage(page - 1)}
                disabled={page <= 1}
                className="flex items-center gap-1 text-sm uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B] disabled:text-[#C9C4BD] disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <span className="text-xs text-[#6B6560]">
                Page {page} sur {totalPages}
              </span>
              <button
                onClick={() => changePage(page + 1)}
                disabled={page >= totalPages}
                className="flex items-center gap-1 text-sm uppercase tracking-wider text-[#9C7C5C] hover:text-[#8B6B4B] disabled:text-[#C9C4BD] disabled:cursor-not-allowed transition-colors"
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
