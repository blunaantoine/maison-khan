/**
 * Rate limiting simple en mémoire (suffisant pour un VPS mono-instance).
 *
 * NOTE : les compteurs se réinitialisent au redémarrage du process — c'est
 * acceptable pour se protéger du brute force sur un site de cette taille.
 * Pour une protection multi-instances, utiliser Redis à la place.
 */

type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Nettoyage périodique des buckets expirés (toutes les 10 minutes)
const CLEANUP_INTERVAL = 10 * 60 * 1000
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt < now) buckets.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Vérifie et consomme un jeton pour la clé donnée.
 * @param key        Identifiant unique (ex: `login:ip:1.2.3.4`)
 * @param maxAttempts Nombre maximum de tentatives par fenêtre
 * @param windowMs    Durée de la fenêtre en millisecondes
 */
export function rateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): RateLimitResult {
  cleanup()
  const now = Date.now()

  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 }
  }

  if (bucket.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
    }
  }

  bucket.count += 1
  return {
    allowed: true,
    remaining: maxAttempts - bucket.count,
    retryAfterSeconds: 0
  }
}

/** Extrait l'IP client d'une requête Next (derrière Caddy/Nginx). */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}
