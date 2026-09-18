'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Bell,
  ShoppingCart,
  CircleDollarSign,
  AlertCircle,
  RefreshCw,
  Users,
  Package,
  CheckCheck,
  Trash2,
  Mail,
  MailCheck,
  MailX,
  MailQuestion,
} from 'lucide-react'

/**
 * Onglet Notifications de l'admin :
 *  1. Centre de notifications (nouvelles commandes, paiements, changements de statut)
 *  2. Journal des emails envoyés aux clients (reçus, confirmations, statuts)
 *
 * Auto-refresh 30 s + synchro du badge non-lues avec le parent via onUnreadChange.
 */

interface NotificationItem {
  id: string
  type: string
  title: string
  message: string
  orderId: string | null
  isRead: boolean
  createdAt: string
}

interface EmailLogItem {
  id: string
  to: string
  subject: string
  type: string
  orderId: string | null
  status: string
  error: string | null
  createdAt: string
}

interface EmailStats {
  sent: number
  failed: number
  skipped: number
  total: number
  configured: boolean
}

const TYPE_META: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  order_created: { icon: <ShoppingCart className="h-5 w-5" />, color: '#9C7C5C', bg: '#F8F6F3' },
  payment_confirmed: { icon: <CircleDollarSign className="h-5 w-5" />, color: '#15803D', bg: '#F0F7F1' },
  payment_failed: { icon: <AlertCircle className="h-5 w-5" />, color: '#B91C1C', bg: '#FDF2F2' },
  status_changed: { icon: <RefreshCw className="h-5 w-5" />, color: '#7C3AED', bg: '#F5F0FB' },
  new_user: { icon: <Users className="h-5 w-5" />, color: '#0A0A0A', bg: '#EDE8E1' },
  low_stock: { icon: <Package className="h-5 w-5" />, color: '#B45309', bg: '#FDF6E8' },
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  order_confirmation: 'Reçu de commande',
  payment_receipt: 'Reçu de paiement',
  status_update: 'Mise à jour de statut',
  password_reset: 'Réinitialisation mot de passe',
}

function timeAgo(iso: string): string {
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

interface AdminNotificationsTabProps {
  onUnreadChange: (count: number) => void
}

export function AdminNotificationsTab({ onUnreadChange }: AdminNotificationsTabProps) {
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null)
  const [emailLogs, setEmailLogs] = useState<EmailLogItem[] | null>(null)
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  const fetchAll = useCallback(async () => {
    try {
      const [notifRes, emailRes] = await Promise.all([
        fetch('/api/notifications', { credentials: 'include' }),
        fetch('/api/email-logs', { credentials: 'include' }),
      ])
      if (notifRes.ok) {
        const data = await notifRes.json()
        if (!mounted.current) return
        setNotifications(data.notifications || [])
        onUnreadChange(data.unreadCount || 0)
      }
      if (emailRes.ok) {
        const data = await emailRes.json()
        if (!mounted.current) return
        setEmailLogs(data.logs || [])
        setEmailStats(data.stats || null)
      }
    } catch {
      // silencieux : le prochain poll réessaiera
    }
  }, [onUnreadChange])

  useEffect(() => {
    mounted.current = true
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => {
      mounted.current = false
      clearInterval(interval)
    }
  }, [fetchAll])

  const markRead = async (id: string) => {
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
      setNotifications((prev) =>
        prev ? prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)) : prev
      )
      onUnreadChange(
        (notifications?.filter((n) => !n.isRead && n.id !== id).length) || 0
      )
    } finally {
      setBusy(false)
    }
  }

  const markAllRead = async () => {
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ all: true }),
      })
      setNotifications((prev) => (prev ? prev.map((n) => ({ ...n, isRead: true })) : prev))
      onUnreadChange(0)
    } finally {
      setBusy(false)
    }
  }

  const clearRead = async () => {
    setBusy(true)
    try {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      })
      setNotifications((prev) => (prev ? prev.filter((n) => !n.isRead) : prev))
    } finally {
      setBusy(false)
    }
  }

  const unreadCount = notifications?.filter((n) => !n.isRead).length || 0

  return (
    <div className="space-y-8">
      {/* ── Centre de notifications ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="h-6 w-6 text-[#9C7C5C]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#B91C1C] text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <h3
              className="font-display text-xl text-[#0A0A0A]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Notifications
            </h3>
            <span className="text-xs text-[#9C9A92]">actualisation auto · 30 s</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={markAllRead} disabled={busy || unreadCount === 0}>
              <CheckCheck className="h-4 w-4 mr-1" /> Tout marquer lu
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={clearRead}
              disabled={busy || !notifications?.some((n) => n.isRead)}
            >
              <Trash2 className="h-4 w-4 mr-1" /> Effacer lues
            </Button>
          </div>
        </div>

        {notifications === null ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="h-10 w-10 text-[#E5E0DA] mx-auto mb-3" />
            <p className="text-sm text-[#6B6560]">
              Aucune notification pour le moment.
              <br />
              <span className="text-xs text-[#9C9A92]">
                Les nouvelles commandes, paiements et changements de statut apparaîtront ici.
              </span>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#EDE8E1] max-h-[520px] overflow-y-auto">
            {notifications.map((n) => {
              const meta = TYPE_META[n.type] || TYPE_META.status_changed
              return (
                <li key={n.id}>
                  <button
                    onClick={() => !n.isRead && markRead(n.id)}
                    disabled={n.isRead || busy}
                    className={`w-full flex items-start gap-4 py-4 px-2 -mx-2 text-left transition-colors ${
                      n.isRead ? 'opacity-60 cursor-default' : 'hover:bg-[#F8F6F3] cursor-pointer'
                    }`}
                    title={n.isRead ? 'Lue' : 'Cliquer pour marquer comme lue'}
                  >
                    <span
                      className="flex-shrink-0 w-10 h-10 flex items-center justify-center"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      {meta.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[#0A0A0A]">{n.title}</span>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#B91C1C] flex-shrink-0" aria-label="Non lue" />
                        )}
                      </span>
                      <span className="block text-sm text-[#6B6560] mt-0.5 break-words">{n.message}</span>
                      <span className="block text-xs text-[#9C9A92] mt-1">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {/* ── Journal des emails ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-[#9C7C5C]" />
            <h3
              className="font-display text-xl text-[#0A0A0A]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Emails envoyés aux clients
            </h3>
          </div>
          {emailStats && (
            <div className="flex gap-4 text-xs">
              <span className="text-[#15803D] font-medium">✓ {emailStats.sent} envoyés</span>
              <span className="text-[#B45309] font-medium">◌ {emailStats.skipped} simulés</span>
              <span className="text-[#B91C1C] font-medium">✗ {emailStats.failed} échecs</span>
            </div>
          )}
        </div>

        {emailStats && !emailStats.configured && (
          <div className="bg-[#FDF6E8] border border-[#C4A77D] p-4 mb-4 text-sm text-[#8B6B2E]">
            <strong>Envoi réel désactivé :</strong> la clé RESEND_API_KEY n&apos;est pas configurée.
            Les emails sont simulés (journalisés) — ajoutez la clé dans le fichier{' '}
            <code className="bg-white/60 px-1">.env</code> pour activer l&apos;envoi réel.
          </div>
        )}

        {emailLogs === null ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : emailLogs.length === 0 ? (
          <div className="text-center py-10">
            <Mail className="h-10 w-10 text-[#E5E0DA] mx-auto mb-3" />
            <p className="text-sm text-[#6B6560]">
              Aucun email pour le moment.
              <br />
              <span className="text-xs text-[#9C9A92]">
                Reçus de commande, reçus de paiement et mises à jour de statut seront journalisés ici.
              </span>
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#EDE8E1] max-h-96 overflow-y-auto">
            {emailLogs.map((log) => (
              <li key={log.id} className="flex items-center gap-3 py-3">
                {log.status === 'sent' ? (
                  <MailCheck className="h-5 w-5 text-[#15803D] flex-shrink-0" />
                ) : log.status === 'failed' ? (
                  <MailX className="h-5 w-5 text-[#B91C1C] flex-shrink-0" />
                ) : (
                  <MailQuestion className="h-5 w-5 text-[#B45309] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0A0A0A] truncate">{log.subject}</p>
                  <p className="text-xs text-[#6B6560] truncate">
                    {EMAIL_TYPE_LABELS[log.type] || log.type} → {log.to} · {timeAgo(log.createdAt)}
                    {log.error ? ` · ${log.error}` : ''}
                  </p>
                </div>
                <span
                  className={`text-[10px] uppercase tracking-widest px-2 py-1 flex-shrink-0 ${
                    log.status === 'sent'
                      ? 'bg-[#F0F7F1] text-[#15803D]'
                      : log.status === 'failed'
                        ? 'bg-[#FDF2F2] text-[#B91C1C]'
                        : 'bg-[#FDF6E8] text-[#B45309]'
                  }`}
                >
                  {log.status === 'sent' ? 'Envoyé' : log.status === 'failed' ? 'Échec' : 'Simulé'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
