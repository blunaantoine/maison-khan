import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { uploadsDir } from '@/lib/uploads'

/**
 * GET /api/og/<idProduit> (ou /api/og/default)
 *
 * Image de PARTAGE (aperçu WhatsApp, Facebook, iMessage, Telegram…) :
 * JPEG 1200×630, fond crème, produit entier centré, poids < 250 Ko.
 *
 * Pourquoi : WhatsApp ignore les images de plus de ~300 Ko et celles qui ne sont
 * pas en URL absolue https. Les photos produit d'origine (et le logo, 1,3 Mo)
 * dépassent cette limite → l'aperçu s'affichait sans photo.
 */

const WIDTH = 1200
const HEIGHT = 630
const BACKGROUND = '#F8F6F3'
const MAX_BYTES = 250 * 1024

/** Lit les octets d'une image stockée par le site (/api/img/<fichier> ou data URI). */
function loadLocalImage(src: string): Buffer | null {
  try {
    if (src.startsWith('data:image/')) {
      const m = src.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/)
      return m ? Buffer.from(m[1], 'base64') : null
    }
    const m = src.match(/^\/api\/img\/([a-zA-Z0-9_-]{1,80}\.(?:jpe?g|png|webp|gif|avif))$/i)
    if (!m) return null // URLs externes refusées (pas de requête sortante : anti-SSRF)
    const root = path.resolve(uploadsDir())
    const file = path.resolve(root, m[1])
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return null
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

function loadLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), 'public', 'logo.png'))
  } catch {
    return null
  }
}

/** Compose le JPEG final en baissant la qualité jusqu'à passer sous MAX_BYTES. */
async function render(input: Buffer): Promise<Buffer> {
  const resized = await sharp(input)
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: 'contain', background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .toBuffer()
  let out = resized
  for (const quality of [82, 72, 62, 50]) {
    out = await sharp(resized).jpeg({ quality, mozjpeg: true }).toBuffer()
    if (out.length <= MAX_BYTES) break
  }
  return out
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    let source: Buffer | null = null

    if (id !== 'default' && /^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      const product = await db.product.findUnique({
        where: { id },
        include: { colors: { orderBy: { order: 'asc' } } },
      })
      if (product && product.isActive) {
        const candidates: string[] = []
        for (const color of product.colors) {
          try {
            const imgs = JSON.parse(color.images)
            if (Array.isArray(imgs)) candidates.push(...imgs.filter((i) => typeof i === 'string'))
          } catch { /* couleur illisible */ }
        }
        if (product.image) candidates.push(product.image)
        for (const src of candidates) {
          source = loadLocalImage(src)
          if (source) break
        }
      }
    }

    // Produit sans photo exploitable (ou image par défaut) : logo de la marque
    if (!source) source = loadLogo()
    if (!source) return NextResponse.json({ error: 'Image introuvable' }, { status: 404 })

    const jpeg = await render(source)
    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(jpeg.length),
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    console.error('[og] Erreur de génération :', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
