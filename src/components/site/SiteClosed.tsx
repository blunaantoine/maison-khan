'use client'

import { useState } from 'react'

/**
 * Page affichée aux visiteurs quand le site est fermé au public.
 * Un lien discret permet aux admins / managers de se connecter.
 */
export function SiteClosed() {
  const [showLogin, setShowLogin] = useState(false)
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
        window.location.reload()
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
          {!showLogin ? (
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              className="text-xs text-[#B8B4AE] hover:text-[#6B6560] underline underline-offset-4"
            >
              Accès administrateur
            </button>
          ) : (
            <form onSubmit={login} className="max-w-sm mx-auto space-y-3 text-left">
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
          )}
        </div>
      </div>
    </main>
  )
}
