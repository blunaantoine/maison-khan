import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/ai/analyze-product-image
 *
 * Assistant IA pour le formulaire d'ajout de produit :
 * l'admin uploade la photo d'un article (ou d'une couleur/variante),
 * l'IA Mistral Pixtral (modèle de vision) analyse l'image et renvoie uniquement :
 *  - la description vendeuse de l'article,
 *  - la couleur de l'article : nom français + code hexadécimal exact.
 *
 * Configuration (.env) :
 *  - MISTRAL_API_KEY      : clé API depuis https://console.mistral.ai/api-keys
 *    (plan gratuit « Experiment » suffisant)
 *  - MISTRAL_VISION_MODEL : modèle de vision, défaut « pixtral-12b-2409 »
 *    (alternatives : « pixtral-large-latest » plus précis, « mistral-small-latest »)
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

/** Format (simplifié) de la réponse de l'API chat/completions de Mistral. */
interface MistralChatResponse {
  choices?: Array<{ message?: { content?: string } }>
}

export async function POST(request: NextRequest) {
  try {
    // Réservé aux administrateurs (JWT via cookie mk_session)
    const { response: authError } = await requireRole(request, ['admin'])
    if (authError) return authError

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

    // Clé API Mistral obligatoire
    const apiKey = process.env.MISTRAL_API_KEY?.trim()
    if (!apiKey) {
      console.error('[AI-ANALYZE] MISTRAL_API_KEY manquante dans le .env')
      return NextResponse.json(
        { error: 'Assistant IA non configuré : ajoutez votre clé Mistral (MISTRAL_API_KEY) dans le fichier .env, puis redémarrez l\'application.' },
        { status: 503 }
      )
    }

    const model = process.env.MISTRAL_VISION_MODEL?.trim() || 'pixtral-12b-2409'

    const prompt = `Tu es assistant merchandising pour MAISON KHAN, marque togolaise de chaussures et accessoires de luxe fabriqués artisanalement (cuir, raphia, perles).

Analyse la photo de cet article et renvoie UNIQUEMENT un objet JSON valide (aucun texte autour, pas de markdown) avec ces champs :
{
  "description": "description vendeuse de 2 à 3 phrases en français, ton luxe/artisanal, mentionnant la matière, la couleur et le style visibles sur la photo",
  "colorName": "nom français de la couleur DOMINANTE de l'article (ex: Noir, Camel, Doré, Terracotta, Ivoire, Bordeaux...)",
  "colorValue": "code hexadécimal approximatif de cette couleur dominante, format #RRGGBB"
}

Réponds uniquement avec le JSON.`

    // Appel à l'API Mistral (format compatible OpenAI, image en data URL base64)
    let response: Response
    try {
      response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: image }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(45_000)
      })
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        return NextResponse.json(
          { error: 'L\'analyse met trop de temps — réessayez dans un instant.' },
          { status: 504 }
        )
      }
      throw err
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      console.error(`[AI-ANALYZE] Mistral HTTP ${response.status}:`, detail.slice(0, 300))
      let error = 'L\'analyse a échoué, réessayez.'
      if (response.status === 401 || response.status === 403) {
        error = 'Clé API Mistral invalide — vérifiez MISTRAL_API_KEY dans le fichier .env.'
      } else if (response.status === 429) {
        error = 'Quota Mistral atteint — patientez un instant avant de réessayer.'
      } else if (response.status === 413 || response.status === 422) {
        error = 'Photo rejetée par l\'IA — essayez une image plus légère.'
      }
      return NextResponse.json({ error }, { status: 502 })
    }

    const completion = (await response.json()) as MistralChatResponse
    const content = completion.choices?.[0]?.message?.content
    if (!content) {
      console.error('[AI-ANALYZE] Réponse vide du modèle Mistral')
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
    console.log(`[AI-ANALYZE] Analyse réussie (${model}):`, analysis.colorName, analysis.colorValue)

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
