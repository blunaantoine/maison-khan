'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Page de retour KPrimePay (return_url).
 * Vérifie le paiement côté serveur puis redirige vers les pages existantes
 * /payment-success ou /payment-failed, sans les modifier.
 */

// ~5 min : laisse le temps à l'opérateur de répondre (le serveur conclut à l'échec après 4 min)
const MAX_ATTEMPTS = 100
const INTERVAL_MS = 3000
// Délai après lequel le serveur conclut à l'échec (KPP_PUSH_TIMEOUT_MS dans src/lib/kprimepay.ts).
// KPrimePay ne remonte jamais les refus de l'opérateur : seul le succès est signalé.
const PUSH_TIMEOUT_S = 120
// Le bouton « Je n'ai pas pu valider » apparaît après ce délai
const CANCEL_BUTTON_AFTER_S = 10

function RetourKPrimePay() {
  const router = useRouter()
  const params = useSearchParams()
  const orderId = params.get('orderId')
  const isPush = params.get('flow') === 'push'
  const [run, setRun] = useState(0)

  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<'checking' | 'timeout' | 'error' | 'review'>(orderId ? 'checking' : 'error')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // Compte à rebours (USSD push)
  const startedAt = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000)
    return () => clearInterval(id)
  }, [])
  const remaining = Math.max(0, PUSH_TIMEOUT_S - elapsed)
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`

  // Le client signale qu'il n'a pas pu valider : on conclut sans attendre le délai.
  const handleCancel = async () => {
    if (!orderId || cancelling) return
    setCancelling(true)
    try {
      const res = await fetch('/api/kprimepay/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const data = await res.json()
      if (timer.current) clearTimeout(timer.current)
      const q = `orderId=${encodeURIComponent(orderId)}`
      if (data?.status === 'completed') router.replace(`/payment-success?${q}`)
      else if (data?.status === 'amount_mismatch') setState('review')
      else router.replace(`/payment-failed?${q}`)
    } catch {
      setCancelling(false)
    }
  }

  useEffect(() => {
    if (!orderId) return
    let cancelled = false

    const check = async (n: number) => {
      if (cancelled) return
      setAttempt(n)
      try {
        const res = await fetch(`/api/kprimepay/verify?orderId=${encodeURIComponent(orderId)}`, { cache: 'no-store' })
        const data = await res.json()
        const status: string = data?.status

        if (status === 'completed') {
          router.replace(`/payment-success?orderId=${encodeURIComponent(orderId)}`)
          return
        }
        if (status === 'failed') {
          router.replace(`/payment-failed?orderId=${encodeURIComponent(orderId)}`)
          return
        }
        if (status === 'amount_mismatch') {
          setState('review')
          return
        }
        if (!data?.success) {
          setState('error')
          return
        }
      } catch {
        // on réessaie
      }

      if (n + 1 < MAX_ATTEMPTS) {
        timer.current = setTimeout(() => check(n + 1), INTERVAL_MS)
      } else {
        setState('timeout')
      }
    }

    check(0)
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [orderId, router, run])

  const title =
    state === 'checking'
      ? 'Vérification du paiement…'
      : state === 'timeout'
        ? 'Paiement en cours de confirmation'
        : state === 'review'
          ? 'Paiement en cours de vérification'
          : 'Impossible de vérifier le paiement'

  const text =
    state === 'checking'
      ? isPush
        ? 'Une demande de paiement a été envoyée sur votre téléphone. Saisissez votre code secret Mobile Money pour valider. Cette page se met à jour automatiquement.'
        : 'Nous confirmons votre paiement auprès de KPrimePay. Si une demande est arrivée sur votre téléphone, validez-la.'
      : state === 'timeout'
        ? "La confirmation prend plus de temps que prévu. Si vous avez validé le paiement, votre commande sera mise à jour automatiquement : consultez « Mon compte » dans quelques minutes."
        : state === 'review'
          ? 'Votre paiement nécessite une vérification manuelle. Notre équipe vous contactera rapidement.'
          : 'Contactez-nous avec votre numéro de commande si vous avez été débité.'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4">
      <div className="bg-white p-10 max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-[#9C7C5C]/10 flex items-center justify-center">
            {state === 'checking' ? (
              <svg className="w-8 h-8 text-[#9C7C5C] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-[#9C7C5C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-medium text-[#2C2C2A]">{title}</h1>
          <p className="text-[#6B6560] text-sm">{text}</p>
          {orderId && (
            <p className="text-xs text-[#9C9A92] uppercase tracking-widest">Réf. #{orderId.slice(-8).toUpperCase()}</p>
          )}
        </div>

        {state === 'checking' && isPush && (
          <div className="space-y-2">
            <p className="text-sm text-[#2C2C2A]">
              {remaining > 0 ? (
                <>
                  Délai restant : <span className="font-semibold tabular-nums">{countdown}</span>
                </>
              ) : (
                'Finalisation de la vérification…'
              )}
            </p>
            <div className="w-full bg-[#EDE8E1] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#9C7C5C] rounded-full transition-all duration-1000 ease-linear"
                style={{ width: `${(remaining / PUSH_TIMEOUT_S) * 100}%` }}
              />
            </div>
          </div>
        )}

        {state === 'checking' && !isPush && (
          <div className="w-full bg-[#EDE8E1] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-[#9C7C5C] rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, ((attempt + 1) / MAX_ATTEMPTS) * 100)}%` }}
            />
          </div>
        )}

        {state === 'checking' && isPush && elapsed >= CANCEL_BUTTON_AFTER_S && (
          <div className="space-y-3">
            <p className="text-xs text-[#9C9A92]">
              Vous avez refusé, votre solde est insuffisant ou vous n&apos;avez reçu aucune demande ? Indiquez-le pour
              réessayer tout de suite.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] hover:text-[#9C7C5C] transition-colors disabled:opacity-60"
            >
              {cancelling ? 'Vérification…' : "Je n'ai pas pu valider le paiement"}
            </button>
          </div>
        )}

        {state === 'timeout' && (
          <button
            type="button"
            onClick={() => { setState('checking'); setRun((r) => r + 1) }}
            className="block w-full py-3 border border-[#9C7C5C] text-[#9C7C5C] text-sm uppercase tracking-wider hover:bg-[#9C7C5C]/10 transition-colors"
          >
            Vérifier à nouveau
          </button>
        )}

        {state !== 'checking' && (
          <Link
            href="/"
            className="block w-full py-3 bg-[#2C2C2A] text-white text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors"
          >
            Retour à la boutique
          </Link>
        )}
      </div>
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RetourKPrimePay />
    </Suspense>
  )
}
