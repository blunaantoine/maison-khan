/**
 * Intégration KPrimePay (API v2) - MAISON KHAN
 *
 * Module autonome : il n'importe que `db` et ne touche à aucun code PayDunya/PayGate.
 * Doc : https://developers.kprimepay.com/index?v=v2
 *
 * Principe de sécurité : les webhooks KPrimePay ne sont pas signés de façon documentée.
 * On ne fait donc JAMAIS confiance au contenu d'un webhook ou d'une URL de retour :
 * chaque changement de statut est revérifié auprès de l'API (/v2/transactions/debit-status).
 */
import { db } from '@/lib/db'

const KPP_BASE_URL = 'https://api.kprimepay.com/v2'

export const KPP_PAYMENT_METHOD = 'kprimepay'

export type KppSyncResult = 'completed' | 'failed' | 'pending' | 'not_found' | 'amount_mismatch'

function getSecretKey(): string {
  const key = process.env.KPRIMEPAY_SECRET_KEY
  if (!key) throw new Error('KPRIMEPAY_SECRET_KEY manquante dans .env')
  return key
}

/** 1 = test, 2 = live (valeur attendue par KPrimePay) */
export function getKppMode(): 1 | 2 {
  return process.env.KPRIMEPAY_MODE === 'live' ? 2 : 1
}

/** Référence unique par tentative de paiement (lettres, chiffres, tirets, underscores) */
export function generateKppTransactionId(orderNumber: string): string {
  const safe = orderNumber.replace(/[^A-Za-z0-9_-]/g, '')
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return `${safe}-${suffix}`.toUpperCase()
}

async function kppFetch(path: string, body: unknown, idempotencyKey?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getSecretKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey

  const res = await fetch(`${KPP_BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    // Jamais bloquer une page de retour client plus de 10 s sur l'API KPrimePay.
    signal: AbortSignal.timeout(10000),
  })

  let json: any = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { ok: res.ok, httpStatus: res.status, json }
}

// ---------------------------------------------------------------------------
// Création du checkout hébergé
// ---------------------------------------------------------------------------

export interface KppCheckoutInput {
  transactionId: string
  amount: number
  description: string
  returnUrl: string
  customer?: { full_name?: string; email?: string; phone_number?: string }
  meta?: Record<string, string>
  /** Restreint les moyens affichés sur la page de paiement (ex. ['CARD']) */
  paymentMethods?: string[]
}

/**
 * Valeur envoyée dans payment_methods pour n'afficher que la carte bancaire.
 * D'après GET /v2/gateways : name "VISA/MASTERCARD/AMEX", checkout_method "CARD".
 * Modifiable sans toucher au code via KPRIMEPAY_CARD_METHOD si KPrimePay attend le "name".
 */
export const KPP_CARD_METHOD = process.env.KPRIMEPAY_CARD_METHOD || 'CARD'

export interface KppCheckoutResult {
  checkoutUrl: string
  kppReference: string | null
  expiresAt: string | null
  raw: unknown
}

export async function createKppCheckout(input: KppCheckoutInput): Promise<KppCheckoutResult> {
  const payload = {
    transaction_id: input.transactionId,
    amount: input.amount,
    currency: 'XOF',
    mode: getKppMode(),
    with_fees: process.env.KPRIMEPAY_WITH_FEES === '1' ? 1 : 0,
    description: input.description.slice(0, 500),
    return_url: input.returnUrl,
    locale: 'fr',
    custom_meta_data: input.meta ?? {},
    ...(input.customer ? { customer: input.customer } : {}),
    ...(input.paymentMethods?.length ? { payment_methods: input.paymentMethods } : {}),
  }

  const { ok, httpStatus, json } = await kppFetch('/checkout', payload, input.transactionId)

  const data = json?.data
  if (!ok || json?.status !== true || !data?.checkout_url) {
    const msg = json?.message || `Erreur KPrimePay (HTTP ${httpStatus})`
    console.error('[KPrimePay] Création checkout échouée:', httpStatus, JSON.stringify(json))
    throw new Error(msg)
  }

  return {
    checkoutUrl: data.checkout_url,
    kppReference: data.kpp_tx_reference ?? null,
    expiresAt: data.expires_at ?? null,
    raw: json,
  }
}

// ---------------------------------------------------------------------------
// USSD Push : la demande de paiement arrive directement sur le téléphone du client
// ---------------------------------------------------------------------------

export const KPP_GATEWAYS = {
  'MIXX-YAS-TG': 'Mixx by Yas',
  'MOOV-MONEY-TG': 'Moov Money (Flooz)',
} as const

export type KppGateway = keyof typeof KPP_GATEWAYS

export function isKppGateway(value: unknown): value is KppGateway {
  return typeof value === 'string' && value in KPP_GATEWAYS
}

/** "+228 90 12 34 56" / "22890123456" / "90123456" -> "90123456" (format local attendu par KPrimePay) */
export function toLocalTogoNumber(input: string): string | null {
  let digits = (input || '').replace(/\D/g, '')
  if (digits.startsWith('00228')) digits = digits.slice(5)
  else if (digits.startsWith('228') && digits.length === 11) digits = digits.slice(3)
  return /^\d{8}$/.test(digits) ? digits : null
}

/**
 * Délai après lequel une demande USSD restée "pending" est considérée comme échouée
 * (popup ignoré, refusé, solde insuffisant sans retour de l'opérateur...).
 * Réversible : si KPrimePay confirme ensuite le paiement, la commande repasse en payée.
 */
// Garder synchronisé avec PUSH_TIMEOUT_S dans src/app/kprimepay/retour/page.tsx
export const KPP_PUSH_TIMEOUT_MS = 2 * 60 * 1000

export interface KppUssdPushInput {
  transactionId: string
  amount: number
  gateway: KppGateway
  phoneNumber: string
  customerName: string
  customerEmail: string
  description: string
}

export async function createKppUssdPush(input: KppUssdPushInput): Promise<unknown> {
  const payload = {
    transaction_id: input.transactionId,
    amount: input.amount,
    with_fees: process.env.KPRIMEPAY_WITH_FEES === '1' ? 1 : 0,
    gateway: input.gateway,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    phone_number: input.phoneNumber,
    description: input.description.slice(0, 500),
  }

  const { ok, httpStatus, json } = await kppFetch('/payments/ussd-push', payload, input.transactionId)

  if (!ok || json?.status === false) {
    const msg = json?.message || `Erreur KPrimePay (HTTP ${httpStatus})`
    console.error('[KPrimePay] USSD push échoué:', httpStatus, JSON.stringify(json))
    throw new Error(msg)
  }
  return json
}

// ---------------------------------------------------------------------------
// Statut d'une transaction (source de vérité)
// ---------------------------------------------------------------------------

export interface KppDebitStatus {
  status: 'success' | 'failed' | 'pending'
  amount: number | null
  kppReference: string | null
  gateway: string | null
  paymentReference: string | null
  paymentDate: string | null
  raw: unknown
}

export async function getKppDebitStatus(transactionId: string): Promise<KppDebitStatus> {
  const { ok, httpStatus, json } = await kppFetch('/transactions/debit-status', {
    transaction_id: transactionId,
  })

  if (!ok || !json) {
    console.error(`[KPrimePay] debit-status ${transactionId} HTTP ${httpStatus}:`, JSON.stringify(json))
    throw new Error(`debit-status indisponible (HTTP ${httpStatus})`)
  }

  // La réponse peut être enveloppée dans `data` ou non : on gère les deux.
  const d = json.data && typeof json.data === 'object' ? json.data : json
  const statusField = typeof d.transaction_status === 'string' ? d.transaction_status : d.status
  const rawStatus = typeof statusField === 'string' ? statusField.toLowerCase() : ''

  const FAILED = ['failed', 'failure', 'fail', 'cancelled', 'canceled', 'expired', 'declined', 'rejected', 'refused', 'error']
  const status: KppDebitStatus['status'] =
    rawStatus === 'success' || rawStatus === 'succeeded' || rawStatus === 'successful'
      ? 'success'
      : FAILED.includes(rawStatus)
        ? 'failed'
        : 'pending'

  console.log(`[KPrimePay] debit-status ${transactionId}: "${rawStatus || '?'}" -> ${status}`)

  const amount = d.transaction_amount ?? d.amount
  return {
    status,
    amount: amount != null && !Number.isNaN(Number(amount)) ? Number(amount) : null,
    kppReference: d.kpp_tx_reference ?? d.kpp_reference ?? null,
    gateway: d.payment_gateway ?? null,
    paymentReference: d.payment_reference ?? null,
    paymentDate: d.payment_date ?? null,
    raw: json,
  }
}

// ---------------------------------------------------------------------------
// Synchronisation DB <- KPrimePay (utilisée par le webhook ET la page de retour)
// ---------------------------------------------------------------------------

type StockItem = { productId: string | null; colorName: string | null; size: string; quantity: number; productName: string }

/**
 * Synchronise un paiement KPrimePay avec la base.
 * Idempotent : peut être appelé plusieurs fois (webhook rejoué, page rafraîchie...),
 * la commande n'est marquée payée et le stock décrémenté qu'une seule fois.
 */
export async function syncKppPayment(
  transactionId: string,
  source: string,
  opts: { cancelIfPending?: boolean } = {},
): Promise<KppSyncResult> {
  const payment = await db.payment.findUnique({
    where: { transactionId },
    include: { order: true },
  })

  if (!payment || payment.paymentMethod !== KPP_PAYMENT_METHOD) return 'not_found'
  if (payment.status === 'completed') return 'completed'

  // Les paiements USSD push ont un phoneNumber (le checkout hébergé n'en a pas).
  const isPush = Boolean(payment.phoneNumber)
  // cancelIfPending : le client a cliqué sur « Annuler » -> on conclut tout de suite
  // (sauf si KPrimePay confirme le paiement, auquel cas la commande est payée).
  const isStale =
    Boolean(opts.cancelIfPending) || (isPush && Date.now() - payment.createdAt.getTime() > KPP_PUSH_TIMEOUT_MS)

  let remote: KppDebitStatus
  try {
    remote = await getKppDebitStatus(transactionId)
  } catch (e) {
    // API de statut injoignable ou en erreur : on ne bloque pas le client indéfiniment.
    if (!isStale) throw e
    console.warn(`[KPrimePay] debit-status en erreur pour ${transactionId}, délai dépassé :`, e)
    remote = {
      status: 'pending', amount: null, kppReference: null, gateway: null,
      paymentReference: null, paymentDate: null, raw: { error: String(e) },
    }
  }

  if (remote.status === 'pending' && !isStale) return 'pending'

  if (remote.status === 'failed' || remote.status === 'pending') {
    await db.payment.updateMany({
      where: { id: payment.id, status: { notIn: ['completed', 'failed'] } },
      data: {
        status: 'failed',
        errorMessage:
          remote.status === 'failed'
            ? 'Paiement refusé ou non finalisé (KPrimePay)'
            : opts.cancelIfPending
              ? 'Annulé par le client (non validé sur le téléphone)'
              : 'Délai de confirmation dépassé (aucune validation sur le téléphone)',
        metadata: JSON.stringify({ source, checkedAt: new Date().toISOString(), remote: remote.raw }),
      },
    })
    // Ne jamais repasser en échec une commande déjà payée (autre tentative réussie)
    await db.order.updateMany({
      where: { id: payment.orderId, paymentStatus: { not: 'paid' } },
      data: { paymentStatus: 'failed', status: 'payment_failed' },
    })
    return 'failed'
  }

  // remote.status === 'success'
  if (remote.amount !== null && remote.amount !== payment.amount) {
    console.error(
      `[KPrimePay] Montant incohérent pour ${transactionId}: attendu ${payment.amount}, reçu ${remote.amount}`,
    )
    await db.payment.updateMany({
      where: { id: payment.id, status: { not: 'completed' } },
      data: {
        status: 'amount_mismatch',
        errorMessage: `Montant reçu ${remote.amount} != attendu ${payment.amount}`,
        metadata: JSON.stringify({ source, checkedAt: new Date().toISOString(), remote: remote.raw }),
      },
    })
    return 'amount_mismatch'
  }

  const alreadyDone = await db.$transaction(async (tx) => {
    // Verrou logique : un seul appel peut faire passer le paiement à "completed"
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'completed' } },
      data: {
        status: 'completed',
        paidAt: new Date(),
        operator: remote.gateway ?? 'kprimepay',
        cpmTransId: remote.paymentReference ?? remote.kppReference,
        errorMessage: null,
        metadata: JSON.stringify({ source, checkedAt: new Date().toISOString(), remote: remote.raw }),
      },
    })
    if (claimed.count === 0) return true

    const items: StockItem[] = await tx.orderItem.findMany({
      where: { orderId: payment.orderId },
      select: { productId: true, colorName: true, size: true, quantity: true, productName: true },
    })

    for (const item of items) {
      if (!item.productId || !item.colorName) continue
      const productColor = await tx.productColor.findFirst({
        where: { productId: item.productId, colorName: item.colorName },
      })
      if (!productColor) continue

      const sizes = JSON.parse(productColor.sizes) as { size: string; price: number; stock: number }[]
      const sizeInfo = sizes.find((s) => s.size === item.size)
      if (sizeInfo && sizeInfo.stock < item.quantity) {
        // Le client a déjà payé : on ne bloque pas, on signale pour traitement manuel.
        console.warn(`[KPrimePay] Stock insuffisant après paiement: ${item.productName} taille ${item.size}`)
      }
      const updatedSizes = sizes.map((s) =>
        s.size === item.size ? { ...s, stock: Math.max(0, s.stock - item.quantity) } : s,
      )
      await tx.productColor.update({
        where: { id: productColor.id },
        data: { sizes: JSON.stringify(updatedSizes) },
      })
    }

    await tx.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'paid', status: 'paid' },
    })
    return false
  })

  if (!alreadyDone) {
    console.log(`[KPrimePay] Commande ${payment.order.orderNumber} payée (${transactionId}, via ${source})`)
  }
  return 'completed'
}
