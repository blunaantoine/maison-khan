'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Send,
  BellRing,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Users,
  User,
  X,
  Clock,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from 'lucide-react'
import { getTypeMeta, timeAgo, TYPE_DISPLAY_META } from '@/components/notifications/meta'
import { NOTIFICATION_LIMITS } from '@/lib/notifications/types'

/**
 * Interface ADMIN des notifications in-app (cloche 🔔 client) :
 *  1. Statistiques (envoyées, non lues, aujourd'hui, par type)
 *  2. Composer — envoyer à un utilisateur, plusieurs, un rôle ou tous
 *  3. Historique des envois groupés (batchId), paginé
 *
 * Autonome : fetch /api/admin/notifications (polling 30 s), POST envoi.
 * Routes protégées par le middleware (manager/admin) + re-validation serveur.
 */

interface RecipientOption {
  id: string
  label: string
  email: string
  role: string
}

interface HistoryBatch {
  batchId: string
  type: string
  title: string
  message: string
  link: string | null
  senderId: string | null
  senderName: string | null
  sentCount: number
  createdAt: string
}

interface Stats {
  totalSent: number
  totalUnread: number
  sentToday: number
  byType: { type: string; count: number }[]
}

interface ApiResponse {
  batches: HistoryBatch[]
  total: number
  page: number
  pageSize: number
  stats: Stats
  recipients: RecipientOption[]
}

type TargetMode = 'user' | 'users' | 'role' | 'all'

const ROLE_LABELS: Record<string, string> = {
  customer: 'Clients',
  manager: 'Managers',
  admin: 'Administrateurs',
}

export function AdminInAppNotifications() {
  // ── Données (historique + stats + destinataires) ──
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(1)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const fetchAll = useCallback(async (p?: number) => {
    const target = p ?? 1
    try {
      const res = await fetch(`/api/admin/notifications?page=${target}`, {
        credentials: 'include',
      })
      if (!res.ok) throw new Error()
      const json = (await res.json()) as ApiResponse
      if (!mounted.current) return
      setData(json)
      setError(false)
    } catch {
      if (mounted.current) setError(true)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(() => fetchAll(), 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  // ── Composer ──
  const [form, setForm] = useState({ title: '', message: '', link: '' })
  const [type, setType] = useState('promotion')
  const [targetMode, setTargetMode] = useState<TargetMode>('all')
  const [role, setRole] = useState('customer')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)

  const recipients = data?.recipients ?? []

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q
      ? recipients.filter(
          (r) =>
            r.label.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
        )
      : recipients
    return base.slice(0, 30)
  }, [recipients, search])

  const selectedRecipients = useMemo(
    () => recipients.filter((r) => selectedIds.includes(r.id)),
    [recipients, selectedIds]
  )

  const toggleRecipient = (id: string) => {
    setSendResult(null)
    if (targetMode === 'user') {
      setSelectedIds([id])
    } else {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
      )
    }
  }

  const changeTargetMode = (mode: TargetMode) => {
    setTargetMode(mode)
    setSelectedIds([])
    setSearch('')
    setSendResult(null)
  }

  const canSubmit =
    !sending &&
    form.title.trim().length >= NOTIFICATION_LIMITS.titleMin &&
    form.message.trim().length >= NOTIFICATION_LIMITS.messageMin &&
    ((targetMode === 'user' && selectedIds.length === 1) ||
      (targetMode === 'users' && selectedIds.length > 0) ||
      targetMode === 'role' ||
      targetMode === 'all')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setSending(true)
    setSendResult(null)
    try {
      const body: Record<string, unknown> = {
        type,
        title: form.title.trim(),
        message: form.message.trim(),
        link: form.link.trim() || undefined,
        target: targetMode,
      }
      if (targetMode === 'user') body.userId = selectedIds[0]
      if (targetMode === 'users') body.userIds = selectedIds
      if (targetMode === 'role') body.role = role

      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        setSendResult({ ok: true, message: `✓ ${json.message}` })
        setForm({ title: '', message: '', link: '' })
        setSelectedIds([])
        setSearch('')
        setPage(1)
        fetchAll(1) // rafraîchit immédiatement l'historique + stats
      } else {
        setSendResult({ ok: false, message: `✗ ${json.error || 'Erreur lors de l’envoi'}` })
      }
    } catch {
      setSendResult({ ok: false, message: '✗ Connexion impossible — réessayez' })
    } finally {
      setSending(false)
    }
  }

  const stats = data?.stats
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <Card className="p-6">
      {/* ── Titre + statistiques ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <BellRing className="h-6 w-6 text-[#9C7C5C]" />
          <h3
            className="font-display text-xl text-[#0A0A0A]"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Notifications dans l&apos;application
          </h3>
        </div>
        <span className="text-xs text-[#9C9A92]">cloche 🔔 des clients · actualisation 30 s</span>
      </div>

      {loading && !data ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="bg-[#F8F6F3] p-4">
            <div className="flex items-center gap-2 text-[#6B6560] text-xs uppercase tracking-widest mb-1">
              <Send className="h-3.5 w-3.5" /> Envoyées
            </div>
            <p className="font-display text-2xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {stats.totalSent}
            </p>
          </div>
          <div className="bg-[#FDF2F2] p-4">
            <div className="flex items-center gap-2 text-[#6B6560] text-xs uppercase tracking-widest mb-1">
              <BellRing className="h-3.5 w-3.5" /> Non lues
            </div>
            <p className="font-display text-2xl text-[#B91C1C]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {stats.totalUnread}
            </p>
          </div>
          <div className="bg-[#F0F7F1] p-4">
            <div className="flex items-center gap-2 text-[#6B6560] text-xs uppercase tracking-widest mb-1">
              <Clock className="h-3.5 w-3.5" /> Aujourd&apos;hui
            </div>
            <p className="font-display text-2xl text-[#15803D]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              {stats.sentToday}
            </p>
          </div>
          <div className="bg-[#EDE8E1] p-4">
            <div className="flex items-center gap-2 text-[#6B6560] text-xs uppercase tracking-widest mb-1">
              <Sparkles className="h-3.5 w-3.5" /> Par type
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.byType.length === 0 ? (
                <span className="text-xs text-[#9C9A92]">—</span>
              ) : (
                stats.byType.map((t) => {
                  const meta = getTypeMeta(t.type)
                  return (
                    <span
                      key={t.type}
                      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      {meta.label} {t.count}
                    </span>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Composer ── */}
      <form onSubmit={submit} className="space-y-4 border-t border-[#EDE8E1] pt-6">
        <p className="text-xs font-medium uppercase tracking-widest text-[#9C9A92]">
          Créer une notification
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Type */}
          <div>
            <label htmlFor="notif-type" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
              Type <span className="text-[#B45309]">*</span>
            </label>
            <Select value={type} onValueChange={(v) => { setType(v); setSendResult(null) }}>
              <SelectTrigger id="notif-type" className="w-full">
                <SelectValue placeholder="Choisir un type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_DISPLAY_META).map(([id, m]) => {
                  const Icon = m.icon
                  return (
                    <SelectItem key={id} value={id}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4" style={{ color: m.color }} />
                        {m.label}
                      </span>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Lien */}
          <div>
            <label htmlFor="notif-link" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
              Lien ouvert au clic <span className="normal-case tracking-normal">(optionnel)</span>
            </label>
            <Input
              id="notif-link"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="#account, /produit/… ou #catalogue"
              maxLength={NOTIFICATION_LIMITS.linkMax}
            />
          </div>
        </div>

        {/* Destinataire */}
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
            Destinataire <span className="text-[#B45309]">*</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-4 mb-3">
            {(
              [
                { id: 'user', label: 'Un utilisateur', icon: User },
                { id: 'users', label: 'Plusieurs', icon: Users },
                { id: 'role', label: 'Par rôle', icon: CheckCheck },
                { id: 'all', label: 'Tous', icon: Send },
              ] as { id: TargetMode; label: string; icon: typeof User }[]
            ).map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => changeTargetMode(opt.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider border transition-colors ${
                  targetMode === opt.id
                    ? 'bg-[#0A0A0A] text-white border-[#0A0A0A]'
                    : 'text-[#6B6560] border-[#E5E0DA] hover:border-[#9C7C5C] hover:text-[#0A0A0A]'
                }`}
              >
                <opt.icon className="h-3.5 w-3.5" />
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sélection par rôle */}
          {targetMode === 'role' && (
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Sélection d'utilisateur(s) */}
          {(targetMode === 'user' || targetMode === 'users') && (
            <div>
              {/* Chips sélectionnées (mode multiple) */}
              {targetMode === 'users' && selectedRecipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedRecipients.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 bg-[#F8F6F3] border border-[#E5E0DA] text-xs text-[#0A0A0A] pl-2 pr-1 py-1"
                    >
                      {r.label}
                      <button
                        type="button"
                        onClick={() => toggleRecipient(r.id)}
                        aria-label={`Retirer ${r.label}`}
                        className="p-0.5 hover:text-[#B91C1C]"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un client par nom ou email…"
                aria-label="Rechercher un destinataire"
              />
              {recipients.length === 0 ? (
                <p className="text-xs text-[#9C9A92] mt-2">Chargement des destinataires…</p>
              ) : filteredRecipients.length === 0 ? (
                <p className="text-xs text-[#9C9A92] mt-2">Aucun destinataire ne correspond.</p>
              ) : (
                <div className="border border-[#E5E0DA] divide-y divide-[#EDE8E1] mt-2 max-h-52 overflow-y-auto">
                  {filteredRecipients.map((r) => {
                    const selected = selectedIds.includes(r.id)
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => toggleRecipient(r.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors ${
                          selected ? 'bg-[#F0EDE8]' : 'hover:bg-[#F8F6F3]'
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm text-[#0A0A0A] truncate">{r.label}</span>
                          <span className="block text-xs text-[#6B6560] truncate">{r.email}</span>
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-[10px] uppercase tracking-widest text-[#9C9A92]">
                            {ROLE_LABELS[r.role] || r.role}
                          </span>
                          <span
                            className={`w-4 h-4 border flex items-center justify-center ${
                              selected ? 'bg-[#9C7C5C] border-[#9C7C5C]' : 'border-[#C9C4BD]'
                            }`}
                            aria-hidden
                          >
                            {selected && <CheckCheck className="h-3 w-3 text-white" />}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              {targetMode === 'users' && (
                <p className="text-[10px] text-[#9C9A92] mt-1">
                  {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''} · maximum{' '}
                  {NOTIFICATION_LIMITS.maxExplicitRecipients}
                </p>
              )}
            </div>
          )}

          {targetMode === 'all' && (
            <p className="text-xs text-[#6B6560] bg-[#F8F6F3] border border-[#E5E0DA] px-3 py-2">
              La notification sera envoyée à tous les comptes actifs ({recipients.length} utilisateur
              {recipients.length > 1 ? 's' : ''}).
            </p>
          )}
        </div>

        {/* Titre */}
        <div>
          <label htmlFor="notif-title" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
            Titre <span className="text-[#B45309]">*</span>
          </label>
          <Input
            id="notif-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Ex : Ventes privées — ce week-end seulement"
            maxLength={NOTIFICATION_LIMITS.titleMax}
            required
          />
          <p className="text-[10px] text-[#9C9A92] mt-1">
            {form.title.length}/{NOTIFICATION_LIMITS.titleMax}
          </p>
        </div>

        {/* Message */}
        <div>
          <label htmlFor="notif-message" className="block text-xs font-medium uppercase tracking-widest text-[#9C9A92] mb-2">
            Message <span className="text-[#B45309]">*</span>
          </label>
          <textarea
            id="notif-message"
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Ex : Profitez de -20% sur toute la collection Aurore, en boutique et en ligne."
            maxLength={NOTIFICATION_LIMITS.messageMax}
            rows={3}
            required
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-[10px] text-[#9C9A92] mt-1">
            {form.message.length}/{NOTIFICATION_LIMITS.messageMax}
          </p>
        </div>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={!canSubmit}
            className="bg-[#0A0A0A] text-white hover:bg-[#9C7C5C]"
          >
            {sending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Envoi…
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" /> Envoyer la notification
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
            {sendResult.message}
          </p>
        )}
      </form>

      {/* ── Historique des envois ── */}
      <div className="mt-8 pt-6 border-t border-[#EDE8E1]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-widest text-[#9C9A92]">
            Historique des notifications envoyées
          </p>
          {data && data.total > data.pageSize && (
            <span className="text-xs text-[#9C9A92]">
              Page {data.page} / {totalPages}
            </span>
          )}
        </div>

        {loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[#B91C1C]">
            <AlertCircle className="h-4 w-4" />
            Impossible de charger l&apos;historique.
            <button onClick={() => fetchAll(page)} className="text-[#9C7C5C] hover:text-[#8B6B4B] underline">
              Réessayer
            </button>
          </div>
        ) : !data || data.batches.length === 0 ? (
          <p className="text-sm text-[#6B6560] py-6 text-center">
            Aucune notification envoyée pour le moment.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[#EDE8E1] max-h-96 overflow-y-auto border border-[#E5E0DA]">
              {data.batches.map((b) => {
                const meta = getTypeMeta(b.type)
                const Icon = meta.icon
                return (
                  <li key={b.batchId} className="flex items-start gap-3 px-4 py-3">
                    <span
                      className="flex-shrink-0 w-9 h-9 flex items-center justify-center"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#0A0A0A] truncate">{b.title}</p>
                      <p className="text-xs text-[#6B6560] line-clamp-1">{b.message}</p>
                      <p className="text-[11px] text-[#9C9A92] mt-0.5">
                        {timeAgo(b.createdAt)} · {b.sentCount} destinataire{b.sentCount > 1 ? 's' : ''}
                        {b.senderName ? ` · par ${b.senderName}` : ' · automatique'}
                      </p>
                    </div>
                    <span
                      className="text-[10px] uppercase tracking-widest px-1.5 py-0.5 flex-shrink-0"
                      style={{ backgroundColor: meta.bg, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  </li>
                )
              })}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-3 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page <= 1}
                  onClick={() => {
                    const p = data.page - 1
                    setPage(p)
                    fetchAll(p)
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={data.page >= totalPages}
                  onClick={() => {
                    const p = data.page + 1
                    setPage(p)
                    fetchAll(p)
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  )
}
