import { db } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { sendPushToUser, type PushPayload } from '@/lib/push'
import {
  getPaymentReceiptEmail,
  getStatusUpdateEmail,
  type EmailOrder,
} from '@/lib/email-templates'
import {
  pushEventNotification,
} from '@/lib/notifications/service'
import { NOTIFICATION_TYPES } from '@/lib/notifications/types'

/**
 * MAISON KHAN — Moteur de notifications.
 *
 * Quatre canaux :
 *  1. Notifications in-app admin (model Notification) → centre de notifications admin
 *  2. Notifications in-app client (model ClientNotification) → cloche 🔔 client
 *  3. Emails clients (Resend) → journalisés dans EmailLog
 *  4. Notifications push (Web Push) → appareils du client
 *
 * ⚠️ RÈGLE MÉTIER — AUCUNE communication client (notification in-app, email
 * NI push) avant que le paiement ne soit VÉRIFIÉ (paymentStatus === 'paid').
 * Le PREMIER contact d'un client est le reçu de paiement (email) accompagné
 * d'une notification in-app « Paiement reçu ». Paiement en attente ou échoué
 * → aucune communication client (les notifications admin restent créées).
 *
 * Tolérance aux pannes : une notification, un email ou un push ne doit JAMAIS
 * faire échouer l'opération métier (création de commande, callback paiement…).
 * Tout est donc try/catch et journalisé.
 */

interface OrderWithItems {
  id: string
  orderNumber: string
  userId?: string | null
  customerEmail: string
  customerPhone: string
  customerFirstName?: string | null
  customerLastName?: string | null
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingCountry?: string | null
  subtotal: number
  shippingCost: number
  total: number
  trackingNumber?: string | null
  status?: string
  paymentStatus?: string | null
  items: {
    productName: string
    size?: string | null
    colorName?: string | null
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]
}

function toEmailOrder(order: OrderWithItems): EmailOrder {
  return {
    orderNumber: order.orderNumber,
    customerFirstName: order.customerFirstName,
    customerLastName: order.customerLastName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    shippingAddress: order.shippingAddress,
    shippingCity: order.shippingCity,
    shippingCountry: order.shippingCountry,
    subtotal: order.subtotal,
    shippingCost: order.shippingCost,
    total: order.total,
    trackingNumber: order.trackingNumber,
    items: order.items,
  }
}

// ──────────────────────────────────────────────
// Notifications in-app (admin)
// ──────────────────────────────────────────────

export async function createNotification(params: {
  type: string
  title: string
  message: string
  orderId?: string
}): Promise<void> {
  try {
    await db.notification.create({ data: params })
  } catch (e) {
    console.error('[notify] Notification non créée :', e)
  }
}

// ──────────────────────────────────────────────
// Emails clients (avec journalisation)
// ──────────────────────────────────────────────

// 'order_confirmation' n'existe plus : AUCUN email n'est envoyé avant le
// paiement vérifié (le reçu de paiement est le premier email client).
// Le label reste dans l'admin pour l'affichage des anciens logs.
type EmailType = 'payment_receipt' | 'status_update'

/**
 * Envoie un email client + journalise le résultat dans EmailLog.
 * Si RESEND_API_KEY est absente, l'email est journalisé « skipped »
 * (l'application continue de fonctionner, l'envoi reprendra dès la clé configurée).
 */
async function sendClientEmail(params: {
  to: string
  type: EmailType
  template: { subject: string; html: string }
  orderId?: string
}): Promise<void> {
  const { to, type, template, orderId } = params
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(`[email:skipped] ${type} → ${to} (RESEND_API_KEY absente)`)
    try {
      await db.emailLog.create({
        data: { to, subject: template.subject, type, orderId, status: 'skipped', error: 'RESEND_API_KEY absente' },
      })
    } catch { /* jamais bloquant */ }
    return
  }

  try {
    const result = await sendEmail({ to, subject: template.subject, html: template.html })
    try {
      await db.emailLog.create({
        data: {
          to,
          subject: template.subject,
          type,
          orderId,
          status: result.success ? 'sent' : 'failed',
          error: result.success ? null : String(result.error ?? 'erreur inconnue'),
        },
      })
    } catch { /* jamais bloquant */ }
  } catch (e) {
    console.error(`[email:error] ${type} → ${to}`, e)
    try {
      await db.emailLog.create({
        data: { to, subject: template.subject, type, orderId, status: 'failed', error: String(e) },
      })
    } catch { /* jamais bloquant */ }
  }
}

/** Un email de ce type a-t-il déjà été envoyé pour cette commande ? (anti-doublon) */
async function emailAlreadySent(orderId: string, type: EmailType): Promise<boolean> {
  try {
    const count = await db.emailLog.count({
      where: { orderId, type, status: { in: ['sent', 'skipped'] } },
    })
    return count > 0
  } catch {
    return false
  }
}

// ──────────────────────────────────────────────
// Événements métier
// ──────────────────────────────────────────────

/** Commande créée → notification admin UNIQUEMENT.
 *  AUCUN email ni push au client à ce stade : le paiement n'est pas encore
 *  vérifié. Le client recevra son PREMIER email (reçu de paiement, avec le
 *  détail complet de la commande) dès que le paiement sera confirmé. */
export async function notifyOrderCreated(order: OrderWithItems): Promise<void> {
  const total = order.total.toLocaleString('fr-FR').replace(/\u202f/g, ' ')
  await createNotification({
    type: 'order_created',
    title: 'Nouvelle commande',
    message: `${order.orderNumber} — ${total} XOF · ${order.items.length} article${order.items.length > 1 ? 's' : ''} · ${order.customerFirstName || order.customerEmail}`,
    orderId: order.id,
  })
}

/** Push au propriétaire de la commande (jamais bloquant, tag par commande). */
async function pushToOrderOwner(order: OrderWithItems, payload: Omit<PushPayload, 'tag' | 'url'>): Promise<void> {
  if (!order.userId) return
  try {
    await sendPushToUser(order.userId, {
      ...payload,
      tag: order.id,
      url: '/',
    })
  } catch (e) {
    console.error('[notify] Push non envoyé :', e)
  }
}

/** Notification in-app (cloche 🔔) au propriétaire de la commande.
 *  Jamais bloquante. Les commandes invités (sans compte) sont ignorées. */
async function inAppToOrderOwner(
  order: OrderWithItems,
  params: { title: string; message: string; type: 'order' | 'payment' }
): Promise<void> {
  if (!order.userId) return
  await pushEventNotification({
    userId: order.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: '#account:orders',
    orderId: order.id,
  })
}

/** Paiement confirmé → notification admin + reçu de paiement au client (une seule fois). */
export async function notifyPaymentConfirmed(order: OrderWithItems): Promise<void> {
  const alreadySent = await emailAlreadySent(order.id, 'payment_receipt')
  if (alreadySent) {
    // Notification quand même (si le paiement passe par 2 chemins), email non.
    await createNotification({
      type: 'payment_confirmed',
      title: 'Paiement confirmé',
      message: `${order.orderNumber} — payée. Le reçu a déjà été envoyé au client.`,
      orderId: order.id,
    })
    return
  }
  const total = order.total.toLocaleString('fr-FR').replace(/\u202f/g, ' ')
  await createNotification({
    type: 'payment_confirmed',
    title: 'Paiement confirmé ✓',
    message: `${order.orderNumber} — ${total} XOF reçus · reçu envoyé à ${order.customerEmail}`,
    orderId: order.id,
  })
  if (order.customerEmail) {
    await sendClientEmail({
      to: order.customerEmail,
      type: 'payment_receipt',
      template: getPaymentReceiptEmail(toEmailOrder(order)),
      orderId: order.id,
    })
  }
  // Notification in-app « Paiement reçu » (PREMIÈRE notification client)
  await inAppToOrderOwner(order, {
    type: NOTIFICATION_TYPES.PAYMENT,
    title: 'Paiement reçu ✓',
    message: `Votre paiement de ${total} XOF pour la commande ${order.orderNumber} a été confirmé.`,
  })
  // Push « Paiement reçu »
  await pushToOrderOwner(order, {
    title: 'Paiement reçu ✓',
    body: `Votre paiement de ${order.total.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} XOF pour la commande ${order.orderNumber} a été confirmé.`,
  })
}

/** Paiement échoué/annulé → notification admin (pas d'email au client : la page web l'informe déjà). */
export async function notifyPaymentFailed(order: OrderWithItems, reason: 'failed' | 'cancelled'): Promise<void> {
  await createNotification({
    type: 'payment_failed',
    title: reason === 'cancelled' ? 'Paiement annulé' : 'Paiement refusé',
    message: `${order.orderNumber} — le client peut réessayer depuis son compte`,
    orderId: order.id,
  })
}

/** Changement de statut par l'admin → notification admin + email/push au client
 *  UNIQUEMENT si le paiement est vérifié (règle métier : aucune communication
 *  client tant que paymentStatus !== 'paid'). */
export async function notifyStatusChanged(
  order: OrderWithItems,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  if (oldStatus === newStatus) return

  const labels: Record<string, string> = {
    pending: 'En attente de paiement',
    paid: 'Payée',
    processing: 'En préparation',
    ready: 'Prête (retrait boutique)',
    shipped: 'Expédiée',
    delivered: 'Livrée',
    cancelled: 'Annulée',
    payment_failed: 'Paiement échoué',
  }

  await createNotification({
    type: 'status_changed',
    title: 'Statut de commande modifié',
    message: `${order.orderNumber} : ${labels[oldStatus] || oldStatus} → ${labels[newStatus] || newStatus}`,
    orderId: order.id,
  })

  // RÈGLE MÉTIER : aucun email ni push au client si le paiement n'est pas
  // vérifié (en attente ou échoué). La notification admin reste créée.
  if (order.paymentStatus !== 'paid') return

  // Email client pour les statuts significatifs (processing / ready / shipped / delivered / cancelled)
  const template = getStatusUpdateEmail(toEmailOrder(order), newStatus)
  if (template && order.customerEmail) {
    await sendClientEmail({
      to: order.customerEmail,
      type: 'status_update',
      template,
      orderId: order.id,
    })
  }

  // Push client — messages courts adaptés à l'écran de verrouillage.
  // Les MÊMES libellés alimentent la notification in-app (cloche 🔔).
  const pushMessages: Record<string, { title: string; body: string }> = {
    processing: {
      title: 'Commande en préparation',
      body: `Votre commande ${order.orderNumber} est en préparation dans notre atelier.`,
    },
    ready: {
      title: 'Commande prête ✓',
      body: `Votre commande ${order.orderNumber} vous attend en boutique ! Présentez votre numéro de commande au comptoir.`,
    },
    shipped: {
      title: 'Commande expédiée 📦',
      body: order.trackingNumber
        ? `Votre commande ${order.orderNumber} a été expédiée. Suivi : ${order.trackingNumber}`
        : `Votre commande ${order.orderNumber} a été expédiée et arrive bientôt.`,
    },
    delivered: {
      title: 'Commande livrée ✓',
      body: `Votre commande ${order.orderNumber} a été livrée. Merci pour votre confiance !`,
    },
    cancelled: {
      title: 'Commande annulée',
      body: `Votre commande ${order.orderNumber} a été annulée. Contactez-nous si c'est une erreur.`,
    },
  }
  const push = pushMessages[newStatus]
  if (push) {
    // Notification in-app (cloche 🔔) — même message, même instant
    await inAppToOrderOwner(order, {
      type: NOTIFICATION_TYPES.ORDER,
      title: push.title,
      message: push.body,
    })
    // Push (écran de verrouillage, même site fermé)
    await pushToOrderOwner(order, push)
  }
}
