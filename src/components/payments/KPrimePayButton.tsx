'use client'

import { useState, type RefObject } from 'react'
import { safeNavigate } from '@/lib/safe-redirect'

/**
 * Bouton de paiement KPrimePay - composant autonome.
 * Reprend exactement le flux du bouton PayDunya :
 *   1. création de la commande via /api/orders (paymentMethod: 'kprimepay')
 *   2. envoi de la demande de paiement sur le téléphone via /api/kprimepay/push (USSD push)
 *   3. page /kprimepay/retour qui suit le statut en direct et redirige vers
 *      /payment-success ou /payment-failed dès que l'opérateur répond
 */

type Gateway = 'MIXX-YAS-TG' | 'MOOV-MONEY-TG'

const GATEWAYS: { id: Gateway; label: string }[] = [
  { id: 'MIXX-YAS-TG', label: 'Mixx by Yas' },
  { id: 'MOOV-MONEY-TG', label: 'Moov Money' },
]

function toLocal(input: string | null | undefined): string {
  let d = (input || '').replace(/\D/g, '')
  if (d.startsWith('00228')) d = d.slice(5)
  else if (d.startsWith('228') && d.length === 11) d = d.slice(3)
  return d.slice(0, 8)
}

/** Suggestion d'opérateur d'après le préfixe (le client peut toujours changer) */
function guessGateway(local: string): Gateway | null {
  const p = local.slice(0, 2)
  // Doc KPrimePay : préfixes 70 à 73 et 90 à 93 = Mixx by Yas, les autres = Moov Money
  if (!/^\d{2}/.test(p)) return null
  return ['70', '71', '72', '73', '90', '91', '92', '93'].includes(p) ? 'MIXX-YAS-TG' : 'MOOV-MONEY-TG'
}

interface KppOrderItem {
  id?: string
  name: string
  size: string
  colorName?: string
  price: number
  qty: number
  image?: string
}

interface KppUser {
  id?: string
  email?: string | null
  phone?: string | null
  firstName?: string | null
  lastName?: string | null
}

interface KppFormData {
  email: string
  phone: string
  firstName: string
  lastName: string
  city: string
  address: string
  latitude: number | null
  longitude: number | null
}

interface KPrimePayButtonProps {
  orderItems: KppOrderItem[]
  user?: KppUser | null
  checkoutFormRef?: RefObject<{ getFormData: () => KppFormData } | null>
}

export default function KPrimePayButton({ orderItems, user, checkoutFormRef }: KPrimePayButtonProps) {
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [gateway, setGateway] = useState<Gateway | null>(null)
  const [momoPhone, setMomoPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Commande déjà créée lors d'une tentative précédente (évite les doublons si on réessaie)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)

  const total = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0)

  const openPanel = () => {
    const formData = checkoutFormRef?.current?.getFormData()
    const local = toLocal(formData?.phone || user?.phone)
    setMomoPhone(local)
    setGateway((g) => g ?? guessGateway(local))
    setError(null)
    setOpen(true)
  }

  const handlePay = async () => {
    if (loading) return
    setError(null)

    if (!gateway) {
      setError('Choisissez votre opérateur Mobile Money')
      return
    }
    if (!/^\d{8}$/.test(momoPhone)) {
      setError('Numéro Mobile Money invalide (8 chiffres)')
      return
    }

    const formData = checkoutFormRef?.current?.getFormData()
    const items = orderItems

    if (items.length === 0) {
      setError('Votre panier est vide')
      return
    }
    if (items.some((item) => !item.id)) {
      setError("Erreur: certains articles n'ont pas d'identifiant valide.")
      return
    }

    const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0)
    const customerEmail = formData?.email?.trim() || user?.email?.trim()
    if (!customerEmail) {
      setError("Email requis : complétez l'étape 1")
      return
    }
    const phone = formData?.phone || user?.phone || `+228 ${momoPhone}`

    setLoading(true)
    try {
      let orderId = createdOrderId
      if (!orderId) {
        // 1- création de la commande
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-user-id': user?.id || '' },
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.id,
              productName: item.name,
              productImage: item.image || null,
              colorName: item.colorName || null,
              size: item.size,
              quantity: item.qty,
              unitPrice: item.price,
            })),
            customerInfo: {
              email: customerEmail,
              phone,
              firstName: formData?.firstName || user?.firstName || null,
              lastName: formData?.lastName || user?.lastName || null,
            },
            shippingAddress: {
              city: formData?.city || null,
              address: formData?.address || null,
              country: 'Togo',
              phone,
              latitude: formData?.latitude ? Number(formData.latitude) : null,
              longitude: formData?.longitude ? Number(formData.longitude) : null,
            },
            subtotal,
            shippingCost: 0,
            total: subtotal,
            paymentMethod: 'kprimepay',
          }),
        })
        const orderData = await orderRes.json()
        if (!orderRes.ok || !orderData.order?.id) {
          setError(orderData.error || 'Erreur création commande')
          setLoading(false)
          return
        }

        orderId = orderData.order.id as string
        setCreatedOrderId(orderId)
      }

      // 2- envoi de la demande de paiement sur le téléphone
      const pushRes = await fetch('/api/kprimepay/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, gateway, phone: momoPhone }),
      })
      const pushData = await pushRes.json()
      if (!pushRes.ok || !pushData.success) {
        setError(pushData.error || "Impossible d'envoyer la demande de paiement")
        setLoading(false)
        return
      }

      // 3- suivi du paiement en direct (loading reste actif pendant la navigation)
      safeNavigate(`/kprimepay/retour?flow=push&orderId=${encodeURIComponent(orderId)}`)
    } catch (error) {
      console.error('KPrimePay error:', error)
      setError("Erreur lors de l'envoi du paiement : " + (error instanceof Error ? error.message : 'Erreur inconnue'))
      setLoading(false)
    }
  }

  const fmt = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' XOF'

  if (!open) {
    return (
      <button
        type="button"
        id="kprimepay-btn"
        onClick={openPanel}
        className="w-full bg-[#9C7C5C] border-2 border-[#9C7C5C] text-white py-4 px-6 rounded-lg transition-all duration-300 group hover:bg-[#8B6B4B]"
      >
        <div className="flex items-center justify-between gap-4">
          <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
            />
          </svg>
          <span className="text-sm font-medium uppercase tracking-wider">Payer par Mobile Money (KPrimePay)</span>
          <svg
            className="w-5 h-5 group-hover:translate-x-1 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    )
  }

  return (
    <div className="border-2 border-[#9C7C5C] rounded-lg p-4 space-y-4 bg-white">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium uppercase tracking-wider text-[#0A0A0A]">Paiement Mobile Money</p>
        <button
          type="button"
          onClick={() => {
            if (!loading) setOpen(false)
          }}
          className="text-xs text-[#6B6560] hover:text-[#0A0A0A] uppercase tracking-wider"
        >
          Annuler
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {GATEWAYS.map((g) => (
          <button
            key={g.id}
            type="button"
            disabled={loading}
            onClick={() => setGateway(g.id)}
            className={`py-3 px-2 text-sm border transition-colors ${
              gateway === g.id
                ? 'bg-[#0A0A0A] text-[#F8F6F3] border-[#0A0A0A]'
                : 'border-[#E5E0DA] text-[#0A0A0A] hover:border-[#9C7C5C]'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex">
        <span className="flex items-center px-3 bg-[#EDE8E1] border border-r-0 border-[#E5E0DA] text-sm">+228</span>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="90 12 34 56"
          value={momoPhone}
          disabled={loading}
          onChange={(e) => {
            const v = toLocal(e.target.value)
            setMomoPhone(v)
            const guess = guessGateway(v)
            if (guess && v.length >= 2) setGateway(guess)
          }}
          className="flex-1 min-w-0 p-3 border border-[#E5E0DA] focus:outline-none focus:border-[#9C7C5C]"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={handlePay}
        disabled={loading}
        className="w-full bg-[#9C7C5C] text-white py-4 uppercase tracking-wider text-sm hover:bg-[#8B6B4B] transition-colors disabled:opacity-60"
      >
        {loading ? 'Envoi de la demande...' : `Payer ${fmt(total)}`}
      </button>

      <p className="text-xs text-[#6B6560] text-center">
        Vous allez recevoir une demande de paiement sur ce numéro. Validez-la avec votre code secret.
      </p>
    </div>
  )
}
