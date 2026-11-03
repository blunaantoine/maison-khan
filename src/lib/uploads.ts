/**
 * MAISON KHAN — Stockage des médias (images & vidéos) sous forme de FICHIERS.
 *
 * POURQUOI CE MODULE EXISTE :
 * Avant, les images produits / slides / atelier étaient stockées en base64
 * DANS la base de données. Résultat : /api/products pesait ~19,5 Mo,
 * /api/atelier-images ~5,5 Mo… et la page d'accueil ne s'affichait plus sur
 * mobile (connexion 3G/4G) ni correctement sur ordinateur.
 *
 * Désormais chaque data URI (base64) est converti en fichier physique et la
 * base ne garde que l'URL de service « /api/img/<fichier> » :
 *   - le JSON des API devient léger (quelques Ko) ;
 *   - les images sont servies avec un cache navigateur d'UN AN (le nom de
 *     fichier est le hash du contenu → contenu identique = même URL) ;
 *   - le navigateur charge les images en parallèle, progressivement.
 *
 * OÙ SONT LES FICHIERS :
 *   - VPS  : /var/www/maison-khan/db/uploads  (survit aux rebuilds, comme la base)
 *   - dev  : <projet>/db/uploads
 *   - surcharge possible via la variable d'environnement UPLOADS_DIR.
 *
 * IMPORTANT : en production, le serveur standalone Next.js fait
 * process.chdir(.next/standalone) — process.cwd() est donc INUTILISABLE pour
 * retrouver le dossier du projet. On s'appuie sur le chemin absolu du VPS
 * (même logique que DATABASE_URL=file:/var/www/maison-khan/db/custom.db).
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const VPS_PROJECT_DIR = '/var/www/maison-khan'

/** Extensions de fichier selon le type MIME détecté dans le data URI. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/ogg': 'ogv',
}

/** Type MIME selon l'extension (pour servir le fichier avec le bon Content-Type). */
export const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
}

/** Dossier physique des médias (créé au besoin). */
export function uploadsDir(): string {
  let dir: string
  if (process.env.UPLOADS_DIR && process.env.UPLOADS_DIR.trim()) {
    dir = process.env.UPLOADS_DIR.trim()
  } else if (fs.existsSync(VPS_PROJECT_DIR)) {
    // Production VPS — chemin absolu fiable (le cwd du standalone change)
    dir = path.join(VPS_PROJECT_DIR, 'db', 'uploads')
  } else {
    // Développement local
    dir = path.join(process.cwd(), 'db', 'uploads')
  }
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Vrai si la valeur est un data URI image/vidéo encodé en base64. */
export function isDataUri(value: string): boolean {
  return typeof value === 'string' && /^data:(image|video)\/[a-zA-Z0-9.+-]+;base64,/.test(value)
}

/**
 * Sauvegarde un data URI en fichier physique.
 * Renvoie l'URL publique « /api/img/<fichier> », ou null si la valeur n'est
 * pas un data URI décodable. Le nom de fichier est le hash SHA-1 du contenu :
 * la même image ré-envoyée écrase toujours le même fichier (dé-duplication
 * gratuite et URL stables pour le cache navigateur).
 */
export function saveDataUri(dataUri: string, prefix: string): string | null {
  const match = dataUri.match(/^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/)
  if (!match) return null

  const [, mime, base64] = match
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) return null

  const ext = EXT_BY_MIME[mime.toLowerCase()]
  if (!ext) return null // type non autorisé (svg, html, exécutable…)
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(prefix)) return null
  const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 16)
  const filename = `${prefix}-${hash}.${ext}`

  const filePath = path.join(uploadsDir(), filename)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, buffer)
  }
  return `/api/img/${filename}`
}

/**
 * Parcourt récursivement une structure JSON (objets, tableaux, chaînes) et
 * remplace CHAQUE data URI image/vidéo par son URL fichier « /api/img/... ».
 * Les valeurs qui ne sont pas des data URIs (URLs /api/img/, http…, textes)
 * restent strictement inchangées — la fonction est donc idempotente et peut
 * être appliquée sans risque à chaque sauvegarde admin.
 */
export function materializeDataUris<T>(value: T, prefix: string): T {
  if (typeof value === 'string') {
    if (!isDataUri(value)) return value
    const url = saveDataUri(value, prefix)
    return (url ?? value) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => materializeDataUris(item, prefix)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = materializeDataUris(val, prefix)
    }
    return out as unknown as T
  }
  return value
}

/** Type MIME correspondant à un nom de fichier média. */
export function mimeTypeForFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXT[ext] || 'application/octet-stream'
}
