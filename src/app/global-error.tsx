'use client'

import { useEffect, useState } from 'react'

/**
 * Filet de sécurité : remplace l'écran blanc « Application error » par une page
 * lisible qui AFFICHE la cause réelle (message + début de trace) et propose une
 * réparation en un clic (vide les caches et le service worker, puis recharge).
 * Une erreur après un déploiement vient le plus souvent d'anciens fichiers JS
 * restés en cache dans le navigateur.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    console.error('[MAISON KHAN] Erreur client :', error)
  }, [error])

  const repair = async () => {
    setBusy(true)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        await Promise.all(regs.map((r) => r.unregister()))
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
    } catch { /* on recharge quand même */ }
    window.location.reload()
  }

  const details = [error?.name, error?.message].filter(Boolean).join(' : ')
  const stack = (error?.stack || '').split('\n').slice(0, 6).join('\n')

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F8F6F3', color: '#0A0A0A' }}>
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '64px 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 26, letterSpacing: 2, margin: 0 }}>MAISON KHAN</h1>
          <p style={{ color: '#6B6560', margin: '24px 0' }}>
            Un problème d&apos;affichage est survenu. Appuyez sur « Réparer » pour recharger la boutique.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={repair}
              disabled={busy}
              style={{ background: '#0A0A0A', color: '#fff', border: 0, padding: '12px 24px', borderRadius: 4, fontSize: 15, cursor: 'pointer' }}
            >
              {busy ? 'Réparation…' : 'Réparer et recharger'}
            </button>
            <button
              onClick={() => reset()}
              style={{ background: 'transparent', color: '#0A0A0A', border: '1px solid #0A0A0A', padding: '12px 24px', borderRadius: 4, fontSize: 15, cursor: 'pointer' }}
            >
              Réessayer
            </button>
          </div>
          {details && (
            <details style={{ marginTop: 32, textAlign: 'left', fontSize: 12, color: '#6B6560' }}>
              <summary style={{ cursor: 'pointer' }}>Détails techniques (à envoyer au support)</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#fff', padding: 12, borderRadius: 4 }}>
                {details}
                {error?.digest ? `\ndigest: ${error.digest}` : ''}
                {stack ? `\n\n${stack}` : ''}
              </pre>
            </details>
          )}
        </main>
      </body>
    </html>
  )
}
