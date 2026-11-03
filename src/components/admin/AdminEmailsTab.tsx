'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Mail,
  MailCheck,
  MailX,
  MailQuestion,
  RefreshCw,
  Send,
  Search,
  ShieldCheck,
  BarChart3,
} from 'lucide-react'

/**
 * Onglet E-mails de l'admin :
 *  - Vue d'ensemble : compteurs (envoyés / échecs / simulés) + état de la
 *    configuration (Resend, suivi EmailOqui, alerte paiement staff)
 *  - Journal complet filtrable (statut, type, recherche) des 200 derniers e-mails
 *  - Envoi d'un e-mail de test en un clic pour vérifier la configuration
 *
 * Auto-refresh 30 s (comme le reste du panneau).
 */

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
  emailoqui?: { configured: boolean }
  adminAlert?: { configured: boolean; addresses: string[] }
}

const TYPE_LABELS: Record<string, string> = {
  payment_receipt: 'Reçu de paiement',
  status_update: 'Mise à jour commande',
  order_confirmation: 'Reçu de commande (ancien)',
  password_reset: 'Mot de passe',
  admin_alert: '🔔 Alerte staff',
  test: 'Test',
}

const STATUS_LABELS: Record<string, string> = {
  sent: 'Envoyé',
  failed: 'Échec',
  skipped: 'Simulé',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    sent: 'bg-[#F0F7F1] text-[#15803D]',
    failed: 'bg-[#FDF2F2] text-[#B91C1C]',
    skipped: 'bg-[#FEF7EC] text-[#B45309]',
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${styles[status] || 'bg-[#F3F1EE] text-[#6B6560]'}`}>
      {status === 'sent' && <MailCheck className="w-3 h-3" />}
      {status === 'failed' && <MailX className="w-3 h-3" />}
      {status === 'skipped' && <MailQuestion className="w-3 h-3" />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export function AdminEmailsTab() {
  const [logs, setLogs] = useState<EmailLogItem[] | null>(null)
  const [stats, setStats] = useState<EmailStats | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(100)

  const [refreshing, setRefreshing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // E-mail de test
  const [testTo, setTestTo] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const filtersRef = useRef({ statusFilter, typeFilter, search, limit })
  useEffect(() => {
    filtersRef.current = { statusFilter, typeFilter, search, limit }
  }, [statusFilter, typeFilter, search, limit])

  const fetchEmails = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const { statusFilter: s, typeFilter: t, search: q, limit: l } = filtersRef.current
      const params = new URLSearchParams()
      if (s) params.set('status', s)
      if (t) params.set('type', t)
      if (q.trim()) params.set('q', q.trim())
      params.set('limit', String(l))
      const res = await fetch(`/api/email-logs?${params.toString()}`, { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        setStats(data.stats || null)
      }
    } catch {
      // réseau : on garde les données précédentes
    }
    setRefreshing(false)
  }, [])

  // Rafraîchissement toutes les 30 s. Le chargement initial (et le rechargement
  // après changement de filtres) est géré par l'effet debounce ci-dessous,
  // déclenché au montage : pas d'appel synchrone dans cet effet.
  useEffect(() => {
    const interval = setInterval(() => fetchEmails(true), 30000)
    return () => clearInterval(interval)
  }, [fetchEmails])

  useEffect(() => {
    const t = setTimeout(() => fetchEmails(true), 300)
    return () => clearTimeout(t)
  }, [statusFilter, typeFilter, limit, fetchEmails])

  const handleTestEmail = async () => {
    if (!testTo.trim() || testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/email-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: testTo.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setTestResult({ ok: true, msg: `E-mail de test envoyé à ${testTo.trim()} — vérifiez la boîte de réception (et les spams).` })
        setTestTo('')
        fetchEmails(true)
      } else {
        setTestResult({ ok: false, msg: data.error || 'Échec de l\'envoi — voir le journal ci-dessous.' })
      }
    } catch {
      setTestResult({ ok: false, msg: 'Erreur de connexion. Réessayez.' })
    }
    setTesting(false)
  }

  return (
    <div className="space-y-6">

      {/* ── Vue d'ensemble ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F0F7F1] flex items-center justify-center">
              <MailCheck className="w-5 h-5 text-[#15803D]" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-[#0A0A0A]">{stats ? stats.sent : '—'}</p>
              <p className="text-xs text-[#6B6560]">Envoyés</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FDF2F2] flex items-center justify-center">
              <MailX className="w-5 h-5 text-[#B91C1C]" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-[#0A0A0A]">{stats ? stats.failed : '—'}</p>
              <p className="text-xs text-[#6B6560]">Échecs</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FEF7EC] flex items-center justify-center">
              <MailQuestion className="w-5 h-5 text-[#B45309]" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-[#0A0A0A]">{stats ? stats.skipped : '—'}</p>
              <p className="text-xs text-[#6B6560]">Simulés (clé absente)</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#F3F1EE] flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-[#9C7C5C]" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-[#0A0A0A]">{stats ? stats.total : '—'}</p>
              <p className="text-xs text-[#6B6560]">Total journal</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Configuration ── */}
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-[#0A0A0A] flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#9C7C5C]" />
            Configuration
          </h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchEmails()}
            disabled={refreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualiser
          </Button>
        </div>
        {stats === null ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[#6B6560]">Envoi réel (Resend)</span>
              {stats.configured ? (
                <span className="text-[#15803D] font-medium">✓ Clé configurée</span>
              ) : (
                <span className="text-[#B45309] font-medium">◌ Absente — e-mails simulés. Ajoutez RESEND_API_KEY dans .env puis relancez update.sh</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F3F1EE] pt-3">
              <span className="text-[#6B6560]">Suivi des envois (EmailOqui)</span>
              {stats.emailoqui?.configured ? (
                <span className="text-[#15803D] font-medium">✓ Actif</span>
              ) : (
                <span className="text-[#9C9A92]">Optionnel — inactif</span>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F3F1EE] pt-3">
              <span className="text-[#6B6560]">
                Alerte « Paiement confirmé » au staff
                <span className="block text-xs text-[#9C9A92]">
                  Envoyée à chaque paiement validé : comptes admin/manager + adresse(s) ADMIN_ALERT_EMAIL
                </span>
              </span>
              {stats.adminAlert?.configured ? (
                <span className="text-[#15803D] font-medium text-right">
                  ✓ Active
                  {stats.adminAlert.addresses.length > 0 && (
                    <span className="block text-xs text-[#6B6560] font-normal">
                      Adresse(s) programmée(s) : {stats.adminAlert.addresses.join(', ')}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[#B45309] font-medium">
                  ⚠ Aucun destinataire — créez un compte admin ou ajoutez ADMIN_ALERT_EMAIL dans .env
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* ── E-mail de test ── */}
      <Card className="p-4 md:p-6">
        <h3 className="font-medium text-[#0A0A0A] flex items-center gap-2 mb-1">
          <Send className="w-4 h-4 text-[#9C7C5C]" />
          Tester l'envoi
        </h3>
        <p className="text-xs text-[#6B6560] mb-4">
          Vérifie en un clic que la configuration fonctionne (clé, domaine, réception), sans attendre une commande.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            placeholder="adresse@exemple.com"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTestEmail()}
            className="flex-1"
          />
          <Button onClick={handleTestEmail} disabled={testing || !testTo.trim()} className="gap-2">
            {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {testing ? 'Envoi…' : 'Envoyer le test'}
          </Button>
        </div>
        {testResult && (
          <p className={`mt-3 text-sm ${testResult.ok ? 'text-[#15803D]' : 'text-[#B91C1C]'}`}>
            {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
          </p>
        )}
      </Card>

      {/* ── Journal ── */}
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-[#0A0A0A] flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#9C7C5C]" />
            Journal des e-mails
          </h3>
          <span className="text-xs text-[#9C9A92]">Actualisation automatique toutes les 30 s</span>
        </div>

        {/* Filtres */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9C9A92]" />
            <Input
              placeholder="Rechercher (destinataire, sujet, commande)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-md border border-[#E5E0DA] bg-white px-3 text-sm text-[#2C2C2A]"
            aria-label="Filtrer par statut"
          >
            <option value="">Tous les statuts</option>
            <option value="sent">Envoyés</option>
            <option value="failed">Échecs</option>
            <option value="skipped">Simulés</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-md border border-[#E5E0DA] bg-white px-3 text-sm text-[#2C2C2A]"
            aria-label="Filtrer par type"
          >
            <option value="">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 mb-4 text-xs text-[#6B6560]">
          <span>Afficher :</span>
          {[50, 100, 200].map((n) => (
            <button
              key={n}
              onClick={() => setLimit(n)}
              className={`px-2 py-1 rounded ${limit === n ? 'bg-[#9C7C5C] text-white' : 'bg-[#F3F1EE] hover:bg-[#EDE8E1]'}`}
            >
              {n}
            </button>
          ))}
          <span>derniers e-mails</span>
        </div>

        {/* Liste */}
        {logs === null ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#9C9A92]">
            <Mail className="w-8 h-8 mx-auto mb-3 opacity-40" />
            Aucun e-mail ne correspond à ces filtres.
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto -mx-2">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-[11px] uppercase tracking-wider text-[#9C9A92] border-b border-[#EDE8E1]">
                  <th className="py-2 px-2 font-medium">Date</th>
                  <th className="py-2 px-2 font-medium">Destinataire</th>
                  <th className="py-2 px-2 font-medium hidden md:table-cell">Sujet</th>
                  <th className="py-2 px-2 font-medium">Type</th>
                  <th className="py-2 px-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-[#F3F1EE] hover:bg-[#FAF8F5] cursor-pointer align-top"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <td className="py-2.5 px-2 text-[#6B6560] whitespace-nowrap text-xs">{fmtDate(log.createdAt)}</td>
                    <td className="py-2.5 px-2 text-[#2C2C2A] break-all max-w-[180px]">{log.to}</td>
                    <td className="py-2.5 px-2 text-[#2C2C2A] hidden md:table-cell max-w-[220px] truncate">{log.subject}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap text-xs text-[#6B6560]">{TYPE_LABELS[log.type] || log.type}</td>
                    <td className="py-2.5 px-2">
                      <StatusBadge status={log.status} />
                      {(log.error || log.orderId) && (
                        <div className="mt-1">
                          {expandedId === log.id && (
                            <div className="text-[11px] text-[#6B6560] max-w-[240px]">
                              {log.error && <p className="text-[#B91C1C] break-words">{log.error}</p>}
                              {log.orderId && <p className="text-[#9C9A92] mt-1">Commande : {log.orderId}</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {logs !== null && logs.length > 0 && (
          <p className="mt-3 text-xs text-[#9C9A92]">
            Cliquez sur une ligne pour voir le détail (erreur, commande liée).
          </p>
        )}
      </Card>

    </div>
  )
}

export default AdminEmailsTab
