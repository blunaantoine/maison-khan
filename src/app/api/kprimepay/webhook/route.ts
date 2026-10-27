import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { syncKppPayment } from '@/lib/kprimepay'

/**
 * POST /api/kprimepay/webhook
 *
 * URL à configurer dans le dashboard KPrimePay (callback URL) :
 *   https://<ton-domaine>/api/kprimepay/webhook?key=<KPRIMEPAY_WEBHOOK_SECRET>
 *
 * Le contenu du webhook n'est jamais cru sur parole : on en extrait uniquement le
 * transaction_id, puis on revérifie le statut auprès de l'API KPrimePay.
 */

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.KPRIMEPAY_WEBHOOK_SECRET
  if (!expected) {
    // Production : secret obligatoire (fail-closed). En développement seulement,
    // on accepte sans secret — le statut est de toute façon revérifié via l'API.
    return process.env.NODE_ENV !== 'production'
  }
  // En-tête préféré (n'apparaît pas dans les logs d'accès) ; ?key= toléré car
  // le tableau de bord KPrimePay ne permet de configurer qu'une URL.
  const given = req.headers.get('x-webhook-secret') || req.nextUrl.searchParams.get('key') || ''
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ received: false }, { status: 403 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ received: false, error: 'JSON invalide' }, { status: 400 })
  }

  const event: string = body?.event || req.headers.get('x-kpp-event') || ''
  const eventId: string = body?.event_id || req.headers.get('x-kpp-event-id') || ''
  const transactionId: string | undefined = body?.data?.transaction_id

  // Trace systématique : permet de voir dans le terminal ce que KPrimePay envoie réellement
  console.log(`[KPrimePay webhook] ${event} ${eventId} tx=${transactionId ?? '?'}`, JSON.stringify(body))

  // On ne traite que les encaissements ; les transferts (payouts) ne concernent pas la boutique.
  if (!event.startsWith('collection.')) {
    return NextResponse.json({ received: true, ignored: event })
  }
  if (!transactionId) {
    return NextResponse.json({ received: true, error: 'transaction_id manquant' })
  }

  try {
    // collection.failed : KPrimePay nous dit explicitement que le paiement a échoué, alors que
    // debit-status peut encore afficher "pending". On conclut tout de suite (le statut est quand
    // même revérifié : si KPrimePay indique un succès, la commande est marquée payée).
    // Réservé aux appels authentifiés par le secret, pour qu'un tiers ne puisse pas forcer un échec.
    const trustFailure = event === 'collection.failed' && Boolean(process.env.KPRIMEPAY_WEBHOOK_SECRET)
    const result = await syncKppPayment(transactionId, `webhook:${event}:${eventId}`, {
      cancelIfPending: trustFailure,
    })
    return NextResponse.json({ received: true, result })
  } catch (e) {
    // 500 => KPrimePay pourra renvoyer la notification plus tard
    console.error('[kprimepay/webhook] Erreur de synchronisation:', e)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ endpoint: 'KPrimePay webhook', status: 'active' })
}
