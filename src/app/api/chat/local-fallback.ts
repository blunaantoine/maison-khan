/**
 * Assistant local MAISON KHAN — moteur conversationnel autonome.
 *
 * Utilisé quand le moteur IA (z-ai-web-dev-sdk) n'est pas disponible — c'est le
 * cas sur le VPS de production, où le service ne répond pas. Plutôt qu'un
 * simple moteur de mots-clés, ce module embarque un vrai mini-assistant :
 *
 *   – Recherche dans le CATALOGUE RÉEL : par type (sandales, mules…), genre,
 *     couleur, taille précise, budget (« j'ai 60 000 FCFA »), nom de modèle.
 *   – Mémoire de conversation : « et pour homme ? », « c'est combien ? »,
 *     « la première ? », « elle est disponible ? » sont compris en contexte.
 *   – Formulations variées (pas deux salutations identiques), ton luxe, concis.
 *   – Zéro invention : chaque prix / couleur / taille / stock vient de la base.
 *
 * Mêmes règles que le prompt LLM : français, élégant, concis ; si l'info
 * manque → on le dit et on propose WhatsApp.
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CatalogProduct {
  id: string
  name: string
  type: string // 'chaussure' | 'accessoire'
  subCategory: string | null
  genre: string | null
  colors: string[]
  sizes: string[]
  minPrice: number // 0 = prix sur demande
  totalStock: number
}

const WHATSAPP = '+228 70 16 67 67'

// ────────────────────────────── utilitaires ──────────────────────────────

/** Normalise : minuscules, sans accents, apostrophes droites, espaces uniques. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** Tokens alphabétiques/numériques d'une phrase normalisée. */
function tokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Singulier approximatif (français) : « sandales » → « sandale ». */
function singular(t: string): string {
  return t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t
}

function fmtPrice(n: number): string {
  return n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')
}

/** Choisit une variante de façon stable pour un même message (anti-répétition). */
function pick(variants: string[], seed: string): string {
  let h = 7
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return variants[h % variants.length]
}

function has(q: string, ...words: string[]): boolean {
  return words.some((w) => q.includes(w))
}

function stockLabel(total: number): string {
  if (total <= 0) return 'sur demande'
  if (total <= 3) return `stock très limité (${total})`
  return 'en stock'
}

function typeLabel(p: CatalogProduct): string {
  const sub = p.subCategory ? ` ${singular(norm(p.subCategory))}` : ''
  const genre = p.genre ? ` ${norm(p.genre)}` : ''
  return `${p.type === 'accessoire' ? 'accessoire' : 'chaussure'}${sub}${genre}`
}

/** Fiche produit courte pour une bulle de chat. */
function productLine(p: CatalogProduct, withStock = true): string {
  const parts = [
    `- ${p.name} (${typeLabel(p)})`,
    p.colors.length ? `couleurs : ${p.colors.join(' / ')}` : null,
    p.sizes.length ? `tailles : ${p.sizes.join(', ')}` : null,
    p.minPrice > 0 ? `${fmtPrice(p.minPrice)} XOF` : 'prix sur demande',
    withStock ? stockLabel(p.totalStock) : null,
  ]
  return parts.filter(Boolean).join(' — ')
}

/** Liste plafonnée à 4 lignes + mention du reste. */
function productList(list: CatalogProduct[], withStock = true): string {
  const shown = list.slice(0, 4).map((p) => productLine(p, withStock)).join('\n')
  const rest = list.length - 4
  return rest > 0 ? `${shown}\n… et ${rest} autre${rest > 1 ? 's' : ''} modèle${rest > 1 ? 's' : ''} dans la boutique` : shown
}

// ─────────────────────────── extraction d'entités ───────────────────────────

interface Entities {
  products: CatalogProduct[] // modèles cités par leur nom
  type: string | null // chaussure | accessoire
  subCategory: string | null // sandale, mule, bottine, sac…
  genre: string | null // femme | homme
  color: string | null // clé de famille (beige, dore, noir…)
  colorGroup: string[] | null // teintes du catalogue acceptées
  size: string | null // « 39 », « 40 »…
  budget: number | null // XOF
  ordinal: number | null // « la première » → 0
  cheapest: boolean
}

/** Familles de couleurs : mot du visiteur → groupe de teintes proches du catalogue. */
const COLOR_SYNONYMS: Record<string, string[]> = {
  noir: ['noir'],
  marron: ['marron', 'brun', 'cafe', 'chocolat'],
  beige: ['beige', 'ivoire', 'ecru', 'creme', 'sable', 'champagne'],
  ivoire: ['ivoire', 'beige', 'ecru'],
  creme: ['beige', 'ivoire', 'creme'],
  ecru: ['beige', 'ivoire', 'ecru'],
  blanc: ['blanc', 'ivoire'],
  rouge: ['rouge', 'bordeaux', 'grenat', 'carmin'],
  bordeaux: ['bordeaux', 'rouge'],
  grenat: ['grenat', 'rouge'],
  or: ['dore', 'or', 'bronze', 'gold'],
  dore: ['dore', 'or', 'bronze'],
  gold: ['dore', 'or'],
  bronze: ['bronze', 'dore'],
  argent: ['argent', 'silver', 'gris'],
  gris: ['gris', 'argent'],
  rose: ['rose', 'fushia'],
  bleu: ['bleu', 'marine'],
  vert: ['vert', 'emeraude', 'kaki'],
  violet: ['violet', 'mauve', 'lilas'],
  jaune: ['jaune', 'moutarde'],
}

/** Mots-clés de types / sous-catégories : mot du visiteur → prédicat. */
const SUBCATEGORY_WORDS: Record<string, string> = {
  sandale: 'sandale', mule: 'mule', ballerine: 'ballerine', escarpin: 'escarpin',
  bottine: 'bottine', bottes: 'botte', botte: 'botte', mocassin: 'mocassin',
  sac: 'sac', bandouliere: 'sac',
}

function extractEntities(q: string, catalog: CatalogProduct[]): Entities {
  const toks = tokens(q)
  const e: Entities = {
    products: [], type: null, subCategory: null, genre: null,
    color: null, colorGroup: null, size: null, budget: null, ordinal: null, cheapest: false,
  }

  // ── modèles cités par nom (le nom, ou un mot distinctif ≥ 4 lettres, apparaît) ──
  for (const p of catalog) {
    const pName = norm(p.name)
    if (q.includes(pName)) { e.products.push(p); continue }
    const nameToks = tokens(p.name).filter((t) => t.length >= 4 && !SUBCATEGORY_WORDS[t])
    if (nameToks.length > 0 && nameToks.some((t) => toks.includes(t))) e.products.push(p)
  }

  for (const t of toks) {
    const s = singular(t)
    if (s === 'femme' || s === 'fille' || s === 'dame' || s === 'feminin' || s === 'madame') e.genre = 'femme'
    if (s === 'homme' || s === 'garcon' || s === 'masculin' || s === 'monsieur') e.genre = 'homme'
    if (e.genre === null && (s === 'mixte' || s === 'unisexe')) e.genre = 'mixte'
    if (COLOR_SYNONYMS[t] && !e.color) {
      e.color = t
      e.colorGroup = COLOR_SYNONYMS[t]
    }
    if (SUBCATEGORY_WORDS[s]) e.subCategory = SUBCATEGORY_WORDS[s]
    if (s === 'chaussure' || s === 'chaussures' || s === 'soulier') e.type = 'chaussure'
    if (s === 'accessoire' || s === 'accessoires' || s === 'bijou') e.type = 'accessoire'
    if (s === 'sac') { e.type = 'accessoire'; e.subCategory = 'sac' }
    if (t === 'premier' || t === 'premiere' || t === '1ere' || t === '1er') e.ordinal = 0
    if (t === 'deuxieme' || t === '2eme') e.ordinal = 1
    if (t === 'troisieme' || t === '3eme') e.ordinal = 2
    if (t === 'dernier' || t === 'derniere') e.ordinal = -1
  }

  // ── taille explicite : « taille 39 », « pointure 40 », ou nombre isolé 35–46 ──
  const explicit = q.match(/(?:taille|pointure)\s*(\d{2})\b/)
  if (explicit) e.size = explicit[1]
  else {
    const n = toks.find((t) => /^(3[5-9]|4[0-6])$/.test(t))
    if (n && has(q, 'taille', 'pointure', 'chaussure', 'sandale', 'mule', 'escarpin', 'bottine', 'ballerine', 'mocassin', 'porter', 'met', 'fais')) e.size = n
  }

  // ── budget : nécessite un contexte montant (devise ou mot de budget) ──
  const kMatch = q.match(/(\d+(?:[.,]\d+)?)\s*k\b/)
  const amountMatch = q.match(/\b(\d{1,3}(?:[ .]\d{3})+|\d{4,7})\b/)
  const budgetCtx = has(q, 'budget', 'moins', 'max', 'jusqu', 'environ', 'autour', 'pas plus', 'dispo', 'moyens')
  if (kMatch && budgetCtx) e.budget = Math.round(parseFloat(kMatch[1].replace(',', '.')) * 1000)
  else if (amountMatch && (budgetCtx || has(q, 'xof', 'fcfa', 'cfa', 'franc'))) {
    const v = parseInt(amountMatch[1].replace(/[ .]/g, ''), 10)
    if (v >= 5000 && v <= 2_000_000) e.budget = v
  }

  if (has(q, 'moins cher', 'le moins')) e.cheapest = true
  return e
}

// ─────────────────────────── recherche catalogue ───────────────────────────

function matchesType(p: CatalogProduct, e: Entities): boolean {
  if (e.subCategory) {
    const sub = singular(norm(p.subCategory || ''))
    const nameToks = tokens(p.name).map(singular)
    return sub === singular(e.subCategory) || nameToks.includes(singular(e.subCategory))
  }
  if (e.type) return norm(p.type).includes(e.type)
  return true
}

function searchProducts(e: Entities, catalog: CatalogProduct[]): CatalogProduct[] {
  let list = catalog.filter((p) => matchesType(p, e))
  if (e.genre) list = list.filter((p) => norm(p.genre || '').includes(e.genre))
  if (e.color) {
    const group = (e.colorGroup || [e.color]).map(singular)
    list = list.filter((p) =>
      p.colors.some((c) => {
        const ctoks = tokens(c).map(singular)
        return ctoks.some((ct) => group.includes(ct))
      })
    )
  }
  if (e.size) list = list.filter((p) => p.sizes.includes(e.size))
  if (e.budget !== null) {
    const ok = list.filter((p) => p.minPrice > 0 && p.minPrice <= e.budget!)
    if (ok.length > 0) list = ok.sort((a, b) => a.minPrice - b.minPrice)
    else if (e.budget >= 30_000) {
      // budget un peu court : montrer les plus abordables plutôt que rien
      const sorted = [...catalog].filter((p) => p.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice)
      return sorted.slice(0, 2)
    }
  }
  if (e.cheapest) {
    const withPrice = list.filter((p) => p.minPrice > 0)
    if (withPrice.length > 0) {
      const min = Math.min(...withPrice.map((p) => p.minPrice))
      return withPrice.filter((p) => p.minPrice === min)
    }
  }
  return list
}

/** Produits mentionnés dans la dernière réponse de l'assistant (mémoire). */
function productsFromLastReply(text: string, catalog: CatalogProduct[]): CatalogProduct[] {
  if (!text) return []
  const nt = norm(text)
  return catalog.filter((p) => nt.includes(norm(p.name)))
}

// ─────────────────────────── réponse par intention ───────────────────────────

function productFocus(p: CatalogProduct, q: string): string {
  const priceAsked = has(q, 'combien', 'prix', 'coute', 'tarif')
  const stockAsked = has(q, 'disponible', 'dispo', 'stock', 'reste')
  const sizeAsked = has(q, 'taille', 'pointure')
  const head = priceAsked
    ? `${p.name} est à ${fmtPrice(p.minPrice)} XOF`
    : stockAsked
      ? `${p.name} — ${stockLabel(p.totalStock)}`
      : `Voici ${p.name}`
  const details: string[] = []
  if (!priceAsked && p.minPrice > 0) details.push(`${fmtPrice(p.minPrice)} XOF`)
  if (p.colors.length) details.push(`couleurs : ${p.colors.join(' / ')}`)
  if (p.sizes.length && (sizeAsked || !priceAsked)) details.push(`tailles : ${p.sizes.join(', ')}`)
  const tail = details.length ? ` (${details.join(' · ')})` : ''
  return `${head}${tail}. La fiche produit affiche les disponibilités en temps réel — et pour un conseil personnalisé, nos artisans sont sur WhatsApp (${WHATSAPP}).`
}

function searchReply(e: Entities, results: CatalogProduct[], seed: string, catalog: CatalogProduct[]): string {
  if (results.length === 1) return productFocus(results[0], 'detail')
  if (results.length > 1) {
    const intro = e.budget !== null
      ? pick([`Dans votre budget (≤ ${fmtPrice(e.budget)} XOF) :`, `À ${fmtPrice(e.budget)} XOF ou moins :`], seed)
      : e.color
        ? pick([`Nos créations aux teintes ${e.color} :`, `Voici ce que nous avons en ${e.color} :`], seed)
        : e.genre
          ? pick([`Voici nos créations ${e.genre === 'homme' ? 'pour homme' : e.genre === 'femme' ? 'pour femme' : 'mixtes'} :`, `Pour ${e.genre} :`], seed)
          : e.size
            ? `En taille ${e.size}, il nous reste :`
            : pick(['Voici ce qui correspond à votre recherche ✨', 'Nos modèles correspondants :', 'Avec plaisir, voici :'], seed)
    return `${intro}\n${productList(results)}\nSouhaitez-vous une précision sur l'un d'eux ? (couleur, taille, prix)`
  }
  // rien trouvé → suggestions du catalogue
  const examples = catalog.slice(0, 2).map((p) => productLine(p, false)).join('\n')
  return `Je n'ai rien trouvé de tout à fait correspondant 😔 Voici quelques-unes de nos créations :\n${examples}\nDites-moi vos envies (type, couleur, budget) — ou écrivez-nous sur WhatsApp (${WHATSAPP}) pour une recherche sur mesure.`
}

// ────────────────────────────── intentions ──────────────────────────────

export function buildLocalReply(history: ChatTurn[], catalog: CatalogProduct[]): string {
  const lastUserTurn = [...history].reverse().find((m) => m.role === 'user')
  const userMsg = lastUserTurn?.content ?? ''
  const q = ` ${norm(userMsg)} `
  const seed = `${userMsg}|${history.length}`

  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
  const lastProducts = productsFromLastReply(lastAssistant, catalog)

  if (!userMsg.trim()) return genericReply(catalog, seed)

  const e = extractEntities(q, catalog)

  // ── remerciements / politesses courtes ──
  if (q.length < 70 && has(q, 'merci') && !has(q, '?', 'combien', 'prix')) {
    return pick([
      `Avec grand plaisir ✨ Je reste à votre disposition pour le catalogue, les tailles ou une commande.`,
      `C'est un plaisir de vous conseiller ✨ D'autres questions sur nos créations ?`,
      `Merci à vous ! N'hésitez pas si je peux encore vous aider (modèles, tailles, livraison…).`,
    ], seed)
  }
  if (q.length < 60 && has(q, 'au revoir', 'bye', 'a bientot', 'ciao', 'bonne journee', 'bonne soiree')) {
    return `Au revoir et à très bientôt chez MAISON KHAN ✨ « L'excellence artisanale africaine sur chaque pas que vous faites. »`
  }

  // ── qui es-tu / es-tu un robot ──
  if (has(q, 'qui es tu', 'qui etes vous', 'es tu un robot', 'tu es un robot', 'es tu humain', 'tu es reel', 'es tu une ia', 'es tu une intelligence')) {
    return `Je suis l'assistant virtuel de MAISON KHAN ✨ Je vous conseille sur nos créations (modèles, prix, tailles, disponibilités), les paiements PayDunya et les livraisons. Pour tout le reste — conseils d'artisan, commandes sur mesure, après-vente — mes collègues humains vous répondent sur WhatsApp (${WHATSAPP}).`
  }

  // ── modèle cité par son nom ──
  if (e.products.length > 0 && e.products.length <= 3) {
    if (e.products.length === 1) return productFocus(e.products[0], q)
    return `Voici les détails :\n${productList(e.products)}\nUne question sur l'un de ces modèles (taille, couleur, disponibilité) ?`
  }

  // ── suivi conversationnel : « et pour homme ? », « c'est combien ? », « la première ? » ──
  const followUpOnly = has(q, 'et ', 'et le', 'et la', 'eux aussi', 'la meme') || q.length < 45
  if (e.ordinal !== null && lastProducts.length > 0) {
    const idx = e.ordinal === -1 ? lastProducts.length - 1 : e.ordinal
    const p = lastProducts[Math.min(idx, lastProducts.length - 1)]
    if (p) return productFocus(p, q)
  }
  const priceFollowUp = has(q, 'combien', 'prix', 'coute') && q.length < 60 && lastProducts.length > 0
  if (priceFollowUp && e.genre === null && e.color === null && e.size === null && e.subCategory === null && e.type === null) {
    return `Bien sûr :\n${productList(lastProducts)}\nChaque fiche produit détaille les couleurs et disponibilités en temps réel.`
  }
  const stockFollowUp = has(q, 'disponible', 'dispo', 'stock', 'reste t il', 'reste-t-il') && q.length < 60 && lastProducts.length > 0
  if (stockFollowUp && e.genre === null && e.color === null && e.size === null && e.subCategory === null && e.type === null) {
    return `Voici l'état des stocks :\n${productList(lastProducts)}\nLes pièces très limitées partent vite — pour réserver la vôtre : WhatsApp ${WHATSAPP}.`
  }
  if (followUpOnly && e.genre !== null && e.color === null && e.size === null) {
    const inLast = lastProducts.filter((p) => norm(p.genre || '').includes(e.genre!))
    const base = inLast.length > 0 ? inLast : catalog
    const results = base.filter((p) => norm(p.genre || '').includes(e.genre!) && matchesType(p, e))
    if (results.length > 0) {
      return `${e.genre === 'homme' ? 'Pour homme' : 'Pour femme'}, voici nos créations :\n${productList(results)}\nSouhaitez-vous une précision (couleur, taille, prix) ?`
    }
  }

  // ── recherche catalogue (entités détectées) ──
  if (e.products.length > 3 || e.subCategory || e.color || e.size || (e.budget !== null) || (e.genre !== null && has(q, 'homme', 'femme', 'mixte', 'homme)', 'fille', 'garcon', 'dame', 'madame')) || e.cheapest) {
    const results = e.products.length > 3 ? e.products : searchProducts(e, catalog)
    if (results.length > 0 || e.budget !== null || e.color || e.size) {
      return searchReply(e, results, seed, catalog)
    }
  }

  // ── suivi de commande ──
  if (has(q, 'suivi', 'suivre', 'statut', 'ou en est', 'ou est ma commande', 'etat de ma commande', 'ma commande est', 'numero de commande')) {
    return `Vous suivez votre commande en temps réel depuis votre espace « Mon Compte » — un email et une notification vous sont envoyés à chaque étape (confirmée, en préparation, prête, livrée), avec l'historique de vos achats. Pour une commande en particulier : WhatsApp ${WHATSAPP} avec votre numéro de commande.`
  }

  // ── retours / échanges / après-vente ──
  if (has(q, 'retour', 'echange', 'rembourse', 'apres-vente', 'apres vente', 'casse', 'defectueux', 'abime', 'probleme avec', 'reclamation')) {
    return `Nous sommes désolés pour ce désagrément. Pour tout échange, remboursement ou demande après-vente, contactez-nous sur WhatsApp (${WHATSAPP}) avec votre numéro de commande : notre équipe étudiera la meilleure solution avec vous, en toute transparence.`
  }

  // ── paiement ──
  if (has(q, 'paiement', 'payer', 'paye', ' paie', 'paydunya', 'mobile money', 'flooz', 'tmoney', 'wave', 'carte', 'especes', 'virement', 'reglement', 'regler', 'credit')) {
    return `Le paiement s'effectue en ligne de façon sécurisée via PayDunya — Mobile Money (Flooz, TMoney…) en francs CFA (XOF). Votre commande est préparée dès confirmation du paiement, et vous suivez chaque étape depuis « Mon Compte » (email + notification à chaque mise à jour). Une question sur un paiement ? WhatsApp : ${WHATSAPP}.`
  }

  // ── livraison / international / douanes ──
  if (has(q, 'livraison', 'livrer', 'livre', 'expedi', 'international', 'etranger', 'douane', 'colis', 'delai', 'frais de port', 'shipping', 'emballage', 'cadeau wrap')) {
    return `Nous préparons chaque commande dès confirmation du paiement. Le retrait en boutique est possible dès que votre commande est « Prête » (présentez votre numéro de commande), et la livraison locale à Lomé peut être organisée. Les commandes internationales sont expédiées, mais les droits de douane et taxes d'importation restent à la charge du client. Pour une livraison spéciale : WhatsApp ${WHATSAPP}.`
  }

  // ── retrait / localisation / boutique ──
  if (has(q, 'retrait', 'retirer', 'boutique', 'magasin', 'ou etes vous', 'ou vous trouvez', 'adresse', 'localisation', 'situe', 'venir')) {
    return `Notre atelier-boutique est à Lomé, au Togo 🇹🇬 Le retrait en boutique est possible dès que votre commande est « Prête » — présentez simplement votre numéro de commande. Pour l'adresse exacte et organiser votre visite : WhatsApp ${WHATSAPP}.`
  }

  // ── horaires ──
  if (has(q, 'horaire', 'heures', 'ouvert', 'ouvre', 'ferme', 'quand etes vous')) {
    return `Nous vous accueillons et répondons sur WhatsApp du lundi au samedi. Pour être certain de trouver l'équipe disponible : ${WHATSAPP} — nous organisons aussi les retraits de commandes sur rendez-vous.`
  }

  // ── contact ──
  if (has(q, 'contact', 'telephone', 'whatsapp', 'appeler', 'joindre', 'email', 'mail', 'numero')) {
    return `Vous pouvez nous joindre du lundi au samedi : 📞 WhatsApp / téléphone ${WHATSAPP} · ✉️ contact@maison-khan.com. Nous sommes aussi sur TikTok (@maison..khan7) et Instagram (@maisonkhanofficial). Notre atelier est à Lomé, au Togo.`
  }

  // ── réseaux sociaux ──
  if (has(q, 'instagram', 'tiktok', 'reseau', 'facebook', 'snapchat', 'suivre')) {
    return `Suivez nos coulisses sur TikTok (@maison..khan7) et Instagram (@maisonkhanofficial) ✨ Vous y verrez les créations, l'atelier de Lomé et nos nouveautés en avant-première.`
  }

  // ── entretien / matières ──
  if (has(q, 'entretien', 'entretenir', 'nettoyer', 'nettoyage', 'cirage', 'cirer', 'proteger', 'impermeabiliser', 'matiere', 'materiau', 'cuir', 'peau', 'tissu')) {
    return `Nos créations sont travaillées à partir de cuirs sélectionnés (peaux premium) et assemblées à la main dans notre atelier de Lomé. Pour l'entretien d'une pièce en particulier — nettoyage, cirage, protection — nos artisans vous donnent les bons gestes avec plaisir sur WhatsApp (${WHATSAPP}).`
  }

  // ── savoir-faire / marque ──
  if (has(q, 'atelier', 'artisan', 'fabriqu', 'fait main', 'fait a la main', 'savoir-faire', 'savoir faire', 'handmade', 'marque', 'histoire', 'qui etes', 'maison khan', 'lome', 'togo', 'africa', 'afrique', 'fabrique ou', 'confectionne')) {
    return `MAISON KHAN est une maison de chaussures et d'accessoires de luxe entièrement fabriqués à la main dans nos ateliers de Lomé, au Togo. Chaque pièce suit quatre étapes : cuir sélectionné (peaux premium), coupe artisanale à la main, couture main méticuleuse et finition luxe avec contrôle qualité rigoureux. « L'excellence artisanale africaine sur chaque pas que vous faites. » ✨`
  }

  // ── sur mesure / personnalisation ──
  if (has(q, 'sur mesure', 'personnali', 'custom', 'commande speciale', 'ma propre', 'a mon gout', 'coudre')) {
    return `Oui, la commande sur mesure fait partie de notre ADN d'atelier ✨ Décrivez-nous votre projet (modèle, cuir, couleur, taille) sur WhatsApp (${WHATSAPP}) : nos artisans étudient chaque demande et vous accompagnent personnellement.`
  }

  // ── promotions ──
  if (has(q, 'promotion', 'reduction', 'remise', 'solde', 'promo', 'code promo', 'destockage')) {
    return `Nos prix reflètent le travail artisanal de nos créations, et chaque offre éventuelle est affichée directement sur les fiches produits. Pour un projet particulier ou une commande spéciale, nos équipes vous répondent sur WhatsApp (${WHATSAPP}).`
  }

  // ── conseils / recommandations / cadeaux ──
  if (has(q, 'conseil', 'conseille', 'recommand', 'suggere', 'idee', 'cadeau', 'offrir', 'inspire', 'quelle creation', 'que me conseillez')) {
    const inStock = catalog.filter((p) => p.totalStock > 0).slice(0, 3)
    const forWho = e.genre === 'homme' ? 'pour homme' : e.genre === 'femme' ? 'pour femme' : ''
    if (inStock.length > 0) {
      return `Avec plaisir ✨ Voici quelques-unes de nos créations disponibles ${forWho ? forWho + ' ' : ''}:\n${productList(inStock)}\nDites-moi vos envies (type, couleur, budget, taille) et j'affine la sélection — exemple : « sandales en 39 » ou « budget 60 000 FCFA ».`
    }
  }

  // ── conseil taille (sans taille précise) ──
  if (has(q, 'taille', 'pointure', 'crampon', 'mesure', 'chausse')) {
    return `Chaque modèle propose ses propres tailles — consultez le sélecteur sur la page du produit qui vous intéresse (disponibilités en temps réel). Pour un conseil de pointure personnalisé, nos artisans vous répondent avec plaisir sur WhatsApp (${WHATSAPP}). Vous pouvez aussi me demander directement : « qu'avez-vous en taille 39 ? »`
  }

  // ── prix génériques / catalogue ──
  if (has(q, 'prix', 'combien', 'coute', 'tarif', 'catalogue', 'modele', 'modeles', 'disponible', 'ce que vous avez', 'vous avez', 'vendez', 'proposez', 'creation', 'creations', 'nouveaute', 'stock')) {
    if (lastProducts.length > 0 && has(q, 'prix', 'combien', 'coute')) {
      return `Les voici avec leurs prix :\n${productList(lastProducts)}\nChaque fiche produit détaille couleurs et disponibilités en temps réel.`
    }
    return `${pick(['Voici notre catalogue du moment ✨', 'Avec plaisir, voici nos créations :', 'Nos modèles actuels :'], seed)}\n${productList(catalog)}\nDites-moi vos envies (type, couleur, budget, taille) et j'affine — ou demandez-moi par modèle.`
  }

  // ── salutations (messages courts sans autre intention) ──
  if (has(q, 'bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'bjr', 'slt', 'hey', 'allo', 'salam', 'bonne journee a tous')) {
    return `${pick(['Bonjour et bienvenue chez MAISON KHAN ✨', 'Bonjour ! Ravi de vous recevoir ✨', 'Bonsoir et bienvenue ✨'], seed)} Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement ou les livraisons. Essayez par exemple : « sandales pour femme », « budget 60 000 FCFA » ou « qu'avez-vous en taille 39 ? »`
  }

  return genericReply(catalog, seed)
}

function genericReply(catalog: CatalogProduct[], seed: string): string {
  return `${pick([
    'Je suis l\'assistant de MAISON KHAN ✨ Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement (PayDunya) ou les livraisons.',
    'Bienvenue chez MAISON KHAN ✨ Modèles, prix, tailles, livraison — dites-moi tout.',
  ], seed)}\n${productList(catalog)}\nOu décrivez-moi vos envies : « mules beige », « sac », « budget 50 000 FCFA »… Pour une demande précise : WhatsApp ${WHATSAPP}.`
}
