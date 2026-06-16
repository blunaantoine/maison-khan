import { Resend } from 'resend'

// Email addresses - using verified domain
const FROM_EMAIL = 'contact@maison-khan.com'
const REPLY_TO = 'technique@maison-khan.com' // Admin email for replies
const BRAND_NAME = 'MAISON KHAN'

interface SendEmailOptions {
  to: string
  subject: string
  html: string
}

interface SendEmailResult {
  success: boolean
  data?: unknown
  error?: unknown
}

// Lazy initialization of Resend client
let resendClient: Resend | null = null

function getResendClient(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set')
    }
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<SendEmailResult> {
  try {
    const resend = getResendClient()
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `[${BRAND_NAME}] ${subject}`,
      html,
      reply_to: REPLY_TO,
    })

    if (error) {
      console.error('Email error:', error)
      return { success: false, error }
    }

    console.log('Email sent successfully:', data)
    return { success: true, data }
  } catch (error) {
    console.error('Email error:', error)
    return { success: false, error }
  }
}

// Password reset email template
export function getPasswordResetEmail(newPassword: string) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Réinitialisation du mot de passe</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8F6F3; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-family: 'Cormorant Garamond', serif; color: #0A0A0A; font-size: 28px; margin: 0;">MAISON KHAN</h1>
          <p style="color: #9C7C5C; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Chaussures de luxe artisanales</p>
        </div>
        
        <h2 style="color: #0A0A0A; font-size: 22px; margin-bottom: 20px;">Réinitialisation de votre mot de passe</h2>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Bonjour,
        </p>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Vous avez demandé la réinitialisation de votre mot de passe. Voici votre nouveau mot de passe temporaire :
        </p>
        
        <div style="background-color: #F8F6F3; border: 1px solid #E5E0DA; padding: 20px; text-align: center; margin: 30px 0; border-radius: 8px;">
          <p style="color: #6B6560; font-size: 14px; margin: 0 0 10px 0;">Votre nouveau mot de passe</p>
          <p style="font-size: 24px; font-weight: bold; color: #0A0A0A; font-family: monospace; letter-spacing: 2px; margin: 0;">${newPassword}</p>
        </div>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          <strong>Important :</strong> Connectez-vous avec ce mot de passe et changez-le immédiatement depuis votre espace "Mon Compte".
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E0DA;">
          <p style="color: #6B6560; font-size: 14px; margin: 0;">
            Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
          </p>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <p style="color: #9C7C5C; font-size: 12px; letter-spacing: 1px;">
            MAISON KHAN - Made in Africa
          </p>
          <p style="color: #6B6560; font-size: 12px;">
            📍 Lomé, Togo | 📞 +228 70 16 67 67
          </p>
          <p style="color: #6B6560; font-size: 12px;">
            ✉️ technique@maison-khan.com
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Order confirmation email template
export function getOrderConfirmationEmail(orderNumber: string, customerName: string, items: { name: string; size: string; quantity: number; price: number }[], total: number) {
  const formatPrice = (price: number) => price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " XOF"
  
  const itemsHtml = items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E0DA;">${item.name}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E0DA; text-align: center;">${item.size}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E0DA; text-align: center;">${item.quantity}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #E5E0DA; text-align: right;">${formatPrice(item.price)}</td>
    </tr>
  `).join('')

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Confirmation de commande</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8F6F3; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-family: 'Cormorant Garamond', serif; color: #0A0A0A; font-size: 28px; margin: 0;">MAISON KHAN</h1>
          <p style="color: #9C7C5C; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Chaussures de luxe artisanales</p>
        </div>
        
        <h2 style="color: #15803D; font-size: 22px; margin-bottom: 10px;">✅ Commande confirmée !</h2>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Bonjour ${customerName || 'Cher client'},
        </p>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Votre commande <strong style="color: #0A0A0A;">${orderNumber}</strong> a été enregistrée avec succès.
        </p>
        
        <div style="background-color: #F8F6F3; padding: 20px; margin: 30px 0; border-radius: 8px;">
          <h3 style="color: #0A0A0A; font-size: 18px; margin: 0 0 15px 0;">Récapitulatif</h3>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 2px solid #E5E0DA;">
                <th style="padding: 10px 0; text-align: left; color: #6B6560; font-size: 14px;">Produit</th>
                <th style="padding: 10px 0; text-align: center; color: #6B6560; font-size: 14px;">Taille</th>
                <th style="padding: 10px 0; text-align: center; color: #6B6560; font-size: 14px;">Qté</th>
                <th style="padding: 10px 0; text-align: right; color: #6B6560; font-size: 14px;">Prix</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 15px 0; text-align: right; font-weight: bold; color: #0A0A0A;">Total</td>
                <td style="padding: 15px 0; text-align: right; font-weight: bold; color: #9C7C5C; font-size: 18px;">${formatPrice(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Nous vous tiendrons informé de l'avancement de votre commande.
        </p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E0DA;">
          <p style="color: #6B6560; font-size: 14px; margin: 0;">
            Une question ? Contactez-nous via WhatsApp au +228 70 16 67 67
          </p>
        </div>
        
        <div style="margin-top: 30px; text-align: center;">
          <p style="color: #9C7C5C; font-size: 12px; letter-spacing: 1px;">
            MAISON KHAN - Made in Africa
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

// Order status update email template
export function getOrderStatusEmail(orderNumber: string, customerName: string, status: string, trackingNumber?: string) {
  const statusMessages: Record<string, { title: string; message: string; icon: string }> = {
    paid: { title: 'Paiement confirmé', message: 'Votre paiement a été confirmé. Nous préparons votre commande.', icon: '💳' },
    processing: { title: 'En préparation', message: 'Votre commande est en cours de préparation.', icon: '📦' },
    shipped: { title: 'Expédiée', message: 'Votre commande a été expédiée !', icon: '🚚' },
    delivered: { title: 'Livrée', message: 'Votre commande a été livrée. Merci pour votre confiance !', icon: '✅' },
    cancelled: { title: 'Annulée', message: 'Votre commande a été annulée.', icon: '❌' }
  }

  const statusInfo = statusMessages[status] || { title: status, message: '', icon: '📋' }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Mise à jour de commande</title>
    </head>
    <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #F8F6F3; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-family: 'Cormorant Garamond', serif; color: #0A0A0A; font-size: 28px; margin: 0;">MAISON KHAN</h1>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 48px;">${statusInfo.icon}</span>
          <h2 style="color: #0A0A0A; font-size: 22px; margin: 15px 0;">${statusInfo.title}</h2>
        </div>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          Bonjour ${customerName || 'Cher client'},
        </p>
        
        <p style="color: #6B6560; font-size: 16px; line-height: 1.6;">
          ${statusInfo.message}
        </p>
        
        <div style="background-color: #F8F6F3; padding: 20px; margin: 30px 0; border-radius: 8px; text-align: center;">
          <p style="color: #6B6560; font-size: 14px; margin: 0 0 5px 0;">Commande</p>
          <p style="color: #0A0A0A; font-size: 18px; font-weight: bold; margin: 0;">${orderNumber}</p>
        </div>
        
        ${trackingNumber ? `
          <div style="background-color: #E8F5E9; padding: 20px; margin: 30px 0; border-radius: 8px; text-align: center;">
            <p style="color: #15803D; font-size: 14px; margin: 0 0 5px 0;">Numéro de suivi</p>
            <p style="color: #0A0A0A; font-size: 18px; font-weight: bold; margin: 0; font-family: monospace;">${trackingNumber}</p>
          </div>
        ` : ''}
        
        <div style="margin-top: 40px; text-align: center;">
          <p style="color: #9C7C5C; font-size: 12px; letter-spacing: 1px;">
            MAISON KHAN - Made in Africa
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}
