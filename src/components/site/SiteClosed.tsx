'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Page affichée aux visiteurs quand le site est fermé au public.
 * Aucun lien de connexion n'y est visible : l'équipe se connecte via
 * l'adresse /connexion (non affichée), qui montre le formulaire.
 */
export function SiteClosed() {
  const pathname = usePathname()
  // Retour de la connexion Google (/?auth=google|error) : on réaffiche le formulaire avec un message
  const [authParam, setAuthParam] = useState<string | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setAuthParam(new URLSearchParams(window.location.search).get('auth')), 0)
    return () => window.clearTimeout(t)
  }, [])
  const showLogin = pathname === '/connexion' || authParam === 'google' || authParam === 'error'
  useEffect(() => {
    if (!showLogin) return
    fetch('/api/auth/google/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setGoogleEnabled(Boolean(d?.configured)))
      .catch(() => {})
  }, [showLogin])
  const googleMessage =
    authParam === 'error'
      ? 'La connexion Google a échoué. Réessayez ou utilisez votre mot de passe.'
      : authParam === 'google'
        ? "Ce compte Google n'a pas accès à l'espace équipe."
        : null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Connexion impossible')
      } else if (data.user?.role !== 'admin' && data.user?.role !== 'manager') {
        setError('Accès réservé à l\'équipe Maison Khan')
      } else {
        window.location.href = '/'
      }
    } catch {
      setError('Erreur de connexion. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  const input = 'w-full border border-[#E5E0DA] bg-white px-4 py-3 text-sm outline-none focus:border-[#9C7C5C]'

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-16 text-center bg-[#F8F6F3]">
      <div className="max-w-xl w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MAISON KHAN" className="w-32 h-auto mx-auto mb-8" />
        <p className="text-xs uppercase tracking-[0.35em] text-[#9C7C5C] mb-4">Made in Africa</p>
        <h1
          className="text-4xl sm:text-5xl font-light text-[#0A0A0A] leading-tight mb-6"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Notre boutique ouvre très prochainement
        </h1>
        <div className="w-16 border-t border-[#E5E0DA] mx-auto my-7" />
        <p className="text-[#6B6560] leading-relaxed">
          Nous préparons nos nouvelles collections de chaussures et accessoires de luxe.
          <br />
          Merci de votre patience — revenez très bientôt.
        </p>

        <div className="mt-16">
          {showLogin && (
            <div className="max-w-sm mx-auto">
            {googleMessage && <p className="text-sm text-red-600 mb-4">{googleMessage}</p>}
            {googleEnabled && (
              <>
                <a
                  href="/api/auth/google"
                  className="w-full flex items-center justify-center gap-3 p-3 bg-white border border-[#E5E0DA] hover:border-[#9C7C5C] transition-colors"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span className="text-sm text-[#0A0A0A]">Continuer avec Google</span>
                </a>
                <div className="flex items-center gap-3 my-5 text-xs text-[#B8B4AE] uppercase tracking-widest">
                  <span className="flex-1 border-t border-[#E5E0DA]" />ou<span className="flex-1 border-t border-[#E5E0DA]" />
                </div>
              </>
            )}
            <form onSubmit={login} className="space-y-3 text-left">
              <input
                type="email"
                className={input}
                placeholder="E-mail"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className={input}
                placeholder="Mot de passe"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0A0A0A] text-white py-3 text-xs uppercase tracking-widest disabled:opacity-60"
              >
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
            </form>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
