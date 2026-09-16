import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import ZAI from 'z-ai-web-dev-sdk'

/**
 * POST /api/ai/analyze-product-image
 *
 * Assistant IA pour le formulaire d'ajout de produit :
 * l'admin uploade la photo d'un article (ou d'une couleur/variante),
 * l'IA (modèle de vision) analyse l'image et renvoie uniquement :
 *  - la description vendeuse de l'article,
 *  - la couleur de l'article : nom français + code hexadécimal exact.
 *
 * Côté client, la description n'est appliquée que si le champ est encore
 * vide ; la couleur (nom + hex) est appliquée à la variante en cours.
 * Les autres champs du formulaire restent à la saisie manuelle.
 *
 * Body : { image: string }  — image en data URL base64 (JPEG/PNG/WebP)
 */

interface ProductAnalysis {
  description: string
  colorName: string
  colorValue: string
}

/** Extrait et parse le premier objet JSON d'une réponse LLM (gère les fences markdown). */
function extractJson(raw: string): ProductAnalysis | null {
  try {
    // Cas 1 : réponse entre fences ```json ... ```
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const candidate = fenceMatch ? fenceMatch[1] : raw
    // Cas 2 : premier objet { ... } équilibré
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null
    const parsed = JSON.parse(candidate.slice(start, end + 1))
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as ProductAnalysis
  } catch {
    return null
  }
}

/** Assainit les valeurs renvoyées par l'IA pour qu'elles respectent le schéma de l'app. */
function sanitizeAnalysis(raw: ProductAnalysis): ProductAnalysis {
  // Couleur : nom français raisonnable + hex valide
  const colorValue = /^#[0-9A-Fa-f]{6}$/.test(String(raw.colorValue).trim())
    ? String(raw.colorValue).trim().toUpperCase()
    : '#8B7355'
  const colorName = String(raw.colorName || '').trim().slice(0, 40) || 'Naturel'

  return {
    description: String(raw.description || '').trim().slice(0, 600),
    colorName,
    colorValue
  }
}

export async function POST(request: NextRequest) {
  try {
    // Réservé aux administrateurs
    const adminCheck = await requireAdmin(request)
    if (adminCheck) return adminCheck

    // Anti-abus : 20 analyses par minute et par IP
    const ip = getClientIp(request)
    const limit = rateLimit(`ai-analyze:${ip}`, 20, 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans quelques instants.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } }
      )
    }

    const body = await request.json()
    const { image } = body as { image?: string }

    if (!image || typeof image !== 'string') {
      return NextResponse.json({ error: 'Image manquante' }, { status: 400 })
    }

    // Doit être une data URL d'image (générée par compressImage côté client)
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) {
      return NextResponse.json(
        { error: 'Format d\'image invalide (JPEG, PNG ou WebP attendu)' },
        { status: 400 }
      )
    }

    // Garde-fou taille : ~6 Mo de base64 max
    if (image.length > 8_000_000) {
      return NextResponse.json(
        { error: 'Image trop volumineuse' },
        { status: 413 }
      )
    }

    const zai = await ZAI.create()

    const prompt = `Tu es assistant merchandising pour MAISON KHAN, marque togolaise de chaussures et accessoires de luxe fabriqués artisanalement (cuir, raphia, perles).

Analyse la photo de cet article et renvoie UNIQUEMENT un objet JSON valide (aucun texte autour, pas de markdown) avec ces champs :
{
  "description": "description vendeuse de 2 à 3 phrases en français, ton luxe/artisanal, mentionnant la matière, la couleur et le style visibles sur la photo",
  "colorName": "nom français de la couleur DOMINANTE de l'article (ex: Noir, Camel, Doré, Terracotta, Ivoire, Bordeaux...)",
  "colorValue": "code hexadécimal approximatif de cette couleur dominante, format #RRGGBB"
}

Réponds uniquement avec le JSON.`

    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ],
      thinking: { type: 'disabled' }
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      console.error('[AI-ANALYZE] Réponse vide du modèle de vision')
      return NextResponse.json(
        { error: 'L\'analyse n\'a rien renvoyé, réessayez' },
        { status: 502 }
      )
    }

    const parsed = extractJson(content)
    if (!parsed) {
      console.error('[AI-ANALYZE] JSON illisible:', content.slice(0, 300))
      return NextResponse.json(
        { error: 'Analyse illisible, réessayez avec une autre photo' },
        { status: 502 }
      )
    }

    const analysis = sanitizeAnalysis(parsed)
    console.log('[AI-ANALYZE] Analyse réussie:', analysis.colorName, analysis.colorValue)

    return NextResponse.json({
      success: true,
      analysis
    })
  } catch (error) {
    console.error('[AI-ANALYZE] Erreur:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'analyse de l\'image' },
      { status: 500 }
    )
  }
}
