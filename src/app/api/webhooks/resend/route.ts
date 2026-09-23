import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import {
  pushEmailEvents,
  newEmailoquiEventId,
  campaignLabel,
  type EmailoquiEvent,
  type EmailoquiEventType,
} from '@/lib/emailoqui'

/**
 * MAISON KHAN — Webhook Resend → retransmission vers EmailOqui.
 *
 * Resend notifie ici les événements de cycle de vie des emails
 * (documentation : https://resend.com/docs/dashboard/webhooks).
 * Chaque événement est converti au format EmailOqui et poussé vers
 * POST https://email.oquitogo.online/api/v1/events.
 *
 * ⚠️ `email.sent` est IGNORÉ volontairement : l'événement SENT est déjà
 * poussé par le backend au moment de l'envoi (src/lib/notify.ts) — le
 * retransmettre ici provoquerait un double comptage (les event_id diffèrent).
 *
 * Sécurité : si RESEND_WEBHOOK_SECRET est configurée, la signature svix
 * (en-têtes svix-id / svix-timestamp / svix-signature) est vérifiée
 * strictement — toute requête non signée ou mal signée est rejetée (401).
 * Sans secret configuré, les événements sont acceptés avec un avertissement
 * (utile en développement ; configurez le secret en production).
 *
 * Ce endpoint répond toujours 200 à Resend (sauf signature invalide) pour
 * éviter les retries inutiles — la retransmission vers EmailOqui ne doit
 * jamais faire échouer la réception.
 */

/** Resend → EmailOqui. `email.sent` exclu (déjà poussé par le backend). */
const RESEND_TO_EMAILOQUI: Record<string, EmailoquiEventType> = {
  'email.delivered': 'DELIVERED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
  'email.bounced': 'BOUNCE',
  'email.complained': 'COMPLAINT',
  'email.unsubscribed': 'UNSUBSCRIBE',
}

const SUBJECT_PREFIX = '[MAISON KHAN] '

interface ResendWebhookPayload {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    from?: string
    to?: string | string[]
    email?: string
    subject?: string
    [key: string]: unknown
  }
}

/** Vérifie la signature svix (standard Resend : HMAC-SHA256 base64). */
function verifySvixSignature(
  rawBody: string,
  svixId: string | null,
  svixTimestamp: string | null,
  svixSignature: string | null,
  secret: string
): boolean {
  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Secret svix : « whsec_<base64> » → clé = base64 décodé.
  // Si le décodage échoue, on retombe sur le secret brut.
  let keyBytes: Buffer
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  try {
    keyBytes = Buffer.from(raw, 'base64')
    if (keyBytes.length === 0) keyBytes = Buffer.from(secret, 'utf-8')
  } catch {
    keyBytes = Buffer.from(secret, 'utf-8')
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', keyBytes)
    .update(signedContent, 'utf-8')
    .digest('base64')

  // L'en-tête peut contenir plusieurs signatures : « v1,xxx v1,yyy ».
  return svixSignature
    .split(' ')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('v1,'))
    .some((s) => {
      const provided = s.slice('v1,'.length)
      const a = Buffer.from(expected, 'utf-8')
      const b = Buffer.from(provided, 'utf-8')
      return a.length === b.length && crypto.timingSafeEqual(a, b)
    })
}

/** Extrait l'email destinataire (champ `to` tableau/chaîne, ou `email`). */
function extractEmail(data: ResendWebhookPayload['data']): string {
  if (!data) return ''
  if (typeof data.to === 'string' && data.to) return data.to
  if (Array.isArray(data.to) && data.to.length > 0) return data.to[0]
  if (typeof data.email === 'string' && data.email) return data.email
  return ''
}

/**
 * Résout le nom de campagne : cherche le dernier EmailLog dont le sujet
 * correspond (le sujet Resend porte le préfixe « [MAISON KHAN] », retiré au
 * moment de la journalisation). Retombe sur le sujet brut si introuvable.
 */
async function resolveCampaignName(subject: string | undefined): Promise<string | undefined> {
  if (!subject) return undefined
  const cleanSubject = subject.startsWith(SUBJECT_PREFIX)
    ? subject.slice(SUBJECT_PREFIX.length)
    : subject
  try {
    const log = await db.emailLog.findFirst({
      where: { subject: cleanSubject },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    })
    if (log) return campaignLabel(log.type)
  } catch { /* jamais bloquant */ }
  return cleanSubject.slice(0, 80)
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // ── Signature (si configurée) ──
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const valid = verifySvixSignature(
      rawBody,
      request.headers.get('svix-id'),
      request.headers.get('svix-timestamp'),
      request.headers.get('svix-signature'),
      secret
    )
    if (!valid) {
      console.warn('[webhook:resend] Signature svix invalide — requête rejetée')
      return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
    }
  } else {
    console.warn(
      '[webhook:resend] RESEND_WEBHOOK_SECRET absente — événement accepté sans vérification (configurez le secret en production)'
    )
  }

  // ── Décodage (tolérant : événement unique ou tableau) ──
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const payloads: ResendWebhookPayload[] = Array.isArray(parsed) ? parsed : [parsed]

  // ── Conversion → événements EmailOqui (appariés à leur payload) ──
  const pairs: { event: EmailoquiEvent; subject?: string }[] = []
  for (const payload of payloads) {
    const emailoquiType = RESEND_TO_EMAILOQUI[payload.type || '']
    if (!emailoquiType) {
      // email.sent (double comptage évité), email.delivery_delayed (sans
      // équivalent EmailOqui), événements inconnus → ignorés silencieusement.
      continue
    }
    const email = extractEmail(payload.data)
    if (!email) continue
    pairs.push({
      event: {
        event_id: newEmailoquiEventId('wh'),
        email,
        type: emailoquiType,
        occurred_at: payload.created_at,
      },
      subject: payload.data?.subject,
    })
  }

  // ── Résolution des campagnes (sujet → type d'email MAISON KHAN) ──
  for (const pair of pairs) {
    pair.event.campaign_name = await resolveCampaignName(pair.subject)
  }

  // ── Retransmission vers EmailOqui ──
  let forwarded = 0
  if (pairs.length > 0) {
    const result = await pushEmailEvents(pairs.map((p) => p.event))
    forwarded = result.pushed
  }

  const ignoredCount = payloads.length - pairs.length
  console.log(
    `[webhook:resend] ${payloads.length} événement(s) reçu(s) — ${forwarded} retransmis, ${ignoredCount} ignoré(s)`
  )
  return NextResponse.json({ received: payloads.length, forwarded, ignored: ignoredCount })
}

/** Sonde simple (test de l'URL depuis le dashboard Resend). */
export async function GET() {
  return NextResponse.json({ service: 'resend-webhook', forwarder: 'emailoqui' })
}
