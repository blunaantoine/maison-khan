/**
 * Redirection navigateur sûre : n'autorise que https:// (ou http:// en local)
 * et les chemins relatifs du site. Bloque « javascript: », « data: » et les
 * URLs mal formées — une URL renvoyée par une API ne doit jamais pouvoir
 * exécuter du script via window.location.href (XSS).
 */
export function safeNavigate(url: unknown): boolean {
  if (typeof url !== 'string' || !url) return false
  try {
    const parsed = new URL(url, window.location.origin)
    const isLocal = ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if (parsed.protocol === 'https:' || (isLocal && parsed.protocol === 'http:')) {
      window.location.href = parsed.toString()
      return true
    }
  } catch { /* URL invalide */ }
  return false
}
