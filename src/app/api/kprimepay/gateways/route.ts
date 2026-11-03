import { NextResponse } from 'next/server'

/**
 * Outil de diagnostic (désactivé en production).
 * GET /api/kprimepay/gateways
 * Liste les moyens de paiement actifs sur le compte KPrimePay (noms exacts, frais).
 */
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Non disponible' }, { status: 404 })
  }
  const key = process.env.KPRIMEPAY_SECRET_KEY
  if (!key) return NextResponse.json({ error: 'KPRIMEPAY_SECRET_KEY manquante' }, { status: 500 })

  try {
    const res = await fetch('https://api.kprimepay.com/v2/gateways', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    const json = await res.json().catch(() => null)
    return NextResponse.json({ httpStatus: res.status, response: json })
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause
    return NextResponse.json({ error: String(e), detail: cause ? String(cause) : null }, { status: 502 })
  }
}
