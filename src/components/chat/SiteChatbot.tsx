'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * MAISON KHAN — Assistant virtuel (section Contact).
 *
 * Chatbot « super intelligent » relié à /api/chat : le backend reconstruit
 * à chaque requête le contexte réel du site (catalogue, contenus) et le
 * transmet au LLM. Ce composant est purement front : historique local,
 * envoi, indicateur de frappe, suggestions de questions, zone messages
 * défilante (max-h-96, scrollbar fine) et retour à WhatsApp en cas d'erreur.
 *
 * Photos & liens : quand la réponse cite des articles, l'API renvoie leur
 * liste (`products`) et chaque carte s'affiche sous la bulle — photo, nom,
 * prix et lien direct vers la fiche /produit/{id}. Les photos viennent de la
 * liste des produits déjà chargée par la page (aucun téléchargement en plus).
 */

interface ChatProductCard {
  id: string
  name: string
  price: number // 0 = prix sur demande
  url: string // fiche produit /produit/{id}
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Articles cités dans cette réponse (cartes photo + lien). */
  products?: ChatProductCard[]
}

/** Produits du site (déjà chargés par la page) — source des photos des cartes. */
interface ProductSource {
  id: string
  name: string
  image: string
  minPrice: number
}

function formatPrice(n: number): string {
  return n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')
}

const SUGGESTIONS = [
  'Quels sont vos modèles disponibles ?',
  'Comment puis-je payer ma commande ?',
  'Livrez-vous à l\u2019international ?',
  'Où se trouve votre atelier ?',
]

const GREETING =
  'Bonjour, je suis l\u2019assistant virtuel de MAISON KHAN. Je peux vous renseigner sur nos créations, les tailles, les paiements ou les livraisons. Comment puis-je vous aider ?'

export default function SiteChatbot({ products = [] }: { products?: ProductSource[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Photos des cartes : lookup id → image depuis les produits déjà chargés
  // par la page (aucune requête réseau supplémentaire).
  const imageById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of products) if (p.id && p.image) map.set(p.id, p.image)
    return map
  }, [products])

  // Scroll automatique vers le bas à chaque nouveau message
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim().slice(0, 1000)
      if (!clean || loading) return

      const history = [...messages, { role: 'user' as const, content: clean }]
      setMessages(history)
      setInput('')
      setError(null)
      setLoading(true)

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.reply) {
          throw new Error(data?.error || 'Réponse indisponible')
        }
        // Cartes des articles cités (photo + lien) — validation défensive
        const cards: ChatProductCard[] = (Array.isArray(data.products) ? data.products : [])
          .filter(
            (p: unknown): p is ChatProductCard =>
              !!p &&
              typeof p === 'object' &&
              typeof (p as ChatProductCard).id === 'string' &&
              typeof (p as ChatProductCard).name === 'string' &&
              typeof (p as ChatProductCard).url === 'string' &&
              typeof (p as ChatProductCard).price === 'number'
          )
          .slice(0, 6)
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.reply, products: cards.length > 0 ? cards : undefined },
        ])
      } catch (e) {
        console.error('[chatbot] Erreur :', e)
        setError(
          'Une erreur est survenue. Réessayez, ou écrivez-nous directement sur WhatsApp (+228 70 16 67 67).'
        )
      } finally {
        setLoading(false)
      }
    },
    [messages, loading]
  )

  return (
    <div
      className="border border-[#E5E0DA] bg-white rounded-sm overflow-hidden text-left"
      aria-label="Assistant virtuel MAISON KHAN"
    >
      {/* En-tête */}
      <div className="flex items-center gap-3 px-5 py-4 bg-[#0A0A0A] text-[#F8F6F3]">
        <span
          className="flex items-center justify-center w-9 h-9 rounded-full bg-[#9C7C5C]/20 border border-[#9C7C5C]/50 text-[#C4A77D] font-display text-lg"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
          aria-hidden="true"
        >
          ✦
        </span>
        <div>
          <p
            className="text-base leading-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Assistant MAISON KHAN
          </p>
          <p className="text-[11px] uppercase tracking-widest text-[#9C9A92]">
            {loading ? 'écrit…' : 'Conseiller virtuel — répond en français'}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        className="max-h-96 overflow-y-auto px-4 py-5 space-y-4 bg-[#F8F6F3] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-[#E5E0DA] [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        {/* Message d'accueil (local, non envoyé à l'IA) */}
        <div className="flex gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#9C7C5C]/10 border border-[#9C7C5C]/40 text-[#9C7C5C] text-xs flex items-center justify-center" aria-hidden="true">✦</span>
          <p
            className="bg-white border border-[#E5E0DA] rounded-sm px-4 py-3 text-sm text-[#191817] leading-relaxed max-w-[85%]"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px' }}
          >
            {GREETING}
          </p>
        </div>

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="bg-[#0A0A0A] text-[#F8F6F3] rounded-sm px-4 py-3 text-sm leading-relaxed max-w-[85%]">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#9C7C5C]/10 border border-[#9C7C5C]/40 text-[#9C7C5C] text-xs flex items-center justify-center" aria-hidden="true">✦</span>
              <div className="flex flex-col gap-2 min-w-0 max-w-[85%]">
                <p
                  className="bg-white border border-[#E5E0DA] rounded-sm px-4 py-3 text-sm text-[#191817] leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px' }}
                >
                  {m.content}
                </p>
                {/* Cartes des articles cités : photo + nom + prix → fiche produit */}
                {m.products && m.products.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {m.products.map((card) => {
                      const img = imageById.get(card.id)
                      return (
                        <Link
                          key={card.id}
                          href={card.url}
                          aria-label={`Voir la fiche de ${card.name}`}
                          className="flex items-center gap-3 bg-white border border-[#E5E0DA] rounded-sm p-2 hover:border-[#9C7C5C] transition-colors group"
                        >
                          {img ? (
                            <img
                              src={img}
                              alt={card.name}
                              className="w-16 h-16 object-cover rounded-sm flex-shrink-0"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://placehold.co/200x200/E5E0DA/9C7C5C?text=MK'
                              }}
                            />
                          ) : (
                            <span
                              className="w-16 h-16 rounded-sm flex-shrink-0 bg-[#9C7C5C]/10 border border-[#9C7C5C]/30 flex items-center justify-center text-[#9C7C5C] text-lg"
                              aria-hidden="true"
                            >
                              ✦
                            </span>
                          )}
                          <span className="flex-1 min-w-0">
                            <span
                              className="block text-[#191817] leading-snug truncate"
                              style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px' }}
                            >
                              {card.name}
                            </span>
                            <span className="block text-xs text-[#9C7C5C] mt-0.5">
                              {card.price > 0 ? `${formatPrice(card.price)} XOF` : 'Prix sur demande'}
                            </span>
                          </span>
                          <span
                            className="text-xs text-[#9C7C5C] flex-shrink-0 group-hover:translate-x-0.5 transition-transform"
                            aria-hidden="true"
                          >
                            Voir →
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* Indicateur de frappe */}
        {loading && (
          <div className="flex gap-3" aria-label="L'assistant écrit">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#9C7C5C]/10 border border-[#9C7C5C]/40 text-[#9C7C5C] text-xs flex items-center justify-center" aria-hidden="true">✦</span>
            <div className="bg-white border border-[#E5E0DA] rounded-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 150, 300].map((d) => (
                <span
                  key={d}
                  className="w-1.5 h-1.5 rounded-full bg-[#9C7C5C] animate-bounce"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Suggestions (état vide) */}
        {messages.length === 0 && !loading && (
          <div className="pt-1">
            <p className="text-[11px] uppercase tracking-widest text-[#9C9A92] mb-3">Suggestions</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-xs border border-[#E5E0DA] bg-white text-[#6B6560] px-3 py-2 rounded-sm hover:border-[#9C7C5C] hover:text-[#9C7C5C] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Zone de saisie */}
      <div className="border-t border-[#E5E0DA] bg-white px-4 py-3">
        {error && <p className="text-xs text-[#B91C1C] mb-2">{error}</p>}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
        >
          <label htmlFor="mk-chat-input" className="sr-only">Votre message</label>
          <input
            id="mk-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écrivez votre message…"
            maxLength={1000}
            autoComplete="off"
            className="flex-1 border border-[#E5E0DA] rounded-sm px-3 py-2.5 text-sm text-[#191817] bg-[#F8F6F3] placeholder:text-[#9C9A92] focus:outline-none focus:border-[#9C7C5C]"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 rounded-sm bg-[#9C7C5C] text-white text-sm uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '…' : 'Envoyer'}
          </button>
        </form>
      </div>
    </div>
  )
}
