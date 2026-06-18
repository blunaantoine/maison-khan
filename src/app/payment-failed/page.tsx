
'use client'

import { useSearchParams } from 'next/navigation'

import Link from 'next/link'

import { Suspense } from 'react'



function PaymentFailedContent() {

  const searchParams = useSearchParams()

  const orderId = searchParams.get('orderId')



  return (

    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3]">

      <div className="bg-white p-10 max-w-md w-full text-center space-y-6">

        <div className="flex justify-center">

          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">

            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">

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

            <p className="text-xs text-[#9C9A92] uppercase tracking-widest">

              Commande #{orderId.slice(-8).toUpperCase()}

            </p>

          )}

        </div>

        <div className="space-y-3 pt-2">

          <Link href="/" className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider hover:border-[#9C7C5C] transition-colors">

            Retour à l'accueil

          </Link>

        </div>

      </div>

    </div>

  )

}



export default function PaymentFailedPage() {

  return (

    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>Chargement...</p></div>}>

      <PaymentFailedContent />

    </Suspense>

  )

}

