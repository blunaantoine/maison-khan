'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3]">
      <div className="bg-white p-10 max-w-md w-full text-center space-y-6">
        
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
          {orderId && (
            <p className="text-xs text-[#9C9A92] uppercase tracking-widest">
              Commande #{orderId.slice(-8).toUpperCase()}
            </p>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <Link
            href="/orders"
            className="block w-full py-3 bg-[#1A4D8C] text-white text-sm uppercase tracking-wider hover:bg-[#163c70] transition-colors"
          >
            Voir mes commandes
          </Link>
          <Link
            href="/"
            className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors"
          >
            Continuer mes achats
          </Link>
        </div>

      </div>
    </div>
  )
}