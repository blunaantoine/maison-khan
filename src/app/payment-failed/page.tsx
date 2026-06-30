'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function PaymentFailedPage() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId') || searchParams.get('order')

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4">
      <div className="bg-white p-10 max-w-md w-full text-center space-y-6">

        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement échoué</h1>
          <p className="text-[#6B6560] text-sm">
            La transaction n'a pas abouti. Vérifiez votre solde et réessayez.
          </p>
          {orderId && (
            <p className="text-xs text-[#9C9A92] uppercase tracking-widest mt-1">
              Réf. #{orderId.slice(-8).toUpperCase()}
            </p>
          )}
        </div>

        <div className="border border-[#f0e8e8] bg-[#fdf8f8] px-4 py-3 text-left space-y-1">
          <p className="text-xs text-[#9C9A92] uppercase tracking-wider">Causes fréquentes</p>
          <ul className="text-sm text-[#6B6560] space-y-1 mt-2">
            <li>· Solde Mobile Money insuffisant</li>
            <li>· Délai de confirmation dépassé</li>
            <li>· Transaction annulée</li>
          </ul>
        </div>

        <div className="space-y-3 pt-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#2C2C2A] text-white text-sm uppercase tracking-wider hover:bg-[#1a1a18] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Réessayer le paiement
          </Link>
          <Link
            href="/"
            className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
          >
            Retour à l'accueil
          </Link>
        </div>

      </div>
    </div>
  )
}