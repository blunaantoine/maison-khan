/**
 * MAISON KHAN — Templates d'emails clients (HTML inline, charte de la marque).
 *
 * Palette : noir #0A0A0A, crème #F8F6F3, doré #C4A77D, bronze #9C7C5C,
 * texte #2C2C2A / #6B6560. Typo de titres : Cormorant Garamond (serif système
 * de secours Georgia — les webfonts ne sont pas fiables dans les clients mail).
 *
 * 3 templates :
 *  - getOrderConfirmationEmail : reçu de commande (en attente de paiement)
 *  - getPaymentReceiptEmail    : reçu de paiement (commande payée)
 *  - getStatusUpdateEmail      : changement de statut (préparation/expédition/
 *                                livraison/annulation)
 */

export interface EmailOrderItem {
  productName: string
  size?: string | null
  colorName?: string | null
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface EmailOrder {
  orderNumber: string
  customerFirstName?: string | null
  customerLastName?: string | null
  customerEmail: string
  customerPhone: string
  shippingAddress?: string | null
  shippingCity?: string | null
  shippingCountry?: string | null
  subtotal: number
  shippingCost: number
  total: number
  trackingNumber?: string | null
  items: EmailOrderItem[]
}

const fmt = (n: number) =>
  n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' XOF'

const fmtDate = (d = new Date()) =>
  d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

function itemsTable(items: EmailOrderItem[]): string {
  const rows = items
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #EDE8E1;color:#2C2C2A;font-size:14px;">
            ${escapeHtml(i.productName)}
            ${(i.size || i.colorName) ? `<div style="color:#9C9A92;font-size:12px;margin-top:2px;">${[
              i.size ? `Taille ${escapeHtml(i.size)}` : '',
              i.colorName ? escapeHtml(i.colorName) : '',
            ].filter(Boolean).join(' · ')}</div>` : ''}
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #EDE8E1;text-align:center;color:#6B6560;font-size:14px;">× ${i.quantity}</td>
          <td style="padding:10px 0;border-bottom:1px solid #EDE8E1;text-align:right;color:#2C2C2A;font-size:14px;font-weight:600;">${fmt(i.totalPrice)}</td>
        </tr>`
    )
    .join('')
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
      <thead>
        <tr>
          <th style="padding:8px 0;border-bottom:2px solid #0A0A0A;text-align:left;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6560;font-weight:600;">Article</th>
          <th style="padding:8px 0;border-bottom:2px solid #0A0A0A;text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6560;font-weight:600;">Qté</th>
          <th style="padding:8px 0;border-bottom:2px solid #0A0A0A;text-align:right;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6B6560;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`
}

function totalsTable(order: EmailOrder): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;">
      <tr>
        <td style="padding:6px 0;color:#6B6560;font-size:14px;">Sous-total</td>
        <td style="padding:6px 0;text-align:right;color:#2C2C2A;font-size:14px;">${fmt(order.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;color:#6B6560;font-size:14px;">Livraison</td>
        <td style="padding:6px 0;text-align:right;color:#2C2C2A;font-size:14px;">${order.shippingCost > 0 ? fmt(order.shippingCost) : 'Offerte'}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 0;border-top:2px solid #0A0A0A;color:#0A0A0A;font-size:15px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Total</td>
        <td style="padding:12px 0 0;border-top:2px solid #0A0A0A;text-align:right;color:#9C7C5C;font-size:20px;font-weight:700;font-family:Georgia,serif;">${fmt(order.total)}</td>
      </tr>
    </table>`
}

function shippingBlock(order: EmailOrder): string {
  const name = [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') || 'Client'
  const lines = [
    escapeHtml(name),
    escapeHtml(order.shippingAddress || ''),
    [order.shippingCity, order.shippingCountry || 'Togo'].filter(Boolean).map(escapeHtml).join(', '),
    escapeHtml(order.customerPhone),
  ].filter((l) => l && l.trim() !== '')
  return `
    <div style="background:#F8F6F3;border-left:3px solid #C4A77D;padding:16px 20px;margin:24px 0;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9C7C5C;font-weight:600;">Adresse de livraison</p>
      <p style="margin:0;color:#2C2C2A;font-size:14px;line-height:1.6;">${lines.join('<br>')}</p>
    </div>`
}

function layout(body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MAISON KHAN</title>
    </head>
    <body style="margin:0;padding:0;background-color:#EDE8E1;font-family:'Segoe UI',Helvetica,Arial,sans-serif;">
      <div style="display:none;max-height:0;overflow:hidden;">MAISON KHAN — L'art de la marche.</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#EDE8E1;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;">
              <!-- En-tête -->
              <tr>
                <td style="background:#0A0A0A;padding:36px 40px;text-align:center;border-bottom:3px solid #C4A77D;">
                  <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;letter-spacing:6px;color:#FFFFFF;">MAISON KHAN</p>
                  <p style="margin:8px 0 0;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#C4A77D;">Chaussures de luxe artisanales</p>
                </td>
              </tr>
              <!-- Corps -->
              <tr>
                <td style="padding:40px 40px 24px;">${body}</td>
              </tr>
              <!-- Pied -->
              <tr>
                <td style="padding:24px 40px 32px;border-top:1px solid #EDE8E1;text-align:center;">
                  <p style="margin:0 0 4px;color:#9C9A92;font-size:12px;">MAISON KHAN — Lomé, Togo</p>
                  <p style="margin:0;color:#9C9A92;font-size:11px;">Cet email automatique concerne votre commande. Merci de ne pas y répondre.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Reçu de commande — envoyé dès la création (paiement en attente). */
export function getOrderConfirmationEmail(order: EmailOrder): { subject: string; html: string } {
  const name = order.customerFirstName || 'cher client'
  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0A0A0A;">Merci pour votre commande</h1>
    <p style="margin:0 0 4px;color:#6B6560;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0 0 8px;color:#6B6560;font-size:15px;line-height:1.6;">
      Nous avons bien reçu votre commande <strong style="color:#0A0A0A;">${escapeHtml(order.orderNumber)}</strong> passée le ${fmtDate()}.
      Voici votre reçu détaillé.
    </p>
    <div style="background:#FDF6E8;border:1px solid #C4A77D;padding:14px 18px;margin:20px 0;">
      <p style="margin:0;color:#8B6B2E;font-size:14px;line-height:1.5;">
        <strong>⏳ Paiement en attente.</strong>
        Votre commande sera confirmée dès réception du paiement.
        Vous pouvez payer à tout moment depuis votre compte (« Mes commandes » → Réessayer le paiement).
      </p>
    </div>
    ${itemsTable(order.items)}
    ${totalsTable(order)}
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9C7C5C;font-weight:600;">Récapitulatif</p>
    <p style="margin:0 0 0;color:#6B6560;font-size:13px;">
      Commande <strong style="color:#2C2C2A;">${escapeHtml(order.orderNumber)}</strong> · ${fmtDate()}<br>
      Contact : ${escapeHtml(order.customerPhone)} · ${escapeHtml(order.customerEmail)}
    </p>
    ${shippingBlock(order)}
    <p style="margin:24px 0 0;color:#6B6560;font-size:14px;line-height:1.6;">
      Une question ? Répondez simplement à cet email ou écrivez-nous — notre atelier vous répond sous 24 h.
    </p>
    <p style="margin:16px 0 0;font-family:Georgia,serif;font-size:18px;color:#0A0A0A;">L'atelier MAISON KHAN</p>`
  return { subject: `Commande ${order.orderNumber} reçue ✓`, html: layout(body) }
}

/** Reçu de paiement — envoyé quand le paiement est confirmé. */
export function getPaymentReceiptEmail(order: EmailOrder): { subject: string; html: string } {
  const name = order.customerFirstName || 'cher client'
  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:#0A0A0A;">Paiement confirmé — merci !</h1>
    <p style="margin:0 0 8px;color:#6B6560;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0;color:#6B6560;font-size:15px;line-height:1.6;">
      Nous confirmons la réception de votre paiement pour la commande
      <strong style="color:#0A0A0A;">${escapeHtml(order.orderNumber)}</strong>. Voici votre reçu.
    </p>
    <div style="background:#F0F7F1;border:1px solid #15803D;padding:14px 18px;margin:20px 0;">
      <p style="margin:0;color:#15803D;font-size:14px;line-height:1.5;">
        <strong>✓ Paiement reçu</strong> — ${fmt(order.total)} le ${fmtDate()}
      </p>
    </div>
    ${itemsTable(order.items)}
    ${totalsTable(order)}
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9C7C5C;font-weight:600;">Récapitulatif</p>
    <p style="margin:0;color:#6B6560;font-size:13px;">
      Commande <strong style="color:#2C2C2A;">${escapeHtml(order.orderNumber)}</strong> · Payée le ${fmtDate()}<br>
      Contact : ${escapeHtml(order.customerPhone)} · ${escapeHtml(order.customerEmail)}
    </p>
    ${shippingBlock(order)}
    <p style="margin:24px 0 0;color:#6B6560;font-size:14px;line-height:1.6;">
      Votre commande entre maintenant en préparation dans notre atelier.
      Vous recevrez un email à chaque étape : préparation, expédition, livraison.
    </p>
    <p style="margin:16px 0 0;font-family:Georgia,serif;font-size:18px;color:#0A0A0A;">L'atelier MAISON KHAN</p>`
  return { subject: `Reçu de paiement — ${order.orderNumber} ✓`, html: layout(body) }
}

export const STATUS_EMAIL_LABELS: Record<string, { title: string; intro: string; color: string }> = {
  processing: {
    title: 'Votre commande est en préparation',
    intro: 'Nos artisans ont commencé la préparation de votre commande.',
    color: '#9C7C5C',
  },
  shipped: {
    title: 'Votre commande est expédiée 📦',
    intro: 'Votre colis a quitté notre atelier et est en route vers vous.',
    color: '#7C3AED',
  },
  delivered: {
    title: 'Votre commande est livrée ✓',
    intro: 'Votre colis a été livré. Nous espérons que vos nouvelles créations vous plaisent !',
    color: '#15803D',
  },
  cancelled: {
    title: 'Votre commande est annulée',
    intro: 'Votre commande a été annulée comme demandé. Si vous pensez qu’il s’agit d’une erreur, contactez-nous.',
    color: '#B91C1C',
  },
}

/** Changement de statut — envoyé quand l'admin met à jour la commande. */
export function getStatusUpdateEmail(order: EmailOrder, newStatus: string): { subject: string; html: string } | null {
  const meta = STATUS_EMAIL_LABELS[newStatus]
  if (!meta) return null // statut sans email (pending, paid déjà couvert par le reçu)

  const name = order.customerFirstName || 'cher client'
  const trackingBlock = order.trackingNumber
    ? `
    <div style="background:#F8F6F3;border-left:3px solid #C4A77D;padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9C7C5C;font-weight:600;">Numéro de suivi</p>
      <p style="margin:0;color:#2C2C2A;font-size:16px;font-weight:600;letter-spacing:1px;">${escapeHtml(order.trackingNumber)}</p>
    </div>`
    : ''

  const body = `
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:26px;color:${meta.color};">${meta.title}</h1>
    <p style="margin:0 0 8px;color:#6B6560;font-size:15px;line-height:1.6;">Bonjour ${escapeHtml(name)},</p>
    <p style="margin:0;color:#6B6560;font-size:15px;line-height:1.6;">
      ${meta.intro}<br>
      Commande <strong style="color:#0A0A0A;">${escapeHtml(order.orderNumber)}</strong> — ${fmt(order.total)}.
    </p>
    ${trackingBlock}
    ${itemsTable(order.items)}
    ${shippingBlock(order)}
    <p style="margin:24px 0 0;color:#6B6560;font-size:14px;line-height:1.6;">
      Vous pouvez suivre l'évolution de votre commande à tout moment depuis votre compte sur le site.
    </p>
    <p style="margin:16px 0 0;font-family:Georgia,serif;font-size:18px;color:#0A0A0A;">L'atelier MAISON KHAN</p>`

  return { subject: `${meta.title} — ${order.orderNumber}`, html: layout(body) }
}
