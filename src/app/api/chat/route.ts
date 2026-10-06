import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import ZAI from 'z-ai-web-dev-sdk'
import { buildLocalReply } from './local-fallback'

/**
 * MAISON KHAN — Assistant virtuel (chatbot de la section Contact).
 *
 * POST /api/chat
 * Body   : { messages: [{ role: 'user' | 'assistant', content: string }] }
 * Réponse: { reply: string }
 *
 * L'assistant « maîtrise le contenu du site » : à chaque requête, le contexte
 * est reconstruit depuis la base — catalogue produits réel (noms, couleurs,
 * tailles, prix, disponibilité) et contenus éditables (emails, téléphone…)
 * puis enrichi des connaissances statiques de la marque (savoir-faire,
 * paiements, livraisons, commandes internationales).
 *
 * Sécurité : rate limit 15 req / 3 min / IP, historique plafonné à 10 messages,
 * contenu plafonné à 2 000 caractères/message.
 */

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

const MAX_HISTORY = 10
const MAX_CONTENT = 2000
const MAX_PRODUCTS = 40

function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (m): m is ChatMessage =>
        m &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT) }))
}

/** Parse un champ JSON tolérant (sizes d'une couleur). */
function parseJsonArray(value: string | null | undefined): { size?: string; price?: number; stock?: number }[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Construit la fiche du catalogue réel, injectée dans le prompt système. */
async function buildCatalogContext(): Promise<string> {
  try {
    const products = await db.product.findMany({
      where: { isActive: true },
      include: { colors: true },
      take: MAX_PRODUCTS,
    })

    const lines = products.map((p) => {
      const colorNames = p.colors.map((c) => c.colorName).filter(Boolean)
      const sizeSet = new Set<string>()
      let minPrice = 0
      let totalStock = 0
      for (const c of p.colors) {
        for (const s of parseJsonArray(c.sizes)) {
          if (s.size) sizeSet.add(s.size)
          if (s.price && s.price > 0 && (minPrice === 0 || s.price < minPrice)) minPrice = s.price
          totalStock += s.stock || 0
        }
      }
      const sizes = Array.from(sizeSet).sort((a, b) => Number(a) - Number(b))
      const parts = [
        `- ${p.name} (${p.type === 'accessoire' ? 'accessoire' : 'chaussure'}${p.subCategory ? `, ${p.subCategory}` : ''}${p.genre ? `, ${p.genre}` : ''})`,
        colorNames.length ? `couleurs : ${colorNames.join(' / ')}` : null,
        sizes.length ? `tailles : ${sizes.join(', ')}` : null,
        minPrice > 0 ? `à partir de ${minPrice.toLocaleString('fr-FR')} XOF` : 'prix sur demande',
        totalStock > 0 ? (totalStock <= 3 ? `stock très limité (${totalStock})` : 'en stock') : 'sur demande',
      ].filter(Boolean)
      return parts.join(' — ')
    })

    return lines.length ? lines.join('\n') : '(catalogue vide actuellement)'
  } catch (e) {
    console.error('[chat] Erreur construction catalogue :', e)
    return '(catalogue indisponible)'
  }
}

/** Contenus éditables du site (contacts, textes). */
async function buildSiteContentContext(): Promise<string> {
  try {
    const entries = await db.siteContent.findMany()
    if (entries.length === 0) return ''
    return entries
      .map((c) => `- ${c.key} : ${String(c.value).slice(0, 200)}`)
      .join('\n')
  } catch {
    return ''
  }
}

function buildSystemPrompt(catalog: string, siteContent: string): string {
  return `Tu es l'assistant virtuel de MAISON KHAN, maison de chaussures et d'accessoires de luxe artisanaux, « Made in Africa », basée à Lomé (Togo). Tu conseilles les visiteurs de la boutique en ligne maison-khan.com.

━━━ IDENTITÉ & SAVOIR-FAIRE ━━━
- Chaussures et accessoires de luxe entièrement fabriqués à la main dans nos ateliers de Lomé.
- Quatre étapes : cuir sélectionné (peaux premium), coupe artisanale (découpe à la main), couture main (assemblage méticuleux), finition luxe (contrôle qualité rigoureux).
- « L'excellence artisanale africaine sur chaque pas que vous faites. »

━━━ CONTACT ━━━
- WhatsApp / téléphone : +228 70 16 67 67 (le canal privilégié pour toute demande personnelle).
- Email : contact@maison-khan.com (technique@maison-khan.com pour le support technique).
- Réseaux sociaux : TikTok (@maison..khan7), Instagram (@maisonkhanofficial).
${siteContent ? `\n━━━ CONTENUS DU SITE (modifiables par la boutique) ━━━\n${siteContent}\n` : ''}
━━━ CATALOGUE RÉEL DU SITE (à jour — source de vérité pour les prix, tailles, disponibilités) ━━━
${catalog}

━━━ PAIEMENT ━━━
- Paiement en ligne sécurisé par Mobile Money via PayDunya (Flooz, TMoney…), en francs CFA (XOF).
- La commande est préparée dès que le paiement est confirmé ; le client suit sa commande depuis son espace « Mon Compte » (email + notification à chaque étape).

━━━ LIVRAISON / RETRAIT ━━━
- Retrait en boutique : la commande « Prête » s'attend en boutique, il suffit de présenter le numéro de commande au comptoir.
- Livraison locale possible ; pour toute livraison spéciale, orienter vers WhatsApp.
- Commandes internationales : expédition possible, mais droits de douane et taxes d'importation restent À LA CHARGE DU CLIENT (frais d'envoi au transporteur, taxes selon le pays de destination). À lire attentivement avant de commander.

━━━ RÈGLES STRICTES ━━━
1. Réponds UNIQUEMENT en français, sur un ton élégant, chaleureux et professionnel, digne d'une maison de luxe — mais concis : 2 à 5 phrases, éventuellement une liste courte.
2. N'invente JAMAIS un prix, une taille, une couleur, un délai ou une disponibilité : utilise uniquement le CATALOGUE RÉEL ci-dessus. Si l'info est absente, dis-le et propose WhatsApp.
3. Pas de remises/promotions inventées ; pas d'engagement sur des délais de livraison précis.
4. Pour une commande très précise, une négociation, un conseil de pointure personnalisé ou un après-vente : oriente vers WhatsApp +228 70 16 67 67 ou la page produit (/produit/...).
5. Hors boutique (sujets généraux, code, politique…) : ramène avec élégance vers MAISON KHAN.
6. Ne demande jamais de données personnelles (mot de passe, code de paiement…) ; n'évoque jamais les données internes (base de données, administration).
7. Écris les montants comme « 45 000 XOF ». Jamais de markdown lourd (pas de tableaux) ; gras et listes courtes autorisés.`
}

export async function POST(request: NextRequest) {
  try {
    // ── Rate limit : 15 requêtes / 3 min / IP ──
    const ip = getClientIp(request)
    const rl = rateLimit(`chat:${ip}`, 15, 3 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Trop de messages, patientez un instant.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
      )
    }

    // ── Historique validé ──
    const body = await request.json().catch(() => ({}))
    const history = sanitizeHistory(body?.messages)
    const lastUser = [...history].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      return NextResponse.json({ error: 'Message requis' }, { status: 400 })
    }

    // ── Contexte du site reconstruit à chaque requête ──
    const [catalog, siteContent] = await Promise.all([
      buildCatalogContext(),
      buildSiteContentContext(),
    ])
    const systemPrompt = buildSystemPrompt(catalog, siteContent)

    // ── Appel LLM, avec repli local si le moteur n'est pas disponible ──
    // (ex. VPS sans .z-ai-config : l'assistant répond alors en mode dégradé
    //  depuis les connaissances réelles de la boutique + le catalogue en base)
    let reply: string | null = null
    try {
      const zai = await ZAI.create()
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: m.content })),
        ],
        thinking: { type: 'disabled' },
      })
      reply = completion.choices[0]?.message?.content?.trim() || null
    } catch {
      reply = null // moteur IA indisponible → mode dégradé local
    }
    if (!reply) {
      console.warn('[chat] Moteur IA indisponible — réponse locale (catalogue réel)')
      reply = buildLocalReply(lastUser.content, catalog)
    }

    return NextResponse.json({ reply })
  } catch (error) {
    console.error('[chat] Erreur :', error)
    return NextResponse.json(
      { error: 'Une erreur est survenue, réessayez.' },
      { status: 500 }
    )
  }
}
