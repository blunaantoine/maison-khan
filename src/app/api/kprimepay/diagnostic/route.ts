import { NextRequest, NextResponse } from 'next/server'
import { safeEqual } from '@/lib/secure-compare'
import { db } from '@/lib/db'
import { KPP_PAYMENT_METHOD, getKppDebitStatus } from '@/lib/kprimepay'

/**
 * GET /api/kprimepay/diagnostic[?days=7][&live=1][&secret=CRON_SECRET]
 *
 * Outil de diagnostic (protégé par CRON_SECRET : header x-cron-secret,
 * Authorization Bearer, ou ?secret= pour un usage navigateur).
 *
 * Liste toutes les tentatives KPrimePay non conclus des `days` derniers jours
 * (pending, échecs "supposés", incohérences de montant) avec :
 *  - l'état de la base (paiement + commande) ;
 *  - si live=1 (défaut) : la réponse BRUTE de l'API KPrimePay debit-status
 *    pour les 15 plus anciennes — la vérité terrain, pour comprendre pourquoi
 *    une commande reste "en attente".
 *
 * Utilisation navigateur : https://shop.maison-khan.com/api/kprimepay/diagnostic?secret=XXX
 */

const CRON_SECRET = process.env.CRON_SECRET || ''
const DELAY_BETWEEN_CALLS_MS = 600 // limite KPrimePay : 120 requêtes/min

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Échecs "supposés" (même liste que reconcile) : inclus dans le diagnostic
const ASSUMED_FAILURE_PREFIXES = [
  'Délai de confirmation dépassé',
  'Annulé par le client',
  'Paiement refusé ou non finalisé',
  'Transaction introuvable',
]

export async function GET(request: NextRequest) {
  const secretParam = request.nextUrl.searchParams.get('secret')
  const authorized =
    safeEqual(request.headers.get('x-cron-secret'), CRON_SECRET) ||
    safeEqual(request.headers.get('authorization'), `Bearer ${CRON_SECRET}`) ||
    safeEqual(secretParam, CRON_SECRET)
  if (!authorized) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const days = Math.min(30, Math.max(1, Number(request.nextUrl.searchParams.get('days') || 7)))
  const withLive = request.nextUrl.searchParams.get('live') !== '0'
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const payments = await db.payment.findMany({
      where: {
        paymentMethod: KPP_PAYMENT_METHOD,
        createdAt: { gte: since },
        transactionId: { not: null },
        OR: [
          { status: 'pending' },
          { status: 'amount_mismatch' },
          {
            status: 'failed',
            OR: ASSUMED_FAILURE_PREFIXES.map((p) => ({ errorMessage: { startsWith: p } })),
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        order: {
          select: {
            orderNumber: true,
            paymentStatus: true,
            status: true,
            total: true,
            customerPhone: true,
            createdAt: true,
          },
        },
      },
    })

    const paymentsList = payments.map((p) => ({
      transactionId: p.transactionId,
      dbStatus: p.status,
      errorMessage: p.errorMessage,
      amount: p.amount,
      isUssdPush: Boolean(p.phoneNumber),
      paymentCreatedAt: p.createdAt,
      order: p.order,
    }))

    // Vérité terrain : réponse brute de KPrimePay pour les 15 plus anciennes
    const live: unknown[] = []
    if (withLive) {
      for (const p of payments.slice(0, 15)) {
        try {
          const st = await getKppDebitStatus(p.transactionId as string)
          live.push({
            transactionId: p.transactionId,
            remoteStatus: st.status,
            remoteAmount: st.amount,
            kppReference: st.kppReference,
            paymentDate: st.paymentDate,
            raw: st.raw,
          })
        } catch (e) {
          live.push({ transactionId: p.transactionId, error: String(e) })
        }
        await sleep(DELAY_BETWEEN_CALLS_MS)
      }
    }

    return NextResponse.json({
      success: true,
      days,
      count: paymentsList.length,
      note: withLive
        ? 'Champ "live" = réponse brute de l\'API KPrimePay (15 plus anciennes).'
        : 'live=0 : état de la base uniquement.',
      payments: paymentsList,
      live,
    })
  } catch (error) {
    console.error('[kprimepay/diagnostic] Erreur:', error)
    return NextResponse.json({ error: 'Erreur diagnostic' }, { status: 500 })
  }
}
