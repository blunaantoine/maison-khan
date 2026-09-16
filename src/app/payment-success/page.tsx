'use client'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'

interface OrderData {
  id: string
  orderNumber: string
  total: number
  customerName: string
  customerEmail: string
  customerPhone: string
  createdAt: string
  items: {
    name: string
    size: string
    colorName?: string
    quantity: number
    unitPrice: number
    total: number
  }[]
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA'
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

function generateReceiptHTML(order: OrderData, paidAt?: string, logoDataUrl?: string) {
  const dateStr = paidAt ? formatDate(paidAt) : formatDate(order.createdAt)
  const rows = order.items.map(item => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece6;font-size:13px;color:#2c2c2a;">
        ${item.name}${item.colorName ? ` — ${item.colorName}` : ''}<br/>
        <span style="font-size:11px;color:#9c9a92;">Taille : ${item.size}</span>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece6;text-align:center;font-size:13px;color:#6b6560;">×${item.quantity}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f0ece6;text-align:right;font-size:13px;color:#2c2c2a;white-space:nowrap;">${formatPrice(item.total)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Reçu ${order.orderNumber} - MAISON KHAN</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Outfit',sans-serif; background:#fff; color:#2c2c2a; }
    .page { max-width:620px; margin:0 auto; padding:48px 40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:40px; }
    .brand { font-size:22px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#1a1a1a; }
    .brand-sub { font-size:10px; color:#9c9a92; letter-spacing:0.15em; text-transform:uppercase; margin-top:3px; }
    .receipt-badge { text-align:right; }
    .receipt-label { font-size:10px; color:#9c9a92; letter-spacing:0.15em; text-transform:uppercase; }
    .receipt-num { font-size:14px; font-weight:500; color:#2c2c2a; margin-top:4px; }
    .divider { height:1px; background:#e5e0da; margin:24px 0; }
    .section { margin-bottom:28px; }
    .section-title { font-size:10px; color:#9c9a92; letter-spacing:0.15em; text-transform:uppercase; margin-bottom:12px; }
    .meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
    .meta-item label { font-size:10px; color:#9c9a92; letter-spacing:0.1em; text-transform:uppercase; display:block; margin-bottom:4px; }
    .meta-item span { font-size:13px; color:#2c2c2a; }
    table { width:100%; border-collapse:collapse; }
    .total-row { display:flex; justify-content:space-between; align-items:center; padding:16px 0; }
    .total-label { font-size:13px; color:#6b6560; }
    .total-amount { font-size:20px; font-weight:600; color:#2c2c2a; }
    .footer { margin-top:48px; padding-top:24px; border-top:1px solid #f0ece6; text-align:center; }
    .footer p { font-size:11px; color:#9c9a92; line-height:1.8; }
    .status-badge { display:inline-block; background:#e6f4ec; color:#1a7a4a; font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; padding:4px 12px; border-radius:2px; }
    @media print {
      body { background:#fff; }
      .no-print { display:none !important; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      ${logoDataUrl
        ? `<img src="${logoDataUrl}" alt="Maison Khan" style="height:48px;object-fit:contain;display:block;"/>`
        : `<div class="brand">Maison Khan</div>`
      }
      <div class="brand-sub">Lomé, Togo</div>
    </div>
    <div class="receipt-badge">
      <div class="receipt-label">Reçu de paiement</div>
      <div class="receipt-num">${order.orderNumber}</div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="meta-grid">
      <div class="meta-item">
        <label>Client</label>
        <span>${order.customerName}</span>
      </div>
      <div class="meta-item">
        <label>Téléphone</label>
        <span>${order.customerPhone}</span>
      </div>
      <div class="meta-item">
        <label>Email</label>
        <span>${order.customerEmail}</span>
      </div>
      <div class="meta-item">
        <label>Date de paiement</label>
        <span>${dateStr}</span>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Articles commandés</div>
    <table>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div class="divider"></div>

  <div class="total-row">
    <span class="total-label">Total réglé</span>
    <span class="total-amount">${formatPrice(order.total)}</span>
  </div>

  <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
    <span class="status-badge">Paiement confirmé</span>
    <span style="font-size:11px;color:#9c9a92;">via PayDunya - Mobile Money</span>
  </div>

  <div class="footer">
    <p>Merci pour votre confiance.<br/>
    Pour toute question, contactez-nous à <strong>contact@maison-khan.com</strong><br/>
    MAISON KHAN · Lomé, Togo · maison-khan.com</p>
  </div>
</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`
}

type VerifyState = 'loading' | 'confirmed' | 'pending_payment' | 'failed' | 'error'

const MAX_POLL_ATTEMPTS = 20
const POLL_INTERVAL_MS  = 3000

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const orderId = searchParams.get('orderId') || searchParams.get('order')

  const [state, setState] = useState<VerifyState>(() =>
    !searchParams.get('token') &&
    !searchParams.get('orderId') &&
    !searchParams.get('order')
      ? 'error'
      : 'loading'
  )
  const [order, setOrder] = useState<OrderData | null>(null)
  const [paidAt, setPaidAt] = useState<string | undefined>()
  const [attempt, setAttempt] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const verifyPayment = async (attemptNum: number) => {
    try {
      const params = new URLSearchParams()
      if (token) params.set('token', token)
      if (orderId) params.set('orderId', orderId)

      const res  = await fetch(`/api/paydunya/verify?${params.toString()}`)
      const data = await res.json()

      if (!data.success) {
        setState('error')
        return
      }

      const status: string = data.status ?? 'pending'

      if (status === 'completed') {
        setOrder(data.order)
        setPaidAt(data.paidAt)
        setState('confirmed')
        return
      }

      if (status === 'cancelled' || status === 'failed') {
        setState('failed')
        return
      }

      if (attemptNum < MAX_POLL_ATTEMPTS) {
        setState('pending_payment')
        setAttempt(attemptNum + 1)
        timerRef.current = setTimeout(() => verifyPayment(attemptNum + 1), POLL_INTERVAL_MS)
      } else {
        setState('pending_payment')
      }

    } catch {
      if (attemptNum < MAX_POLL_ATTEMPTS) {
        timerRef.current = setTimeout(() => verifyPayment(attemptNum + 1), POLL_INTERVAL_MS)
      } else {
        setState('error')
      }
    }
  }

  useEffect(() => {
    if (!token && !orderId) return
    verifyPayment(0)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleDownloadReceipt = async () => {
    if (!order) return

    let logoDataUrl: string | undefined

    try {
      const res = await fetch('/logo-original.png')
      const blob = await res.blob()
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string))
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    } catch {
      // dans ce cas, le logo n'est pas chargé, mais le reçu sera généré comme ça sans logp
    }

    const html = generateReceiptHTML(order, paidAt, logoDataUrl)
    const win  = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  if (state === 'loading' || state === 'pending_payment') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4">
        <div className="bg-white p-10 max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-[#9C7C5C]/10 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-[#9C7C5C] animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-medium text-[#2C2C2A]">Vérification du paiement…</h1>
            <p className="text-[#6B6560] text-sm">
              {state === 'pending_payment'
                ? 'Votre paiement est en cours de confirmation. Veuillez patienter ou valider sur votre téléphone.'
                : 'Connexion aux serveurs PayDunya en cours…'}
            </p>
            {state === 'pending_payment' && attempt > 0 && (
              <p className="text-xs text-[#9C9A92]">
                Tentative {attempt} / {MAX_POLL_ATTEMPTS}
              </p>
            )}
          </div>

          <div className="w-full bg-[#EDE8E1] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full bg-[#9C7C5C] rounded-full transition-all duration-1000"
              style={{ width: `${Math.min(100, (attempt / MAX_POLL_ATTEMPTS) * 100)}%` }}
            />
          </div>

          {state === 'pending_payment' && (
            <p className="text-xs text-[#9C9A92]">
              Une notification a été envoyée sur votre téléphone. Acceptez-la pour finaliser le paiement.
            </p>
          )}
        </div>
      </div>
    )
  }

  if (state === 'failed') {
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
            <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement non abouti</h1>
            <p className="text-[#6B6560] text-sm">
              La transaction a été annulée ou refusée. Vérifiez votre solde et réessayez.
            </p>
          </div>
          <Link
            href="/"
            className="block w-full py-3 bg-[#2C2C2A] text-white text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors"
          >
            Réessayer le paiement
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4">
        <div className="bg-white p-10 max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-medium text-[#2C2C2A]">Impossible de vérifier</h1>
            <p className="text-[#6B6560] text-sm">
              Si votre paiement a bien été effectué, votre commande est enregistrée. Contactez-nous avec votre numéro de commande.
            </p>
          </div>
          <Link href="/" className="block w-full py-3 bg-[#2C2C2A] text-white text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F6F3] px-4">
      <div className="bg-white p-10 max-w-md w-full space-y-6">

        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-medium text-[#2C2C2A]">Paiement confirmé</h1>
          <p className="text-[#6B6560] text-sm">
            Votre paiement a été vérifié et validé. Merci pour votre commande.
          </p>
          {order && (
            <p className="text-xs text-[#9C9A92] uppercase tracking-widest mt-1">
              Commande #{order.orderNumber}
            </p>
          )}
        </div>

        {order && (
          <div className="border border-[#E5E0DA] divide-y divide-[#E5E0DA]">
            <div className="px-4 py-3 space-y-2">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-[#2C2C2A]">
                    {item.name}
                    {item.colorName ? ` — ${item.colorName}` : ''}
                    <span className="text-[#9C9A92] ml-1">× {item.quantity} / {item.size}</span>
                  </span>
                  <span className="text-[#2C2C2A] font-medium whitespace-nowrap ml-4">
                    {formatPrice(item.total)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 flex justify-between">
              <span className="text-sm text-[#6B6560]">Total réglé</span>
              <span className="font-semibold text-[#2C2C2A]">{formatPrice(order.total)}</span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-green-50 border border-green-200 px-4 py-3">
          <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <p className="text-xs text-green-800">
            Paiement vérifié
            {paidAt && <> · {formatDate(paidAt)}</>}
          </p>
        </div>

        <div className="space-y-3 pt-2">
          {order && (
            <button
              onClick={handleDownloadReceipt}
              className="flex items-center justify-center gap-2 w-full py-3 bg-[#2C2C2A] text-white text-sm uppercase tracking-wider hover:bg-[#9C7C5C] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Télécharger le reçu
            </button>
          )}
          <Link
            href="/"
            className="block w-full py-3 border border-[#E5E0DA] text-[#6B6560] text-sm uppercase tracking-wider text-center hover:border-[#9C7C5C] hover:text-[#9C7C5C] transition-colors"
          >
            Retour à la boutique
          </Link>
        </div>

      </div>
    </div>
  )
}