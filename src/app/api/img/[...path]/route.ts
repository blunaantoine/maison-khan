import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { uploadsDir, mimeTypeForFilename } from '@/lib/uploads'

/**
 * MAISON KHAN — Service des fichiers médias (images & vidéos).
 *
 * GET /api/img/<fichier>
 *
 * Sert le binaire depuis le dossier des médias (db/uploads) :
 *   - Cache navigateur d'UN AN + `immutable` : les noms de fichiers sont des
 *     hash du contenu → un contenu modifié change forcément de nom d'URL.
 *     Résultat : après la première visite, les produits s'affichent
 *     instantanément (zéro re-téléchargement des images).
 *   - Support des requêtes Range (HTTP 206) : indispensable pour la lecture
 *     et le déplacement dans les vidéos sur Safari/iOS.
 *
 * Grâce à cette route, /api/products, /api/slides et /api/atelier-images ne
 * renvoient plus que des URLs légères — la page d'accueil ne transporte plus
 * ~28 Mo de base64 dans le JSON (cause du chargement interminable sur mobile).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: parts } = await params

    // Sécurité : un seul segment, pas de remontée de dossier, pas de caractère douteux
    if (!parts || parts.length !== 1) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }
    const filename = path.basename(parts[0])
    if (!filename || filename.startsWith('.') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }

    // Liste blanche stricte : « prefixe-hash.ext » généré par saveDataUri.
    // Rien d'autre (pas de « .. », de séparateur, d'octet nul ni d'extension inconnue).
    if (!/^[a-zA-Z0-9_-]{1,80}\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|ogv)$/i.test(filename)) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }

    const root = path.resolve(uploadsDir())
    const filePath = path.resolve(root, filename)
    // Confinement : le fichier résolu doit rester DANS le dossier des médias
    if (!filePath.startsWith(root + path.sep)) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    }

    const buffer = fs.readFileSync(filePath)
    const total = buffer.length

    const headers = new Headers({
      'Content-Type': mimeTypeForFilename(filename),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })

    // ── Requête Range (ex. « bytes=0-999 ») : réponse partielle 206 ──
    const range = request.headers.get('range')
    const rangeMatch = range?.match(/^bytes=(\d*)-(\d*)$/)
    if (rangeMatch) {
      const start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0
      const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : total - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
        return new NextResponse(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` },
        })
      }
      const safeEnd = Math.min(end, total - 1)
      const chunk = buffer.subarray(start, safeEnd + 1)
      headers.set('Content-Range', `bytes ${start}-${safeEnd}/${total}`)
      headers.set('Content-Length', String(chunk.length))
      return new NextResponse(new Uint8Array(chunk), { status: 206, headers })
    }

    headers.set('Content-Length', String(total))
    return new NextResponse(new Uint8Array(buffer), { status: 200, headers })
  } catch (error) {
    console.error('[IMG] Error serving media file:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
