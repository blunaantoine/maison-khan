/**
 * MAISON KHAN — Client SMS Africa's Talking (API REST, sans SDK).
 *
 * Documentation : https://developers.africastalking.com/docs/sms/sending/bulk
 *
 * Variables d'environnement :
 *  - AFRICASTALKING_USERNAME  : nom d'utilisateur de l'application
 *                               ("sandbox" → bascule automatiquement sur le sandbox)
 *  - AFRICASTALKING_API_KEY   : clé API de l'application
 *  - AFRICASTALKING_SENDER_ID : (optionnel) Sender ID / shortcode approuvé
 *
 * Ce module ne lève jamais d'exception : il renvoie toujours un résultat.
 */

const LIVE_URL = 'https://api.africastalking.com/version1/messaging'
const SANDBOX_URL = 'https://api.sandbox.africastalking.com/version1/messaging'
const REQUEST_TIMEOUT_MS = 10_000

/** Codes de statut Africa's Talking considérés comme un succès d'envoi. */
const SUCCESS_STATUS_CODES = new Set([100, 101, 102]) // Processed, Sent, Queued

export interface SmsRecipientResult {
  number: string
  status: string
  statusCode: number
  messageId?: string
  cost?: string
}

export interface SendSmsResult {
  success: boolean
  /** Message global renvoyé par Africa's Talking ou description de l'erreur. */
  message: string
  recipients: SmsRecipientResult[]
}

export function isSmsConfigured(): boolean {
  return Boolean(
    process.env.AFRICASTALKING_USERNAME?.trim() && process.env.AFRICASTALKING_API_KEY?.trim()
  )
}

/**
 * Normalise un numéro au format international (+228XXXXXXXX).
 * Accepte : "+228 90 00 00 00", "00228...", "228...", "90000000" (Togo par défaut).
 * Renvoie null si le numéro est invalide.
 */
export function normalizePhone(raw: string, defaultCountryCode = '228'): string | null {
  let n = raw.trim().replace(/[\s.\-()]/g, '')
  if (!n) return null
  if (n.startsWith('00')) n = `+${n.slice(2)}`
  if (!n.startsWith('+')) {
    const cc = defaultCountryCode.replace(/\D/g, '')
    n = n.startsWith(cc) && n.length > cc.length + 6 ? `+${n}` : `+${cc}${n.replace(/^0+/, '')}`
  }
  return /^\+\d{8,15}$/.test(n) ? n : null
}

/** Envoie un SMS à un ou plusieurs numéros (déjà au format international). */
export async function sendSms(params: { to: string[]; message: string }): Promise<SendSmsResult> {
  const username = process.env.AFRICASTALKING_USERNAME?.trim()
  const apiKey = process.env.AFRICASTALKING_API_KEY?.trim()
  const senderId = process.env.AFRICASTALKING_SENDER_ID?.trim()

  if (!username || !apiKey) {
    return { success: false, message: 'AFRICASTALKING_USERNAME / AFRICASTALKING_API_KEY absentes', recipients: [] }
  }
  if (params.to.length === 0) {
    return { success: false, message: 'Aucun destinataire', recipients: [] }
  }

  const body = new URLSearchParams({
    username,
    to: params.to.join(','),
    message: params.message,
  })
  if (senderId) body.set('from', senderId)

  const url = username.toLowerCase() === 'sandbox' ? SANDBOX_URL : LIVE_URL

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    const text = await res.text()
    if (!res.ok) {
      // 401 = clé API/username invalides, 400 = requête invalide, etc.
      return { success: false, message: `HTTP ${res.status} : ${text.slice(0, 300)}`, recipients: [] }
    }

    let data: {
      SMSMessageData?: {
        Message?: string
        Recipients?: { number: string; status: string; statusCode: number; messageId?: string; cost?: string }[]
      }
    }
    try {
      data = JSON.parse(text)
    } catch {
      return { success: false, message: `Réponse non JSON : ${text.slice(0, 300)}`, recipients: [] }
    }

    const recipients: SmsRecipientResult[] = (data.SMSMessageData?.Recipients ?? []).map((r) => ({
      number: r.number,
      status: r.status,
      statusCode: Number(r.statusCode),
      messageId: r.messageId,
      cost: r.cost,
    }))
    const success = recipients.length > 0 && recipients.some((r) => SUCCESS_STATUS_CODES.has(r.statusCode))

    return {
      success,
      message: data.SMSMessageData?.Message ?? (success ? 'Envoyé' : 'Aucun destinataire accepté'),
      recipients,
    }
  } catch (e) {
    const reason = e instanceof Error && e.name === 'TimeoutError' ? `délai dépassé (${REQUEST_TIMEOUT_MS} ms)` : String(e)
    return { success: false, message: `Erreur réseau : ${reason}`, recipients: [] }
  }
}
