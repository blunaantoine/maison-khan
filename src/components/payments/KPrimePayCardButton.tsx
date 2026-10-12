'use client'

import { useState, type RefObject } from 'react'

/**
 * Bouton « Payer par carte bancaire » - KPrimePay, carte uniquement.
 * Le Mobile Money reste géré par PayDunya.
 *
 *   1. création de la commande via /api/orders (paymentMethod: 'kprimepay')
 *   2. création du checkout KPrimePay limité à la carte via /api/kprimepay/init (method: 'card')
 *   3. redirection vers la page de paiement KPrimePay, puis retour sur /kprimepay/retour
 *      qui vérifie le statut et redirige vers /payment-success ou /payment-failed
 */

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

interface KPrimePayCardButtonProps {
  orderItems: KppOrderItem[]
  user?: KppUser | null
  checkoutFormRef?: RefObject<{ getFormData: () => KppFormData } | null>
}

export default function KPrimePayCardButton({ orderItems, user, checkoutFormRef }: KPrimePayCardButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Commande déjà créée lors d'une tentative précédente (évite les doublons si on réessaie)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)

  const handlePay = async () => {
    if (loading) return
    setError(null)

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
    const phone = formData?.phone || user?.phone
    if (!phone) {
      setError("Numéro de téléphone requis : complétez l'étape 1")
      return
    }

    setLoading(true)
    try {
      let orderId = createdOrderId
      if (!orderId) {
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

      const initRes = await fetch('/api/kprimepay/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, method: 'card' }),
      })
      const initData = await initRes.json()
      if (!initRes.ok || !initData.success || !initData.url) {
        setError(initData.error || "Impossible d'initialiser le paiement par carte")
        setLoading(false)
        return
      }

      // Redirection vers la page de paiement KPrimePay (loading reste actif pendant la navigation)
      window.location.href = initData.url
    } catch (err) {
      console.error('KPrimePay card error:', err)
      setError("Erreur lors de l'initialisation du paiement : " + (err instanceof Error ? err.message : 'Erreur inconnue'))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        id="kprimepay-card-btn"
        onClick={handlePay}
        disabled={loading}
        className="w-full bg-[#0A0A0A] border-2 border-[#0A0A0A] text-white py-4 px-6 rounded-lg transition-all duration-300 group hover:bg-[#2C2C2A] disabled:opacity-60"
      >
        {loading ? (
          <span className="text-sm font-medium uppercase tracking-wider">Redirection vers le paiement sécurisé...</span>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <svg className="w-5 h-5 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="2.5" y="5" width="19" height="14" rx="2" strokeWidth={1.5} />
              <path strokeLinecap="round" strokeWidth={1.5} d="M2.5 10h19M6 15h4" />
            </svg>
            <span className="text-sm font-medium uppercase tracking-wider">Payer par carte bancaire</span>
            <span className="text-[10px] tracking-wider opacity-70">VISA · MASTERCARD</span>
          </div>
        )}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
