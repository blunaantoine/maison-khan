'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Page de retour KPrimePay (return_url).
 * Vérifie le paiement côté serveur puis redirige vers les pages existantes
 * /payment-success ou /payment-failed, sans les modifier.
 */

// LONG-POLLING : le serveur garde chaque requête ouverte ~12 s et répond DÈS
// que KPrimePay (ou le webhook) a tranché — la page se met à jour < 1 s après
// la confirmation, sans attendre de tick. On veille ~5 min au total : laisse
// le temps à KPrimePay de mettre à jour le statut après le paiement carte
// (leur API peut refléter le succès avec quelques secondes de retard).
const TOTAL_VERIFY_MS = 5 * 60 * 1000
const RELONGPOLL_DELAY_MS = 300
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
    const roundStart = Date.now()

    const check = async () => {
      if (cancelled) return
      try {
        const res = await fetch(`/api/kprimepay/verify?orderId=${encodeURIComponent(orderId)}&wait=1`, { cache: 'no-store' })
        const data = await res.json()
        if (cancelled) return
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

      if (cancelled) return
      if (Date.now() - roundStart < TOTAL_VERIFY_MS) {
        timer.current = setTimeout(check, RELONGPOLL_DELAY_MS)
      } else {
        setState('timeout')
      }
    }

    check()
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
        : 'Vous venez de valider votre paiement sur la page sécurisée KPrimePay. Nous confirmons la transaction en direct — cette page se met à jour automatiquement, aucune action de votre part.'
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
          <div className="space-y-4">
            <div className="w-full bg-[#EDE8E1] rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-[#9C7C5C] rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(100, (elapsed / (TOTAL_VERIFY_MS / 1000)) * 100)}%` }}
              />
            </div>
            <button
              type="button"
              onClick={() => setRun((r) => r + 1)}
              className="text-xs text-[#9C7C5C] underline underline-offset-4 hover:text-[#0A0A0A] transition-colors"
            >
              Vérifier maintenant
            </button>
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
