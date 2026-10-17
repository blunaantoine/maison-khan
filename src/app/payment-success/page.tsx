'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

/**
 * Page de retour après paiement PayDunya.
 *
 * ⚠️ Le lien « retourner à la boutique » n'est PAS une preuve de paiement :
 * le client peut revenir ici après un paiement refusé ou annulé.
 * On vérifie donc le VRAI statut auprès du serveur (qui confirme en direct
 * chez PayDunya via /api/paydunya/verify) avant d'afficher « Paiement réussi ».
 *
 * États affichés :
 *  - checking      : vérification en cours (spinner + long-polling)
 *  - success       : paiement confirmé ✅
 *  - failed        : paiement refusé ❌ (+ bouton Réessayer)
 *  - cancelled     : paiement annulé (+ bouton Réessayer)
 *  - still_pending : pas encore confirmé après tous les essais (mobile money
 *                    parfois lent) → bouton « Vérifier à nouveau »
 *  - error         : commande introuvable / paramètre manquant
 */

type ScreenState =
  | 'checking'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'still_pending'
  | 'error'

// LONG-POLLING : le serveur garde chaque requête ouverte ~12 s et répond DÈS
// que le statut est confirmé (surveillance de la base/IPN en continu). Le
// client relance une nouvelle veille aussitôt la réponse reçue — le résultat
// s'affiche < 1 s après la confirmation du prestataire, sans attente de tick.
// Au total, on veille ~3 min (mobile money parfois lent) avant « still_pending ».
const TOTAL_VERIFY_MS = 3 * 60 * 1000
const RELONGPOLL_DELAY_MS = 300
const RETRY_AFTER_ERROR_MS = 1500

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')

  const [state, setState] = useState<ScreenState>(orderId ? 'checking' : 'error')
  const [verifyNonce, setVerifyNonce] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)

  // ── Vérification du paiement (long-polling) ──
  useEffect(() => {
    if (!orderId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const startedAt = Date.now()

    // Compteur de secondes affiché pendant l'attente
    const tick = setInterval(
      () => setElapsedSec(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    )

    const checkPayment = async () => {
      if (cancelled) return
      try {
        const res = await fetch(
          `/api/paydunya/verify?orderId=${encodeURIComponent(orderId)}&wait=1`,
          { cache: 'no-store' }
        )
        const data = await res.json()
        if (cancelled) return

        const status = data?.status as string | undefined
        if (status === 'completed') {
          setState('success')
          return
        }
        if (status === 'cancelled') {
          setState('cancelled')
          return
        }
        if (status === 'failed' || status === 'expired') {
          setState('failed')
          return
        }
        // pending (ou réponse inattendue) → nouvelle veille immédiate
        if (Date.now() - startedAt < TOTAL_VERIFY_MS) {
          timer = setTimeout(checkPayment, RELONGPOLL_DELAY_MS)
        } else {
          setState('still_pending')
        }
      } catch {
        if (cancelled) return
        if (Date.now() - startedAt < TOTAL_VERIFY_MS) {
          timer = setTimeout(checkPayment, RETRY_AFTER_ERROR_MS)
        } else {
          setState('still_pending')
        }
      }
    }

    checkPayment()

    return () => {
      cancelled = true
      clearInterval(tick)
      if (timer) clearTimeout(timer)
    }
  }, [orderId, verifyNonce])

  // ── Relancer le paiement (même mécanisme que le tableau de bord client) ──
  // La commande peut avoir été tentée par carte (KPrimePay) OU Mobile Money
  // (PayDunya) : on demande au serveur la méthode du dernier paiement puis on
  // relance le bon checkout.
  const handleRetry = async () => {
    if (!orderId || retrying) return
    setRetrying(true)
    setRetryError(null)
    try {
      // 1. Quelle méthode pour cette commande ?
      const mRes = await fetch('/api/payments/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      })
      const mData = await mRes.json()
      if (!mRes.ok || !mData.success) {
        setRetryError(mData.error || 'Impossible de relancer le paiement.')
        setRetrying(false)
        return
      }

      // 2. Relancer le bon moyen de paiement
      const endpoint = mData.method === 'kprimepay' ? '/api/kprimepay/init' : '/api/paydunya-psr'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, ...(mData.method === 'kprimepay' ? { method: 'card' } : {}) }),
      })
      const data = await res.json()
      if (data.success && data.url) {
        window.location.assign(data.url)
        return // la redirection met fin à la page
      }
      setRetryError(data.error || 'Impossible de relancer le paiement.')
    } catch {
      setRetryError('Erreur de connexion. Vérifiez votre réseau et réessayez.')
    }
    setRetrying(false)
  }

  const orderLabel = orderId ? orderId.slice(-8).toUpperCase() : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4 py-10">
      <div className="bg-white p-8 sm:p-10 max-w-md w-full text-center space-y-6">

        {/* ── Vérification en cours ── */}
        {state === 'checking' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-[#F8F6F3] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#9C7C5C] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Vérification de votre paiement…</h1>
              <p className="text-[#6B6560] text-sm">
                Nous confirmons votre transaction auprès de notre prestataire de paiement.
                Cela ne prend que quelques secondes, ne fermez pas cette page.
              </p>
              <p className="text-[#9C9A92] text-xs tabular-nums">
                Vérification en temps réel… ({elapsedSec} s)
              </p>
              {orderLabel && (
                <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
                  Commande #{orderLabel}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Paiement confirmé ── */}
        {state === 'success' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement réussi</h1>
              <p className="text-[#6B6560] text-sm">
                Votre commande a bien été confirmée. Vous recevrez une confirmation par SMS.
              </p>
              {orderLabel && (
                <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
                  Commande #{orderLabel}
                </p>
              )}
            </div>
            <div className="space-y-3 pt-2">
              <Link
                href="/?order_success=1"
                className="block w-full py-3 bg-[#1A4D8C] text-white text-sm uppercase tracking-wider hover:bg-[#163c70] transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
              <Link
                href="/"
                className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
              >
                Continuer mes achats
              </Link>
            </div>
          </>
        )}

        {/* ── Paiement refusé ── */}
        {state === 'failed' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement refusé</h1>
              <p className="text-[#6B6560] text-sm">
                La transaction n&apos;a pas abouti. Vérifiez votre solde ou essayez un autre
                moyen de paiement — votre commande est enregistrée, il ne reste que le paiement.
              </p>
              {orderLabel && (
                <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
                  Commande #{orderLabel}
                </p>
              )}
            </div>
            <div className="space-y-3 pt-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full py-3 bg-[#1a7a4a] text-white text-sm uppercase tracking-wider hover:bg-[#155f39] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Redirection en cours…' : 'Réessayer le paiement'}
              </button>
              <Link
                href="/"
                className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          </>
        )}

        {/* ── Paiement annulé par le client ── */}
        {state === 'cancelled' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement annulé</h1>
              <p className="text-[#6B6560] text-sm">
                Vous avez annulé le paiement. Votre commande est sauvegardée :
                vous pouvez la payer à tout moment.
              </p>
              {orderLabel && (
                <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
                  Commande #{orderLabel}
                </p>
              )}
            </div>
            <div className="space-y-3 pt-2">
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full py-3 bg-[#1a7a4a] text-white text-sm uppercase tracking-wider hover:bg-[#155f39] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Redirection en cours…' : 'Reprendre le paiement'}
              </button>
              <Link
                href="/"
                className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          </>
        )}

        {/* ── Toujours en attente après vérifications répétées ── */}
        {state === 'still_pending' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Vérification en cours</h1>
              <p className="text-[#6B6560] text-sm">
                Votre paiement n&apos;est pas encore confirmé. Les paiements mobile money
                prennent parfois quelques minutes. Si vous avez validé le paiement,
                votre commande sera confirmée automatiquement — vous recevrez un SMS.
              </p>
              {orderLabel && (
                <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
                  Commande #{orderLabel}
                </p>
              )}
            </div>
            <div className="space-y-3 pt-2">
              <button
                onClick={() => { setState('checking'); setVerifyNonce(n => n + 1) }}
                className="w-full py-3 bg-[#1A4D8C] text-white text-sm uppercase tracking-wider hover:bg-[#163c70] transition-colors"
              >
                Vérifier à nouveau
              </button>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full py-3 bg-[#1a7a4a] text-white text-sm uppercase tracking-wider hover:bg-[#155f39] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {retrying ? 'Redirection en cours…' : 'Réessayer le paiement'}
              </button>
              <Link
                href="/"
                className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          </>
        )}

        {/* ── Erreur : commande introuvable ── */}
        {state === 'error' && (
          <>
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-[#F8F6F3] flex items-center justify-center">
                <svg className="w-8 h-8 text-[#9C9A92]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-medium text-[#2C2C2A]">Commande introuvable</h1>
              <p className="text-[#6B6560] text-sm">
                Nous n&apos;avons pas pu identifier votre commande.
                Si vous avez un doute sur un paiement, contactez-nous avec votre référence.
              </p>
            </div>
            <div className="space-y-3 pt-2">
              <Link
                href="/"
                className="block w-full py-3 bg-[#1A4D8C] text-white text-sm uppercase tracking-wider hover:bg-[#163c70] transition-colors"
              >
                Retour à l&apos;accueil
              </Link>
            </div>
          </>
        )}

        {/* Message d'erreur du retry (non bloquant) */}
        {retryError && (state === 'failed' || state === 'cancelled' || state === 'still_pending') && (
          <p className="text-red-600 text-xs -mb-2">{retryError}</p>
        )}

      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3]">
        <div className="text-[#6B6560] text-sm">Chargement...</div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  )
}
