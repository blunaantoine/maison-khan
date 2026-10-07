import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * MAISON KHAN — Média d'une slide vidéo du hero.
 *
 * GET /api/slides/{id}/media
 *
 * Sert la vidéo (stockée en base64 dans la base, comme les images) en binaire
 * avec le support des requêtes Range (HTTP 206) — indispensable pour la
 * lecture et le déplacement dans la vidéo sur Safari/iOS — et un cache de
 * 24 h côté navigateur (l'URL est versionnée par ?v={updatedAt} dans la
 * liste des slides, donc le cache est invalidé si la slide change).
 *
 * Ce montage permet à la page d'accueil de rester LÉGÈRE : /api/slides ne
 * renvoie que l'URL de la vidéo, jamais son contenu.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const slide = await db.heroSlide.findUnique({ where: { id } })
    if (!slide || slide.type !== 'video' || !slide.image?.startsWith('data:video/')) {
      return NextResponse.json({ error: 'Média introuvable' }, { status: 404 })
    }

    const match = slide.image.match(/^data:(video\/[a-zA-Z0-9.+-]+);base64,([\s\S]*)$/)
    if (!match) {
      return NextResponse.json({ error: 'Média invalide' }, { status: 422 })
    }
    const [, contentType, base64] = match
    const buffer = Buffer.from(base64, 'base64')
    const total = buffer.length

    const headers = new Headers({
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
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
    console.error('Error serving slide media:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
