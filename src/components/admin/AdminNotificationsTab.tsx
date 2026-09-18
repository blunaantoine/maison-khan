'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Send,
  Clock,
  Ban,
  Smartphone,
} from 'lucide-react'

/**
 * Onglet Notifications de l'admin :
 *  1. Envoyer une notification push aux clients (immédiate ou programmée)
 *  2. Centre de notifications (nouvelles commandes, paiements, changements de statut)
 *  3. Journal des emails envoyés aux clients (reçus, confirmations, statuts)
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

interface PushCampaignItem {
  id: string
  title: string
  body: string
  url: string
  status: 'scheduled' | 'sent' | 'cancelled'
  scheduledAt: string
  sentAt: string | null
  sentCount: number
  createdAt: string
}

interface PushAudienceStats {
  subscribers: number
  devices: number
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

  // ── Composer de notifications push ──
  const [campaigns, setCampaigns] = useState<PushCampaignItem[] | null>(null)
  const [audience, setAudience] = useState<PushAudienceStats | null>(null)
  const [form, setForm] = useState({ title: '', body: '', url: '' })
  const [scheduledMode, setScheduledMode] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [notifRes, emailRes, campaignRes] = await Promise.all([
        fetch('/api/notifications', { credentials: 'include' }),
        fetch('/api/email-logs', { credentials: 'include' }),
        fetch('/api/admin/push-campaigns', { credentials: 'include' }),
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
      if (campaignRes.ok) {
        const data = await campaignRes.json()
        if (!mounted.current) return
        setCampaigns(data.campaigns || [])
        setAudience(data.stats || null)
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

  // ── Actions du composer push ──

  const submitCampaign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/admin/push-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: form.title,
          body: form.body,
          url: form.url || undefined,
          scheduledAt: scheduledMode && scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSendResult({ ok: true, message: data.message || 'Notification créée' })
        setForm({ title: '', body: '', url: '' })
        setScheduledAt('')
        fetchAll()
      } else {
        setSendResult({ ok: false, message: data.error || 'Erreur lors de l\u2019envoi' })
      }
    } catch {
      setSendResult({ ok: false, message: 'Connexion impossible — réessayez' })
    } finally {
      setSending(false)
    }
  }

  const campaignAction = async (id: string, action: 'cancel' | 'send-now') => {
    try {
      const res = await fetch('/api/admin/push-campaigns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, action }),
      })
      if (res.ok) fetchAll()
    } catch { /* silencieux */ }
  }

  const deleteCampaign = async (id: string) => {
    try {
      await fetch('/api/admin/push-campaigns', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
      fetchAll()
    } catch { /* silencieux */ }
  }

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="space-y-8">
      {/* ── Envoyer une notification push ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Send className="h-6 w-6 text-[#9C7C5C]" />
            <h3
              className="font-display text-xl text-[#0A0A0A]"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              Envoyer une notification aux clients
            </h3>
          </div>
          {audience && (
            <span className="flex items-center gap-1.5 text-xs text-[#6B6560] bg-[#F8F6F3] px-3 py-1.5">
              <Smartphone className="h-3.5 w-3.5" />
              {audience.subscribers} client{audience.subscribers > 1 ? 's' : ''} abonné
              {audience.subscribers > 1 ? 's' : ''} · {audience.devices} appareil
              {audience.devices > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <form onSubmit={submitCampaign} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="push-title" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
                Titre <span className="text-[#B45309]">*</span>
              </label>
              <Input
                id="push-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Ex : Nouvelle collection Aurore"
                maxLength={80}
                required
              />
              <p className="text-[10px] text-[#9C9A92] mt-1">{form.title.length}/80 — court = plus lisible sur téléphone</p>
            </div>
            <div>
              <label htmlFor="push-url" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
                Lien ouvert au clic <span className="normal-case tracking-normal">(optionnel)</span>
              </label>
              <Input
                id="push-url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="/ (accueil) ou /produit/…"
              />
            </div>
          </div>

          <div>
            <label htmlFor="push-body" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
              Message <span className="text-[#B45309]">*</span>
            </label>
            <Textarea
              id="push-body"
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder="Ex : Les bottines Aurore viennent d'arriver en boutique — pièces limitées !"
              maxLength={200}
              rows={2}
              required
            />
            <p className="text-[10px] text-[#9C9A92] mt-1">{form.body.length}/200 — visible sur l'écran de verrouillage</p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-[#0A0A0A] cursor-pointer select-none pb-2">
              <input
                type="checkbox"
                checked={scheduledMode}
                onChange={(e) => setScheduledMode(e.target.checked)}
                className="h-4 w-4 accent-[#9C7C5C]"
              />
              Programmer plus tard
            </label>
            {scheduledMode && (
              <div className="flex-1 min-w-[220px]">
                <label htmlFor="push-when" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
                  Date et heure d'envoi
                </label>
                <Input
                  id="push-when"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  required={scheduledMode}
                />
              </div>
            )}
            <Button
              type="submit"
              disabled={sending || !form.title.trim() || !form.body.trim() || (scheduledMode && !scheduledAt)}
              className="bg-[#0A0A0A] text-white hover:bg-[#9C7C5C] ml-auto"
            >
              {sending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Envoi…
                </>
              ) : scheduledMode ? (
                <>
                  <Clock className="h-4 w-4 mr-2" /> Programmer
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" /> Envoyer maintenant
                </>
              )}
            </Button>
          </div>

          {sendResult && (
            <p
              role="status"
              className={`text-sm px-4 py-3 ${
                sendResult.ok
                  ? 'bg-[#F0F7F1] text-[#15803D] border border-[#15803D]/20'
                  : 'bg-[#FDF2F2] text-[#B91C1C] border border-[#B91C1C]/20'
              }`}
            >
              {sendResult.ok ? '✓ ' : '✗ '}{sendResult.message}
            </p>
          )}
        </form>

        {/* Historique des campagnes */}
        {campaigns === null ? (
          <div className="mt-6 space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : campaigns.length > 0 && (
          <div className="mt-6 pt-6 border-t border-[#EDE8E1]">
            <p className="text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-3">
              Historique des notifications
            </p>
            <ul className="divide-y divide-[#EDE8E1] max-h-72 overflow-y-auto">
              {campaigns.map((c) => (
                <li key={c.id} className="flex items-start gap-3 py-3">
                  <span className="flex-shrink-0 mt-0.5">
                    {c.status === 'sent' ? (
                      <CheckCheck className="h-4 w-4 text-[#15803D]" />
                    ) : c.status === 'scheduled' ? (
                      <Clock className="h-4 w-4 text-[#B45309]" />
                    ) : (
                      <Ban className="h-4 w-4 text-[#9C9A92]" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0A0A0A]">{c.title}</p>
                    <p className="text-xs text-[#6B6560] break-words">{c.body}</p>
                    <p className="text-[11px] text-[#9C9A92] mt-0.5">
                      {c.status === 'sent' && c.sentAt
                        ? `Envoyée le ${formatDateTime(c.sentAt)} · ${c.sentCount} appareil${c.sentCount > 1 ? 's' : ''}`
                        : c.status === 'scheduled'
                          ? `Programmée pour le ${formatDateTime(c.scheduledAt)}`
                          : 'Annulée'}
                    </p>
                  </div>
                  {c.status === 'scheduled' && (
                    <div className="flex gap-1.5 flex-shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => campaignAction(c.id, 'send-now')}
                        title="Envoyer maintenant au lieu d'attendre"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => campaignAction(c.id, 'cancel')}
                        title="Annuler la programmation"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  {c.status !== 'scheduled' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteCampaign(c.id)}
                      title="Supprimer de l'historique"
                      className="text-[#9C9A92] hover:text-[#B91C1C] flex-shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

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
