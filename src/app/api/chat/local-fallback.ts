/**
 * Assistant local MAISON KHAN — moteur conversationnel autonome.
 *
 * Utilisé quand le moteur IA (z-ai-web-dev-sdk) n'est pas disponible — c'est le
 * cas sur le VPS de production, où le service ne répond pas. Plutôt qu'un
 * simple moteur de mots-clés, ce module embarque un vrai mini-assistant :
 *
 *   – Recherche dans le CATALOGUE RÉEL : par type (sandales, mules, sacs…),
 *     genre, couleur, taille précise, budget (« j'ai 60 000 FCFA »), nom de
 *     modèle. Le type est lu en priorité dans `category` (ex. production :
 *     « sandales », « mules », « sac »), puis dans `subCategory` (ex. sandbox :
 *     « bottines », « mocassins ») et enfin dans le nom du produit — les deux
 *     conventions de données sont donc comprises. Les `subCategory` qui sont
 *     des noms de collections (« Collection Koriace ») ne polluent plus la
 *     recherche et s'affichent comme collections.
 *   – Honnêteté : si le type demandé n'existe pas (« mocassins »), l'assistant
 *     le dit et propose ce que la boutique a réellement (ex. « sandales, mules
 *     et sacs ») au lieu d'afficher tout le catalogue.
 *   – Mémoire de conversation : « et pour homme ? » (hérite du type de la
 *     recherche précédente), « c'est combien ? » (retrouve les modèles cités
 *     dans la dernière réponse, ou relance la recherche à partir de celle-ci),
 *     « la première ? », « vous l'avez en 39 ? » (affine la sélection).
 *   – Formulations variées (pas deux salutations identiques), ton luxe, concis.
 *   – Zéro invention : chaque prix / couleur / taille / stock vient de la base.
 */

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface CatalogProduct {
  id: string
  name: string
  type: string // 'chaussure' | 'accessoire'
  category: string // type réel : 'sandales', 'mules', 'sac'…
  subCategory: string | null // collection ou sous-catégorie du menu
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

/** Pluriel approximatif (français) : « sandale » → « sandales ». */
function plural(t: string): string {
  return /(s|x)$/.test(t) ? t : `${t}s`
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ───────────────────────────── vocabulaires ─────────────────────────────

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
  prune: ['prune', 'violet'],
  orange: ['orange'],
}

/** Mots-clés de types : mot du visiteur → type canonique. */
const SUBCATEGORY_WORDS: Record<string, string> = {
  sandale: 'sandale', tong: 'sandale', claquette: 'sandale',
  mule: 'mule', pantoufle: 'mule',
  ballerine: 'ballerine',
  escarpin: 'escarpin', talon: 'escarpin', aiguille: 'escarpin',
  bottine: 'bottine', botte: 'botte', cuissarde: 'botte',
  mocassin: 'mocassin', loafer: 'mocassin',
  sac: 'sac', bandouliere: 'sac', pochette: 'sac', cabas: 'sac',
  basket: 'basket', sneaker: 'basket', tennis: 'basket',
  derby: 'derby', richelieu: 'derby',
}

/** Mots trop génériques pour identifier un type de création. */
const GENERIC_TYPE_WORDS = new Set(['chaussure', 'accessoire', 'et', 'de', 'collection', 'collections'])

/** Mots signalant une question « service » (paiement, livraison…) : la recherche catalogue passe la main. */
const FAQ_HINTS = [
  'paiement', 'payer', 'payement', 'paie', 'paydunya', 'mobile money',
  'livraison', 'livrer', 'livrez', 'livre', 'expedi', 'douane', 'colis', 'delai', 'shipping',
  'suivi', 'statut',
  'retour', 'echange', 'rembourse', 'reclamation',
  'commander', 'passer commande', 'faire une commande',
  'whatsapp', 'telephone', 'appeler', 'joindre', 'email', 'mail', 'numero',
  'horaire', 'ouvert', 'ferme',
  'instagram', 'tiktok',
  'entretien', 'entretenir', 'nettoyer', 'nettoyage', 'cirage', 'cirer', 'proteger', 'impermeabiliser',
  'matiere', 'materiau',
  'sur mesure', 'personnali',
  'retirer', 'boutique', 'magasin', 'adresse', 'venir',
]

// ───────────────────────────── libellés produit ─────────────────────────────

/**
 * Mots décrivant le type réel d'un produit, lus dans `category` (production :
 * « sandales ») ou, si trop générique, dans `subCategory` (sandbox :
 * « bottines ») — seuls les vrais mots de type sont retenus, jamais les
 * noms de collections (« Collection Koriace »).
 */
function typeWords(p: CatalogProduct): string[] {
  const cat = tokens(p.category || '')
    .map(singular)
    .filter((t) => !GENERIC_TYPE_WORDS.has(t) && t.length > 2)
  if (cat.length > 0) return cat
  const sub = tokens(p.subCategory || '')
    .map(singular)
    .filter((t) => SUBCATEGORY_WORDS[t] && !GENERIC_TYPE_WORDS.has(t))
  if (sub.length > 0) return sub
  return [p.type === 'accessoire' ? 'accessoire' : 'chaussure']
}

/** Libellé court du type, ex. « sandale femme », « mule homme », « sac femme ». */
export function productTypeLabel(p: CatalogProduct): string {
  const base = typeWords(p).join(' ')
  const genre = p.genre ? ` ${norm(p.genre)}` : ''
  return `${base}${genre}`
}

/** Nom de collection à afficher (masqué s'il répète le type, ex. subCategory « bottines »). */
export function collectionLabel(p: CatalogProduct): string {
  const subNorm = norm(p.subCategory || '')
  return subNorm && !typeWords(p).some((w) => subNorm.includes(w)) ? p.subCategory!.trim() : ''
}

/** Fiche produit courte pour une bulle de chat. */
function productLine(p: CatalogProduct, withStock = true): string {
  const collection = collectionLabel(p) ? ` · ${collectionLabel(p)}` : ''
  const parts = [
    `- ${p.name.trim()} (${productTypeLabel(p)}${collection})`,
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
  return rest > 0
    ? `${shown}\n… et ${rest} autre${rest > 1 ? 's' : ''} modèle${rest > 1 ? 's' : ''} dans la boutique`
    : shown
}

/** Énumération des types présents au catalogue : « sandales, mules et sacs ». */
function availableTypes(catalog: CatalogProduct[]): string {
  const seen: string[] = []
  for (const p of catalog) {
    for (const w of typeWords(p)) {
      const pl = plural(w)
      if (!seen.includes(pl)) seen.push(pl)
    }
  }
  if (seen.length === 0) return 'nos créations artisanales'
  if (seen.length === 1) return seen[0]
  return `${seen.slice(0, -1).join(', ')} et ${seen[seen.length - 1]}`
}

// ─────────────────────────── extraction d'entités ───────────────────────────

interface Entities {
  products: CatalogProduct[] // modèles cités par leur nom
  type: string | null // chaussure | accessoire
  subCategory: string | null // sandale, mule, sac…
  genre: string | null // femme | homme
  color: string | null // clé de famille (beige, dore, noir…)
  colorGroup: string[] | null // teintes du catalogue acceptées
  size: string | null // « 39 », « 40 »…
  budget: number | null // XOF
  ordinal: number | null // « la première » → 0
  cheapest: boolean
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
    if (pName && q.includes(pName)) { e.products.push(p); continue }
    const nameToks = tokens(p.name).filter((t) => t.length >= 4 && !SUBCATEGORY_WORDS[t])
    if (nameToks.length > 0 && nameToks.some((t) => toks.includes(t))) e.products.push(p)
  }

  for (const t of toks) {
    const s = singular(t)
    if (s === 'femme' || s === 'fille' || s === 'dame' || s === 'feminin' || s === 'madame') e.genre = 'femme'
    if (s === 'homme' || s === 'garcon' || s === 'masculin' || s === 'monsieur') e.genre = 'homme'
    if (e.genre === null && (s === 'mixte' || s === 'unisexe')) e.genre = 'mixte'
    const colorKey = COLOR_SYNONYMS[t] ? t : COLOR_SYNONYMS[s] ? s : null
    if (colorKey && !e.color) {
      e.color = colorKey
      e.colorGroup = COLOR_SYNONYMS[colorKey]
    }
    if (SUBCATEGORY_WORDS[s]) e.subCategory = SUBCATEGORY_WORDS[s]
    if (s === 'chaussure' || s === 'soulier') e.type = 'chaussure'
    if (s === 'accessoire' || s === 'bijou') e.type = 'accessoire'
    if (s === 'sac') { e.type = 'accessoire'; e.subCategory = 'sac' }
    if (t === 'premier' || t === 'premiere' || t === '1ere' || t === '1er') e.ordinal = 0
    if (t === 'deuxieme' || t === '2eme') e.ordinal = 1
    if (t === 'troisieme' || t === '3eme') e.ordinal = 2
    if (t === 'dernier' || t === 'derniere') e.ordinal = -1
  }

  // ── taille explicite : « taille 39 », « pointure 40 », « en 39 ? », ou nombre isolé 35–46 ──
  const explicit = q.match(/(?:taille|pointure)\s*(\d{2})\b/)
  if (explicit) e.size = explicit[1]
  else {
    const n = toks.find((t) => /^(3[5-9]|4[0-6])$/.test(t))
    if (n && (has(q, 'taille', 'pointure', 'chaussure', 'sandale', 'mule', 'escarpin', 'bottine', 'ballerine', 'mocassin', 'porter', 'met', 'fais', 'en ' + n) || q.trim().length <= 25)) e.size = n
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

function colorMatches(p: CatalogProduct, e: Entities): boolean {
  if (!e.color) return true
  const group = (e.colorGroup || [e.color]).map(singular)
  return p.colors.some((c) => tokens(c).map(singular).some((ct) => group.includes(ct)))
}

function matchesType(p: CatalogProduct, e: Entities): boolean {
  if (e.subCategory) {
    const key = singular(e.subCategory)
    if (typeWords(p).includes(key)) return true
    if (tokens(p.subCategory || '').map(singular).includes(key)) return true
    if (tokens(p.name).map(singular).includes(key)) return true
    return false
  }
  if (e.type) return norm(p.type).includes(e.type)
  return true
}

/** En stock d'abord, puis par prix croissant (prix sur demande en fin). */
function sortByAvailability(list: CatalogProduct[]): CatalogProduct[] {
  return [...list].sort((a, b) => {
    const sa = a.totalStock > 0 ? 0 : 1
    const sb = b.totalStock > 0 ? 0 : 1
    if (sa !== sb) return sa - sb
    const pa = a.minPrice > 0 ? a.minPrice : Number.MAX_SAFE_INTEGER
    const pb = b.minPrice > 0 ? b.minPrice : Number.MAX_SAFE_INTEGER
    return pa - pb
  })
}

function searchProducts(e: Entities, catalog: CatalogProduct[]): CatalogProduct[] {
  let list = catalog.filter((p) => matchesType(p, e))
  if (e.genre) list = list.filter((p) => norm(p.genre || '').includes(e.genre!))
  if (e.color) list = list.filter((p) => colorMatches(p, e))
  if (e.size) list = list.filter((p) => p.sizes.includes(e.size!))
  if (e.budget !== null) {
    const ok = list.filter((p) => p.minPrice > 0 && p.minPrice <= e.budget!)
    if (ok.length > 0) return ok.sort((a, b) => a.minPrice - b.minPrice)
    // budget sous tous les prix → les plus accessibles (la réponse précisera l'écart)
    const pool = list.filter((p) => p.minPrice > 0)
    const src = pool.length > 0 ? pool : catalog.filter((p) => p.minPrice > 0)
    return [...src].sort((a, b) => a.minPrice - b.minPrice).slice(0, 3)
  }
  if (e.cheapest) {
    const withPrice = list.filter((p) => p.minPrice > 0)
    if (withPrice.length > 0) {
      const min = Math.min(...withPrice.map((p) => p.minPrice))
      return withPrice.filter((p) => p.minPrice === min)
    }
  }
  return sortByAvailability(list)
}

/**
 * Produits mentionnés dans un texte (réponse de l'assistant).
 * Occurrences en ordre de lecture ; si plusieurs produits portent le même nom
 * (ex. deux « Signature », homme et femme), le libellé adjacent « (mule femme) »
 * permet de choisir le bon.
 *
 * Utilisé pour la mémoire de conversation ET pour extraire les produits cités
 * afin d'afficher leurs photos/liens (cartes) sous la réponse.
 */
export function productsMentionedIn(text: string, catalog: CatalogProduct[]): CatalogProduct[] {
  if (!text) return []
  const nt = norm(text)
  const occurrences: { p: CatalogProduct; at: number }[] = []
  for (const p of catalog) {
    const n = norm(p.name)
    if (!n) continue
    const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(nt)) !== null) {
      const after = nt.slice(m.index + n.length, m.index + n.length + 45)
      const genre = p.genre ? norm(p.genre) : ''
      const said = after.match(/\([^)]*\b(femme|homme|mixte)\b/)?.[1]
      if (!genre || !said || said === genre) occurrences.push({ p, at: m.index })
    }
  }
  occurrences.sort((a, b) => a.at - b.at)
  const out: CatalogProduct[] = []
  for (const o of occurrences) if (!out.includes(o.p)) out.push(o.p)
  return out
}

// ─────────────────────────── réponse par intention ───────────────────────────

function productFocus(p: CatalogProduct, q: string): string {
  const priceAsked = has(q, 'combien', 'prix', 'coute', 'tarif')
  const stockAsked = has(q, 'disponible', 'dispo', 'stock', 'reste')
  const sizeAsked = has(q, 'taille', 'pointure')
  const head = priceAsked
    ? `${p.name.trim()} est à ${fmtPrice(p.minPrice)} XOF`
    : stockAsked
      ? `${p.name.trim()} — ${stockLabel(p.totalStock)}`
      : `Voici ${p.name.trim()}`
  const details: string[] = []
  if (!priceAsked && p.minPrice > 0) details.push(`${fmtPrice(p.minPrice)} XOF`)
  if (p.colors.length) details.push(`couleurs : ${p.colors.join(' / ')}`)
  if (p.sizes.length && (sizeAsked || !priceAsked)) details.push(`tailles : ${p.sizes.join(', ')}`)
  const tail = details.length ? ` (${details.join(' · ')})` : ''
  return `${head}${tail}. La fiche produit affiche les disponibilités en temps réel — et pour un conseil personnalisé, nos artisans sont sur WhatsApp (${WHATSAPP}).`
}

/** Introduction d'une liste de résultats : « Nos sandales pour femme : ». */
function searchIntro(e: Entities, seed: string): string {
  const bits: string[] = []
  if (e.budget !== null) bits.push(`à ${fmtPrice(e.budget)} XOF ou moins`)
  if (e.subCategory) {
    bits.push(`nos ${plural(singular(e.subCategory))}`)
    if (e.genre) bits.push(`pour ${e.genre}`)
  } else if (e.genre) {
    bits.push(`nos créations pour ${e.genre}`)
  }
  if (e.color) bits.push(e.subCategory || e.genre ? `en ${e.color}` : `nos créations en ${e.color}`)
  if (e.size) bits.push(`en taille ${e.size}`)
  if (bits.length === 0) {
    return pick(['Voici ce qui correspond à votre recherche ✨', 'Nos modèles correspondants :', 'Avec plaisir, voici :'], seed)
  }
  const phrase = bits.join(' ')
  const cap = phrase.charAt(0).toUpperCase() + phrase.slice(1)
  return pick([`${cap} :`, `${cap} ✨`], seed)
}

/** Rien trouvé : réponse honnête + alternatives réelles du catalogue. */
function emptySearchReply(e: Entities, seed: string, catalog: CatalogProduct[]): string {
  const inStock = catalog.filter((p) => p.totalStock > 0)
  const suggestions = inStock.length > 0 ? inStock : catalog
  const cleanEntities = (over: Partial<Entities>): Entities => ({
    products: [], type: null, subCategory: null, genre: null, color: null, colorGroup: null,
    size: null, budget: null, ordinal: null, cheapest: false, ...over,
  })

  if (e.subCategory) {
    const sub = plural(singular(e.subCategory))
    // le type existe-t-il au moins au catalogue ?
    const typeExists = catalog.some((p) => typeWords(p).includes(singular(e.subCategory!)))
    if (typeExists && e.genre) {
      const others = searchProducts(cleanEntities({ subCategory: e.subCategory }), catalog)
      if (others.length > 0) {
        return `${pick([
          `Je n'ai pas de ${sub} pour ${e.genre} en ce moment 😔 En revanche, voici nos ${sub} disponibles :`,
          `Pas de ${sub} pour ${e.genre} actuellement 😔 Nos ${sub} en boutique :`,
        ], seed)}\n${productList(others)}\nJe peux aussi vous montrer d'autres créations pour ${e.genre} — dites-le-moi.`
      }
    }
    const altGenre = e.genre
      ? searchProducts(cleanEntities({ genre: e.genre }), catalog)
      : []
    const shown = altGenre.length > 0 ? altGenre : suggestions
    return `${pick([
      `Je n'ai pas de ${sub} en boutique en ce moment 😔 Nos créations du moment : ${availableTypes(catalog)}.`,
      `Pas de ${sub} pour l'instant 😔 Nous proposons ${availableTypes(catalog)}.`,
    ], seed)} ${e.genre ? `Voici quelques créations pour ${e.genre} :` : 'En voici quelques-unes :'}\n${productList(shown.slice(0, 3))}\nOu décrivez-moi vos envies (couleur, taille, budget) — et pour une recherche sur mesure, WhatsApp ${WHATSAPP}.`
  }
  if (e.size) {
    return `Je n'ai rien en taille ${e.size} qui corresponde 😔 Voici nos créations disponibles :\n${productList(suggestions.slice(0, 3))}\nSouhaitez-vous un autre type de création ?`
  }
  if (e.color) {
    return `Je n'ai rien aux teintes ${e.color} pour le moment 😔 Voici nos créations disponibles :\n${productList(suggestions.slice(0, 3))}\nD'autres teintes vous tentent ? Dites-moi.`
  }
  if (e.genre) {
    return `Je n'ai pas de créations pour ${e.genre} correspondantes en ce moment 😔 Voici quelques-unes de nos créations :\n${productList(suggestions.slice(0, 3))}\nDécrivez-moi vos envies (type, couleur, budget) et je cherche.`
  }
  return `Je n'ai rien trouvé de tout à fait correspondant 😔 Voici quelques-unes de nos créations :\n${productList(suggestions.slice(0, 2))}\nDites-moi vos envies (type, couleur, budget) — ou écrivez-nous sur WhatsApp (${WHATSAPP}) pour une recherche sur mesure.`
}

function searchReply(e: Entities, results: CatalogProduct[], seed: string, catalog: CatalogProduct[]): string {
  if (results.length === 1) return productFocus(results[0], 'detail')
  if (results.length > 1) {
    // budget sous tous les prix affichés → honnêteté
    if (e.budget !== null && results.every((p) => p.minPrice > e.budget!)) {
      return `${pick([
        `Votre budget est un peu juste 😔 Nos créations les plus accessibles :`,
        `À ${fmtPrice(e.budget)} XOF, c'est compliqué 😔 Voici nos modèles les plus abordables :`,
      ], seed)}\n${productList(results)}\nPour une création sur mesure dans votre budget, nos artisans vous répondent sur WhatsApp (${WHATSAPP}).`
    }
    const closer = pick([
      'Souhaitez-vous une précision (couleur, taille, prix) ?',
      'Une question sur l\'un de ces modèles ?',
      'Dites-moi si vous souhaitez affiner (couleur, taille, budget).',
    ], seed)
    return `${searchIntro(e, seed)}\n${productList(results)}\n${closer}`
  }
  return emptySearchReply(e, seed, catalog)
}

// ────────────────────────────── intentions ──────────────────────────────

function buildLocalReplyText(history: ChatTurn[], catalog: CatalogProduct[]): string {
  const lastUserTurn = [...history].reverse().find((m) => m.role === 'user')
  const userMsg = lastUserTurn?.content ?? ''
  const q = ` ${norm(userMsg)} `
  const seed = `${userMsg}|${history.length}`

  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant')?.content ?? ''
  const lastProducts = productsMentionedIn(lastAssistant, catalog)
  const lastE = lastAssistant ? extractEntities(` ${norm(lastAssistant)} `, catalog) : null

  if (!userMsg.trim()) return genericReply(catalog, seed)

  const e = extractEntities(q, catalog)
  const bareFollowUp =
    e.subCategory === null && e.type === null && e.color === null &&
    e.size === null && e.budget === null && e.genre === null
  // question de service (paiement, livraison…) ? — prioritaire sur la recherche catalogue
  const faqHint = FAQ_HINTS.some((k) => q.includes(k))

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
  if (q.length <= 60 && has(q, 'qui es tu', 'qui es-tu', 'qui etes vous', 'tu es qui', 'es tu un robot', 'es-tu un robot', 'tu es un robot', 'tu es un bot', 'es tu humain', 'tu es reel', 'es tu une ia', 'es tu une intelligence', 'avec qui je parle', 'ton nom', 't appelle', "t'appelle")) {
    return `Je suis l'assistant virtuel de MAISON KHAN ✨ Je vous conseille sur nos créations (modèles, prix, tailles, disponibilités), les paiements PayDunya et les livraisons. Pour tout le reste — conseils d'artisan, commandes sur mesure, après-vente — mes collègues humains vous répondent sur WhatsApp (${WHATSAPP}).`
  }

  // ── modèle cité par son nom ──
  if (e.products.length > 0 && e.products.length <= 3) {
    if (e.products.length === 1) return productFocus(e.products[0], q)
    return `Voici les détails :\n${productList(e.products)}\nUne question sur l'un de ces modèles (taille, couleur, disponibilité) ?`
  }

  // ── suivi conversationnel ──
  // « la première ? » / « le dernier ? » sur la liste précédente
  if (e.ordinal !== null && lastProducts.length > 0) {
    const idx = e.ordinal === -1 ? lastProducts.length - 1 : e.ordinal
    const p = lastProducts[Math.min(idx, lastProducts.length - 1)]
    if (p) return productFocus(p, q)
  }

  // « c'est combien ? » — prix des modèles de la réponse précédente,
  // ou relance de la recherche décrite dans cette réponse (type, genre, couleur)
  const priceFollowUp = has(q, 'combien', 'prix', 'coute', 'tarif') && q.length < 60 && bareFollowUp
  if (priceFollowUp) {
    if (lastProducts.length === 1) return productFocus(lastProducts[0], q)
    if (lastProducts.length > 1) {
      return `${pick(['Bien sûr, les voici avec leurs prix :', 'Avec plaisir :'], seed)}\n${productList(lastProducts)}\nChaque fiche produit affiche les disponibilités en temps réel.`
    }
    if (lastE && (lastE.subCategory !== null || lastE.genre !== null || lastE.color !== null)) {
      const found = searchProducts(lastE, catalog)
      if (found.length > 0) {
        return `Les voici avec leurs prix :\n${productList(found)}\nUne précision sur l'un de ces modèles ?`
      }
      return emptySearchReply(lastE, seed, catalog)
    }
    return `De quel modèle souhaitez-vous le prix ? Voici nos créations actuelles :\n${productList(sortByAvailability(catalog))}\nDites-moi celle qui vous intéresse ✨`
  }

  // « elle est disponible ? » / « il en reste ? »
  const stockFollowUp = has(q, 'disponible', 'dispo', 'stock', 'reste t il', 'reste-t-il', 'il en reste') && q.length < 60 && bareFollowUp
  if (stockFollowUp) {
    if (lastProducts.length > 0) {
      return `Voici l'état des stocks :\n${productList(lastProducts)}\nLes pièces très limitées partent vite — pour réserver la vôtre : WhatsApp ${WHATSAPP}.`
    }
    if (lastE && (lastE.subCategory !== null || lastE.genre !== null || lastE.color !== null)) {
      const found = searchProducts(lastE, catalog)
      if (found.length > 0) {
        return `Voici les disponibilités :\n${productList(found)}\nLes pièces très limitées partent vite — pour réserver la vôtre : WhatsApp ${WHATSAPP}.`
      }
      return emptySearchReply(lastE, seed, catalog)
    }
    return `Quel modèle vous intéresse ? Voici nos créations avec leurs stocks :\n${productList(sortByAvailability(catalog))}\nDites-moi celle que vous souhaitez.`
  }

  // « vous l'avez en 39 ? » / « et en rouge ? » — affine la sélection précédente
  if ((e.size !== null || e.color !== null) && lastProducts.length > 0 && q.length < 60 && e.subCategory === null) {
    const label = [e.size ? `en taille ${e.size}` : null, e.color ? `en ${e.color}` : null].filter(Boolean).join(' et ')
    const narrowed = lastProducts.filter((p) => (e.size === null || p.sizes.includes(e.size)) && colorMatches(p, e))
    if (narrowed.length > 0) {
      return `Oui, dans votre sélection ${label} :\n${productList(narrowed)}\nSouhaitez-vous les détails d'un modèle (prix, couleurs) ?`
    }
    const wider = searchProducts(e, catalog)
    if (wider.length > 0) {
      return `Pas ${label} dans la sélection précédente 😔 Voici ce que nous avons ${label} dans la boutique :\n${productList(wider)}\nDites-moi si l'une de ces pièces vous tente.`
    }
  }

  // « et pour homme ? » — hérite du type de la recherche précédente
  const followUpOnly = has(q, 'et ', 'et le', 'et la', 'eux aussi', 'la meme') || q.trim().length < 45
  if (followUpOnly && e.genre !== null && e.color === null && e.size === null && !faqHint) {
    const inheritedSub = e.subCategory ?? lastE?.subCategory ?? null
    const effE: Entities = { ...e, subCategory: inheritedSub }
    const inLast = lastProducts.filter((p) => norm(p.genre || '').includes(e.genre!))
    const base = inLast.length > 0 ? inLast : catalog
    const results = sortByAvailability(base.filter((p) => norm(p.genre || '').includes(e.genre!) && matchesType(p, effE)))
    if (results.length > 0) {
      const label = inheritedSub ? `${plural(singular(inheritedSub))} pour ${e.genre}` : `créations pour ${e.genre}`
      return `${pick(['Avec plaisir, voici nos', 'Voici nos'], seed)} ${label} :\n${productList(results)}\nSouhaitez-vous une précision (couleur, taille, prix) ?`
    }
  }

  // ── recherche catalogue (entités détectées, hors questions « service ») ──
  // Une question de service garde la priorité même si elle mentionne des
  // produits (« vous livrez les sandales à l'étranger ? »).
  const hasSearchIntent =
    !faqHint &&
    (e.products.length > 3 ||
      e.subCategory !== null ||
      e.color !== null ||
      e.size !== null ||
      e.budget !== null ||
      e.cheapest ||
      e.genre !== null)
  if (hasSearchIntent) {
    const results = e.products.length > 3 ? e.products : searchProducts(e, catalog)
    return searchReply(e, results, seed, catalog)
  }

  // ── suivi de commande ──
  if (has(q, 'suivi', 'suivre', 'statut', 'ou en est', 'ou est ma commande', 'etat de ma commande', 'ma commande est', 'numero de commande')) {
    return `Vous suivez votre commande en temps réel depuis votre espace « Mon Compte » — un email et une notification vous sont envoyés à chaque étape (confirmée, en préparation, prête, livrée), avec l'historique de vos achats. Pour une commande en particulier : WhatsApp ${WHATSAPP} avec votre numéro de commande.`
  }

  // ── retours / échanges / après-vente ──
  if (has(q, 'retour', 'echange', 'rembourse', 'apres-vente', 'apres vente', 'casse', 'defectueux', 'abime', 'probleme avec', 'reclamation')) {
    return `Nous sommes désolés pour ce désagrément. Pour tout échange, remboursement ou demande après-vente, contactez-nous sur WhatsApp (${WHATSAPP}) avec votre numéro de commande : notre équipe étudiera la meilleure solution avec vous, en toute transparence.`
  }

  // ── comment commander ──
  if (has(q, 'comment commander', 'passer commande', 'faire une commande', 'je veux commander', 'je commande', 'commander')) {
    return `Commander est simple ✨ Choisissez votre modèle sur la boutique, sélectionnez la taille et la couleur, ajoutez au panier puis réglez en ligne via PayDunya (Mobile Money, XOF). Vous suivez ensuite chaque étape (préparation, prête, livrée) depuis votre espace « Mon Compte ». Besoin d'aide ? WhatsApp ${WHATSAPP}.`
  }

  // ── paiement ──
  if (has(q, 'paiement', 'payer', 'paye', ' paie', 'paydunya', 'mobile money', 'flooz', 'tmoney', 'wave', 'carte', 'especes', 'virement', 'reglement', 'regler', 'credit')) {
    return `Le paiement s'effectue en ligne de façon sécurisée via PayDunya — Mobile Money (Flooz, TMoney…) en francs CFA (XOF). Votre commande est préparée dès confirmation du paiement, et vous suivez chaque étape depuis « Mon Compte » (email + notification à chaque mise à jour). Une question sur un paiement ? WhatsApp : ${WHATSAPP}.`
  }

  // ── livraison / international / douanes ──
  if (has(q, 'livraison', 'livrer', 'livre', 'livrez', 'expedi', 'international', 'etranger', 'douane', 'colis', 'delai', 'frais de port', 'shipping', 'emballage', 'cadeau wrap')) {
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
    const inStock = catalog.filter((p) => p.totalStock > 0)
    const forWho = e.genre === 'homme' ? 'pour homme' : e.genre === 'femme' ? 'pour femme' : ''
    if (inStock.length > 0) {
      return `Avec plaisir ✨ Voici quelques-unes de nos créations disponibles ${forWho ? forWho + ' ' : ''}:\n${productList(sortByAvailability(inStock).slice(0, 4))}\nDites-moi vos envies (type, couleur, budget, taille) et j'affine la sélection — exemple : « sandales en 39 » ou « budget 60 000 FCFA ».`
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
    return `${pick(['Voici notre catalogue du moment ✨', 'Avec plaisir, voici nos créations :', 'Nos modèles actuels :'], seed)}\n${productList(sortByAvailability(catalog))}\nDites-moi vos envies (type, couleur, budget, taille) et j'affine — ou demandez-moi par modèle.`
  }

  // ── objection prix ──
  if (has(q, 'trop cher', 'trop chere', 'si cher', "c'est cher", 'c est cher', "c'est chere", 'c est chere', 'hors de prix')) {
    return `Chaque création est assemblée main par nos artisans, avec des cuirs sélectionnés — pensée pour durer 💛 Donnez-moi votre budget (« budget 25 000 FCFA ») et je vous montre nos modèles les plus proches.`
  }

  // ── small talk : « comment tu va ? », « ça va ? » (messages courts) ──
  if (q.length <= 40 && has(q, 'comment tu va', 'comment tu vas', 'comment va', 'comment allez', 'allez bien', 'tu va bien', 'tu vas bien', 'ca va', 'sa va', 'cava', 'cv', 'wesh', 'ca dit quoi')) {
    return `${pick(['Je vais très bien, merci ✨ Et vous ?', 'À merveille, merci — prêt(e) à vous trouver la paire parfaite ✨', 'Très bien, merci ! Et votre journée ?'], seed)} Dites-moi ce que vous cherchez : « sandales pour femme », « budget 60 000 FCFA »…`
  }

  // ── salutations (messages courts sans autre intention) ──
  if (has(q, 'bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'bjr', 'slt', 'hey', 'allo', 'salam', 'yo', 'bonne journee a tous')) {
    return `${pick(['Bonjour et bienvenue chez MAISON KHAN ✨', 'Bonjour ! Ravi de vous recevoir ✨', 'Bonsoir et bienvenue ✨'], seed)} Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement ou les livraisons. Essayez par exemple : « sandales pour femme », « budget 60 000 FCFA » ou « qu'avez-vous en taille 39 ? »`
  }

  return genericReply(catalog, seed)
}

function genericReply(catalog: CatalogProduct[], seed: string): string {
  return `${pick([
    'Je suis l\'assistant de MAISON KHAN ✨ Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement (PayDunya) ou les livraisons.',
    'Bienvenue chez MAISON KHAN ✨ Modèles, prix, tailles, livraison — dites-moi tout.',
  ], seed)}\n${productList(sortByAvailability(catalog))}\nOu décrivez-moi vos envies : « mules beige », « sac », « budget 50 000 FCFA »… Pour une demande précise : WhatsApp ${WHATSAPP}.`
}

// ─────────────────── réponse enrichie (texte + produits cités) ───────────────────

/** Réponse de l'assistant local : texte + produits réellement cités. */
export interface LocalReply {
  text: string
  /** Produits mentionnés dans la réponse (max 6) — photos/liens côté front. */
  products: CatalogProduct[]
}

/**
 * Réponse de l'assistant local : le texte conversationnel ET la liste des
 * produits réellement cités dans ce texte. Le front affiche sous la bulle une
 * carte cliquable (photo + nom + prix → fiche /produit/{id}) pour chacun —
 * le visiteur voit et rejoint directement les articles dont le bot parle.
 */
export function buildLocalReply(history: ChatTurn[], catalog: CatalogProduct[]): LocalReply {
  const text = buildLocalReplyText(history, catalog)
  const products = productsMentionedIn(text, catalog).slice(0, 6)
  return { text, products }
}
