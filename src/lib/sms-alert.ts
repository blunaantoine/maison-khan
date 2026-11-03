import { db } from '@/lib/db'
import { isSmsConfigured, normalizePhone, sendSms } from '@/lib/africastalking'

/**
 * MAISON KHAN — Alerte SMS « Paiement confirmé » au propriétaire.
 *
 * Envoyée UNE SEULE FOIS par commande, uniquement quand le client a payé en
 * ligne (Mobile Money PayDunya / KPrimePay ou carte bancaire KPrimePay).
 * Une commande validée à la main sans aucun paiement en ligne (espèces…)
 * ne déclenche pas de SMS.
 *
 * Anti-doublon atomique : ligne SmsLog unique (orderId, type). Si plusieurs
 * chemins confirment le même paiement en même temps (IPN + page de retour +
 * cron), un seul SMS part. Un envoi échoué peut être retenté par le chemin
 * de confirmation suivant.
 *
 * Ne lève jamais d'exception : un SMS ne doit jamais bloquer un paiement.
 */

const SMS_TYPE = 'admin_payment_alert'
/** Longueur max d'un SMS GSM-7 en un seul segment. */
const SMS_MAX_LENGTH = 160

/** Méthodes de paiement en ligne (valeurs de Order.paymentMethod / Payment.paymentMethod). */
const ONLINE_METHODS = new Set(['paydunya', 'kprimepay', 'moov_money', 't_money', 'fedapay', 'paygate'])
const PAID_PAYMENT_STATUSES = new Set(['completed', 'success', 'paid', 'succeeded'])

interface PaymentLike {
  paymentMethod?: string | null
  operator?: string | null
  status?: string | null
  updatedAt?: Date | string | null
}

interface OrderLike {
  id: string
  orderNumber: string
  customerFirstName?: string | null
  customerLastName?: string | null
  customerPhone?: string | null
  shippingCity?: string | null
  total: number
  paymentMethod?: string | null
  items?: { quantity: number }[]
  payments?: PaymentLike[]
}

function adminPhones(): string[] {
  const raw = process.env.ADMIN_ALERT_PHONE || ''
  const phones = raw
    .split(',')
    .map((p) => normalizePhone(p))
    .filter((p): p is string => Boolean(p))
  return [...new Set(phones)]
}

/** Paiement retenu pour le libellé : le dernier réussi, sinon le dernier en ligne. */
function pickPayment(order: OrderLike): PaymentLike | undefined {
  const online = (order.payments ?? []).filter((p) => p.paymentMethod && ONLINE_METHODS.has(p.paymentMethod))
  const byDate = (a: PaymentLike, b: PaymentLike) =>
    new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()
  const paid = online.filter((p) => p.status && PAID_PAYMENT_STATUSES.has(p.status)).sort(byDate)
  return paid[0] ?? online.sort(byDate)[0]
}

function isOnlinePayment(order: OrderLike): boolean {
  if (order.paymentMethod && ONLINE_METHODS.has(order.paymentMethod)) return true
  return Boolean(pickPayment(order))
}

/** Libellé lisible du moyen de paiement (ASCII pour rester en SMS 1 segment). */
function methodLabel(order: OrderLike): string {
  const p = pickPayment(order)
  const method = p?.paymentMethod || order.paymentMethod || ''
  const operator = (p?.operator || '').trim()
  switch (method) {
    case 'kprimepay':
      if (operator.toUpperCase() === 'CARD') return 'Carte bancaire'
      if (operator && operator.toLowerCase() !== 'kprimepay') return `Mobile Money (${operator})`
      return 'KPrimePay'
    case 'paydunya':
      return 'Mobile Money (PayDunya)'
    case 'moov_money':
      return 'Moov Money'
    case 't_money':
      return 'T-Money'
    case 'fedapay':
      return 'FedaPay'
    default:
      return method || 'En ligne'
  }
}

/** Retire accents et caractères hors GSM-7 (évite les SMS en Unicode, plus chers). */
function toGsmSafe(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
}

function formatAmount(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function buildMessage(order: OrderLike): string {
  const name = [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ').trim()
  const itemsCount = (order.items ?? []).reduce((sum, i) => sum + (i.quantity || 0), 0)
  const lines = [
    'MAISON KHAN - Paiement recu',
    `Cmd ${order.orderNumber}`,
    `${formatAmount(order.total)} XOF - ${methodLabel(order)}`,
    `Client: ${name || 'N/A'}${order.customerPhone ? ` ${order.customerPhone}` : ''}`,
  ]
  if (itemsCount > 0 || order.shippingCity) {
    lines.push(
      [itemsCount > 0 ? `${itemsCount} article${itemsCount > 1 ? 's' : ''}` : '', order.shippingCity || '']
        .filter(Boolean)
        .join(' - ')
    )
  }
  // 160 caractères max = 1 seul SMS facturé : on retire la dernière ligne
  // (articles / ville) si besoin, puis on tronque.
  let text = toGsmSafe(lines.join('\n'))
  if (text.length > SMS_MAX_LENGTH && lines.length > 4) text = toGsmSafe(lines.slice(0, 4).join('\n'))
  if (text.length > SMS_MAX_LENGTH && name) {
    // Raccourcit le nom du client (garde son numéro de téléphone intact)
    const overflow = text.length - SMS_MAX_LENGTH
    const shortName = toGsmSafe(name).slice(0, Math.max(3, toGsmSafe(name).length - overflow - 1)) + '.'
    text = text.replace(`Client: ${toGsmSafe(name)}`, `Client: ${shortName}`)
  }
  return text.length > SMS_MAX_LENGTH ? text.slice(0, SMS_MAX_LENGTH) : text
}

/** Anti-doublon de secours (mémoire du processus) si la table SmsLog est indisponible. */
const memoryClaims = new Set<string>()

/**
 * Réserve l'envoi pour cette commande (atomique).
 *  'claimed'   → ce processus doit envoyer le SMS
 *  'duplicate' → déjà envoyé (ou en cours d'envoi par un autre chemin)
 *  'no-table'  → table SmsLog absente (base non migrée) : anti-doublon en mémoire
 */
async function claimSend(orderId: string): Promise<'claimed' | 'duplicate' | 'no-table'> {
  let existing: { id: string } | null
  try {
    existing = await db.smsLog.findUnique({
      where: { orderId_type: { orderId, type: SMS_TYPE } },
      select: { id: true },
    })
  } catch (e) {
    console.error(
      '[sms:admin-alert] Table SmsLog inaccessible — lance « npx prisma db push ». ' +
        'Le SMS part quand même (anti-doublon en mémoire).',
      e instanceof Error ? e.message.split('\n').pop() : e
    )
    if (memoryClaims.has(orderId)) return 'duplicate'
    memoryClaims.add(orderId)
    return 'no-table'
  }

  try {
    if (!existing) {
      try {
        await db.smsLog.create({ data: { orderId, type: SMS_TYPE, status: 'pending' } })
        return 'claimed'
      } catch {
        return 'duplicate' // créée au même instant par un autre chemin de confirmation
      }
    }
    // Ligne déjà existante : on ne retente que si l'envoi précédent a échoué
    // ou s'il a été interrompu.
    const { count } = await db.smsLog.updateMany({
      where: {
        orderId,
        type: SMS_TYPE,
        OR: [
          { status: { in: ['failed', 'skipped'] } },
          // Envoi resté « pending » (processus interrompu) depuis plus de 5 min
          { status: 'pending', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
        ],
      },
      data: { status: 'pending', error: null },
    })
    return count > 0 ? 'claimed' : 'duplicate'
  } catch {
    return 'duplicate'
  }
}

async function finish(orderId: string, data: { status: string; to?: string; message?: string; error?: string | null; providerResponse?: string }) {
  try {
    await db.smsLog.update({ where: { orderId_type: { orderId, type: SMS_TYPE } }, data })
  } catch (e) {
    console.error('[sms:admin-alert] Journalisation impossible :', e)
  }
}

/** Alerte SMS « Paiement confirmé » au(x) numéro(s) ADMIN_ALERT_PHONE. */
export async function sendAdminPaymentSms(input: OrderLike): Promise<void> {
  try {
    // Recharge la commande avec ses paiements (les appelants ne les incluent pas toujours).
    let order: OrderLike = input
    try {
      const fresh = await db.order.findUnique({
        where: { id: input.id },
        include: { items: { select: { quantity: true } }, payments: true },
      })
      if (fresh) order = fresh
    } catch { /* on garde l'objet reçu */ }

    if (!isOnlinePayment(order)) {
      console.log(`[sms:admin-alert] ${order.orderNumber} : paiement non effectué en ligne → pas de SMS`)
      return
    }

    const phones = adminPhones()
    if (!isSmsConfigured() || phones.length === 0) {
      const reason = phones.length === 0
        ? 'ADMIN_ALERT_PHONE absente ou invalide'
        : 'AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY absentes'
      console.log(`[sms:admin-alert] ${order.orderNumber} : SMS non envoyé (${reason}) — vérifie le .env puis redémarre`)
      return
    }

    const claim = await claimSend(order.id)
    if (claim === 'duplicate') {
      console.log(`[sms:admin-alert] ${order.orderNumber} : SMS déjà envoyé → pas de doublon`)
      return
    }

    const message = buildMessage(order)
    console.log(`[sms:admin-alert] ${order.orderNumber} : envoi SMS (${message.length} car.) → ${phones.join(', ')}`)

    const result = await sendSms({ to: phones, message })
    if (claim === 'claimed') await finish(order.id, {
      status: result.success ? 'sent' : 'failed',
      to: phones.join(','),
      message,
      error: result.success ? null : result.message,
      providerResponse: JSON.stringify(result).slice(0, 2000),
    })

    // Sans table, un échec doit rester retentable par le chemin de confirmation suivant
    if (claim === 'no-table' && !result.success) memoryClaims.delete(order.id)

    if (result.success) {
      console.log(`[sms:admin-alert] SMS envoyé pour ${order.orderNumber} → ${phones.join(', ')}`)
    } else {
      console.error(`[sms:admin-alert] Échec SMS pour ${order.orderNumber} : ${result.message}`, result.recipients)
    }
  } catch (e) {
    console.error('[sms:admin-alert] Erreur inattendue :', e)
  }
}
