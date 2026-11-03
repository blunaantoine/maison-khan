/**
 * MAISON KHAN — Gestion du consentement cookies / notifications.
 *
 * Le consentement est stocké dans le cookie `mk_consent` :
 * - durée de vie : 180 jours
 * - valeur : JSON encodé (encodeURIComponent)
 * - path=/, SameSite=Lax
 *
 * Toutes les fonctions sont SSR-safe : elles vérifient `typeof document !== 'undefined'`
 * et se comportent en mode "lecture seule / no-op" côté serveur.
 */

/** Préférences que l'utilisateur peut réellement modifier. */
export interface ConsentSettings {
  /** Cookies strictement nécessaires — toujours actifs. */
  essential: true;
  /** Mesure d'audience anonyme. */
  analytics: boolean;
  /** Alertes de suivi de commande (notifications navigateur). */
  notifications: boolean;
  /** Date ISO du dernier enregistrement du consentement. */
  consentDate: string;
}

/** Sous-ensemble modifiable passé à `saveConsent`. */
export type ConsentPreferences = Pick<ConsentSettings, 'analytics' | 'notifications'>;

const CONSENT_COOKIE_NAME = 'mk_consent';
const CONSENT_MAX_AGE_DAYS = 180;

/** true si l'on s'exécute dans un navigateur (document disponible). */
function isBrowser(): boolean {
  return typeof document !== 'undefined';
}

/** Lit la valeur brute du cookie de consentement (null si absent ou côté serveur). */
function readConsentCookie(): string | null {
  if (!isBrowser()) return null;
  const prefix = `${CONSENT_COOKIE_NAME}=`;
  const parts = document.cookie.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.startsWith(prefix)) {
      return part.slice(prefix.length);
    }
  }
  return null;
}

/** Validation de forme du JSON stocké (défense contre un cookie corrompu/manipulé). */
function isValidConsent(value: unknown): value is ConsentSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.essential === true &&
    typeof v.analytics === 'boolean' &&
    typeof v.notifications === 'boolean' &&
    typeof v.consentDate === 'string' &&
    v.consentDate.length > 0
  );
}

/**
 * Retourne le consentement enregistré, ou `null` si l'utilisateur
 * n'a pas encore exprimé de choix (cookie absent ou invalide).
 */
export function getConsent(): ConsentSettings | null {
  const raw = readConsentCookie();
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    return isValidConsent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre le consentement (cookie 180 jours) et retourne l'objet complet sauvegardé.
 * No-op côté serveur (retourne quand même l'objet pour garder une API homogène).
 */
export function saveConsent(preferences: ConsentPreferences): ConsentSettings {
  const settings: ConsentSettings = {
    essential: true,
    analytics: preferences.analytics,
    notifications: preferences.notifications,
    consentDate: new Date().toISOString(),
  };

  if (isBrowser()) {
    const maxAgeSeconds = CONSENT_MAX_AGE_DAYS * 24 * 60 * 60;
    document.cookie = [
      `${CONSENT_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(settings))}`,
      `max-age=${maxAgeSeconds}`,
      'path=/',
      'SameSite=Lax',
    ].join('; ');
  }

  return settings;
}

/** Supprime le consentement (le bandeau réapparaîtra au prochain chargement). */
export function resetConsent(): void {
  if (!isBrowser()) return;
  document.cookie = [
    `${CONSENT_COOKIE_NAME}=`,
    'max-age=0',
    'path=/',
    'SameSite=Lax',
  ].join('; ');
}

/** true si un consentement valide existe (choix déjà exprimé). */
export function hasConsent(): boolean {
  return getConsent() !== null;
}
