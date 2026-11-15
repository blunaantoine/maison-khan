'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Bouton du panneau admin : ouvrir / fermer le site au public.
 * Fermé : les visiteurs voient « Ouverture très prochaine », l'équipe voit tout.
 * Seul un admin peut changer l'état ; un manager le voit seulement.
 */
export function SiteAccessToggle({ canEdit }: { canEdit: boolean }) {
  const [closed, setClosed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/site-access', { credentials: 'include' })
      if (res.ok) setClosed(((await res.json()) as { closed: boolean }).closed)
    } catch { /* l'état reste inconnu */ }
  }, [])

  useEffect(() => {
    const t = window.setTimeout(load, 0)
    return () => window.clearTimeout(t)
  }, [load])

  const toggle = async () => {
    if (closed === null || busy) return
    const next = !closed
    const question = next
      ? 'Fermer le site au public ?\n\nLes clients verront la page « Ouverture très prochaine » et ne pourront plus commander. Les admins et managers connectés continueront de tout voir.'
      : 'Rouvrir le site au public ?\n\nTous les visiteurs verront de nouveau la boutique et pourront commander.'
    if (!window.confirm(question)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/site-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ closed: next }),
      })
      const data = await res.json()
      if (res.ok) setClosed(data.closed)
      else setError(data.error || 'Changement impossible')
    } catch {
      setError('Erreur de connexion')
    } finally {
      setBusy(false)
    }
  }

  if (closed === null) return null

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 mb-8 border ${
        closed ? 'border-[#B91C1C]/30 bg-[#B91C1C]/5' : 'border-[#15803D]/30 bg-[#15803D]/5'
      }`}
    >
      <div>
        <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-1">Visibilité du site</p>
        <p className={`text-lg font-medium ${closed ? 'text-[#B91C1C]' : 'text-[#15803D]'}`}>
          {closed ? '🔒 Fermé au public' : '🌍 Ouvert au public'}
        </p>
        <p className="text-sm text-[#6B6560] mt-1">
          {closed
            ? 'Les clients voient « Ouverture très prochaine ». Seuls les admins et managers voient la boutique.'
            : 'Tous les visiteurs voient la boutique et peuvent commander.'}
        </p>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`shrink-0 px-6 py-3 text-xs uppercase tracking-widest text-white disabled:opacity-60 ${
            closed ? 'bg-[#15803D] hover:bg-[#166534]' : 'bg-[#0A0A0A] hover:bg-[#2A2A2A]'
          }`}
        >
          {busy ? '…' : closed ? 'Rouvrir le site' : 'Fermer le site au public'}
        </button>
      )}
    </div>
  )
}
