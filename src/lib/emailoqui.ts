/**
 * MAISON KHAN — Client EmailOqui (suivi des événements e-mail).
 *
 * Documentation endpoint : POST https://email.oquitogo.online/api/v1/events
 * Authentification : `Authorization: Bearer <clé>` (EMAILOQUI_API_KEY).
 *
 * Types d'événements supportés : SENT, DELIVERED, OPENED, CLICKED, BOUNCE,
 * FAILED, UNSUBSCRIBE, COMPLAINT.
 *
 * Règles de l'API :
 *  - Idempotent : chaque event_id n'est compté qu'une fois (les retries sont
 *    sans risque de double-comptage).
 *  - Maximum 1000 événements par requête (batching automatique ici).
 *  - Les événements invalides (type inconnu…) sont rejetés un par un dans
 *    `errors[]` sans faire échouer la requête (HTTP 200).
 *
 * ⚠️ PHILOSOPHIE : la télémétrie ne doit JAMAIS faire échouer un envoi d'email
 * ni une opération métier. Toutes les fonctions avalent leurs erreurs et se
 * contentent de journaliser dans la console serveur.
 */

export const EMAILOQUI_EVENT_TYPES = [
  'SENT',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  'BOUNCE',
  'FAILED',
  'UNSUBSCRIBE',
  'COMPLAINT',
] as const

export type EmailoquiEventType = (typeof EMAILOQUI_EVENT_TYPES)[number]

const DEFAULT_EVENTS_URL = 'https://email.oquitogo.online/api/v1/events'
const MAX_EVENTS_PER_REQUEST = 1000
const REQUEST_TIMEOUT_MS = 10_000

export interface EmailoquiEvent {
  /** Identifiant unique — l'API est idempotent par event_id. */
  event_id: string
  /** E-mail du destinataire. */
  email: string
  /** Un des 8 types supportés. */
  type: EmailoquiEventType
  /** Nom de campagne optionnel — regroupe les événements dans le dashboard. */
  campaign_name?: string
  /** ISO 8601 — défaut : maintenant (côté EmailOqui). */
  occurred_at?: string
}

export function isEmailoquiConfigured(): boolean {
  return Boolean(process.env.EMAILOQUI_API_KEY)
}

function eventsUrl(): string {
  return process.env.EMAILOQUI_EVENTS_URL || DEFAULT_EVENTS_URL
}

/** Génère un event_id unique (préfixe + UUID v4). */
export function newEmailoquiEventId(prefix = 'mk'): string {
  const uuid = crypto.randomUUID()
  return `${prefix}_${uuid}`
}

interface PushResult {
  /** Nombre d'événements effectivement transmis (HTTP 200). */
  pushed: number
  /** True si au moins une requête a abouti. */
  ok: boolean
}

/**
 * Pousse un lot d'événements vers EmailOqui (batching ≤ 1000 par requête).
 * Ne lève JAMAIS d'exception : les erreurs sont journalisées.
 */
export async function pushEmailEvents(events: EmailoquiEvent[]): Promise<PushResult> {
  if (events.length === 0) return { pushed: 0, ok: true }

  const apiKey = process.env.EMAILOQUI_API_KEY
  if (!apiKey) {
    // Non configuré : silencieux (ni erreur ni bruit) — c'est un état voulu.
    return { pushed: 0, ok: false }
  }

  const url = eventsUrl()
  let pushed = 0

  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
    const batch = events.slice(i, i + MAX_EVENTS_PER_REQUEST)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error(
          `[emailoqui] Push échoué (HTTP ${res.status}) : ${text.slice(0, 300)}`
        )
        continue
      }

      const data = (await res.json().catch(() => null)) as {
        received?: number
        duplicates?: number
        errors?: { event_id: string; error: string }[]
      } | null

      if (data && Array.isArray(data.errors) && data.errors.length > 0) {
        console.warn(
          `[emailoqui] ${data.errors.length} événement(s) rejeté(s) :`,
          JSON.stringify(data.errors).slice(0, 500)
        )
      }

      pushed += batch.length
      console.log(
        `[emailoqui] ${batch.length} événement(s) transmis (reçus: ${data?.received ?? '?'}, doublons: ${data?.duplicates ?? '?'})`
      )
    } catch (e) {
      console.error('[emailoqui] Push échoué (réseau/timeout) :', e)
    }
  }

  return { pushed, ok: pushed > 0 }
}

/**
 * Suit un événement e-mail unique — fire-and-forget (ne renvoie jamais
 * d'erreur à l'appelant, n'attend rien de lui).
 */
export function trackEmailEvent(params: {
  email: string
  type: EmailoquiEventType
  campaign?: string
  occurredAt?: Date
}): void {
  const { email, type, campaign, occurredAt } = params
  if (!email) return

  void pushEmailEvents([
    {
      event_id: newEmailoquiEventId(),
      email,
      type,
      campaign_name: campaign,
      occurred_at: occurredAt?.toISOString(),
    },
  ])
}

// ──────────────────────────────────────────────
// Libellés de campagne (regroupement dans le dashboard EmailOqui)
// ──────────────────────────────────────────────

/** Type d'email interne MAISON KHAN → nom de campagne lisible. */
export const CAMPAIGN_LABELS: Record<string, string> = {
  payment_receipt: 'Reçu de paiement',
  status_update: 'Mise à jour de commande',
  password_reset: 'Réinitialisation mot de passe',
  order_confirmation: 'Reçu de commande',
  test: 'Test intégration',
}

export function campaignLabel(emailType: string): string {
  return CAMPAIGN_LABELS[emailType] || emailType
}
