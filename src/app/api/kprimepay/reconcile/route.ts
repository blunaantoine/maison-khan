import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { KPP_PAYMENT_METHOD, syncKppPayment } from '@/lib/kprimepay'

/**
 * GET /api/kprimepay/reconcile  (header x-cron-secret: <CRON_SECRET>)
 *
 * Rattrapage en arrière-plan, à appeler toutes les 10 minutes (même mécanisme que
 * /api/cron/check-payments).
 *
 * KPrimePay ne signale jamais les refus de l'opérateur : après 2 minutes (USSD
 * push) ou 60 minutes (checkout carte), le site considère le paiement comme
 * échoué. Cette route revérifie pendant 7 jours (RECONCILE_WINDOW_DAYS) toutes
 * les tentatives non confirmées, pour qu'un paiement validé tardivement ne soit
 * jamais perdu : s'il passe en "success", la commande est marquée payée et le
 * stock décrémenté. Elle clôt aussi les tentatives restées "pending"
 * (client parti avant la fin du délai).
 */

const CRON_SECRET = process.env.CRON_SECRET || ''
const WINDOW_MS =
  Math.max(1, Number(process.env.RECONCILE_WINDOW_DAYS || 7)) * 24 * 60 * 60 * 1000
const MAX_PER_RUN = 50
const DELAY_BETWEEN_CALLS_MS = 600 // reste sous la limite KPrimePay (120 requêtes/min)

// Échecs "supposés" (pas de confirmation d'échec par KPrimePay) : à revérifier
const ASSUMED_FAILURE_PREFIXES = ['Délai de confirmation dépassé', 'Annulé par le client', 'Paiement refusé ou non finalisé']

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(request: NextRequest) {
  if (CRON_SECRET && request.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const startTime = Date.now()
  let checked = 0
  let recovered = 0
  let closed = 0
  let stillPending = 0
  let errors = 0

  try {
    const since = new Date(Date.now() - WINDOW_MS)
    const payments = await db.payment.findMany({
      where: {
        paymentMethod: KPP_PAYMENT_METHOD,
        createdAt: { gte: since },
        transactionId: { not: null },
        OR: [
          { status: 'pending' },
          {
            status: 'failed',
            OR: ASSUMED_FAILURE_PREFIXES.map((p) => ({ errorMessage: { startsWith: p } })),
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_PER_RUN,
    })

    for (const payment of payments) {
      checked++
      try {
        const before = payment.status
        const result = await syncKppPayment(payment.transactionId as string, 'reconcile')
        if (result === 'completed') recovered++
        else if (result === 'failed' && before === 'pending') closed++
        else if (result === 'pending') stillPending++
      } catch (e) {
        errors++
        console.error(`[KPrimePay reconcile] Erreur pour ${payment.transactionId}:`, e)
      }
      await sleep(DELAY_BETWEEN_CALLS_MS)
    }

    const duration = Date.now() - startTime
    await db.cronLog.create({
      data: {
        taskName: 'kprimepay-reconcile',
        status: errors > 0 ? 'partial' : 'success',
        checked,
        success: recovered,
        failed: closed,
        stillPending,
        errors,
        duration,
      },
    })

    if (recovered > 0) console.log(`[KPrimePay reconcile] ${recovered} paiement(s) tardif(s) récupéré(s)`)
    return NextResponse.json({ success: true, checked, recovered, closed, stillPending, errors, duration })
  } catch (error) {
    console.error('[KPrimePay reconcile] Erreur fatale:', error)
    await db.cronLog
      .create({
        data: {
          taskName: 'kprimepay-reconcile',
          status: 'error',
          checked,
          success: recovered,
          failed: closed,
          stillPending,
          errors: errors + 1,
          duration: Date.now() - startTime,
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      })
      .catch(() => {})
    return NextResponse.json({ error: 'Erreur reconcile' }, { status: 500 })
  }
}
