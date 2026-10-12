import { NextRequest, NextResponse } from 'next/server'
import { getKppDebitStatus } from '@/lib/kprimepay'

/**
 * Outil de diagnostic (désactivé en production).
 * GET /api/kprimepay/status?tx=MK-2026-0063-XXXX
 * Renvoie la réponse brute de KPrimePay pour une transaction.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Non disponible' }, { status: 404 })
  }
  const tx = req.nextUrl.searchParams.get('tx')
  if (!tx) return NextResponse.json({ error: 'Paramètre tx manquant' }, { status: 400 })
  try {
    const r = await getKppDebitStatus(tx)
    return NextResponse.json({ interpreted: r.status, raw: r.raw })
  } catch (e) {
    const cause = (e as { cause?: unknown })?.cause
    return NextResponse.json(
      { error: String(e), cause: cause ? String((cause as { code?: string })?.code ?? cause) : null, detail: cause ? String(cause) : null },
      { status: 502 },
    )
  }
}
