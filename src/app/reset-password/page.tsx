'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const token = useSearchParams().get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères')
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (res.ok) setDone(true)
      else setError(data.error || 'Erreur lors de la réinitialisation')
    } catch {
      setError('Erreur de connexion. Veuillez réessayer.')
    } finally {
      setLoading(false)
    }
  }

  const input = 'w-full border border-[#E5E0DA] rounded px-4 py-3 text-sm outline-none focus:border-[#9C7C5C]'

  return (
    <main className="min-h-screen bg-[#F8F6F3] flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-white rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl text-[#0A0A0A] text-center mb-1">MAISON KHAN</h1>
        <p className="text-center text-[#9C7C5C] text-xs tracking-widest uppercase mb-8">Nouveau mot de passe</p>
        {done ? (
          <div className="text-center">
            <p className="text-[#6B6560] mb-6">Mot de passe modifié. Vous pouvez maintenant vous connecter.</p>
            <Link href="/" className="inline-block bg-[#0A0A0A] text-white px-6 py-3 rounded text-sm">Retour à la boutique</Link>
          </div>
        ) : !token ? (
          <p className="text-center text-red-600">Lien invalide. Refaites une demande depuis « Mot de passe oublié ».</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <input type="password" className={input} placeholder="Nouveau mot de passe" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <input type="password" className={input} placeholder="Confirmer le mot de passe" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-[#0A0A0A] text-white py-3 rounded text-sm disabled:opacity-60">
              {loading ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  )
}
