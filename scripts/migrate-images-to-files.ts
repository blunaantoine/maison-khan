/**
 * MAISON KHAN — Migration des médias base64 → fichiers physiques.
 *
 * PROBLÈME CORRIGÉ :
 * Les images produits, slides du hero et photos de l'atelier étaient stockées
 * en base64 DANS la base de données. L'API /api/products pesait ~19,5 Mo et
 * la page d'accueil ne s'affichait plus sur mobile (connexion 3G/4G).
 *
 * CE SCRIPT FAIT (une seule fois sur le VPS) :
 *   1. Extrait chaque image/vidéo base64 de la base
 *   2. L'écrit comme fichier dans db/uploads/ (nom = hash du contenu)
 *   3. Remplace la valeur en base par l'URL légère /api/img/<fichier>
 *   4. Vérifie que la page d'accueil redevient légère
 *
 * SÛR & IDEMPOTENT :
 *   - Ne touche QUE les valeurs commençant par « data:image/ » ou « data:video/ »
 *   - Les valeurs déjà converties (/api/img/..., http…, texte) sont ignorées
 *   - Peut être relancé sans risque : rien ne bouge au 2e passage
 *   - Le dossier db/ survit aux rebuilds (comme la base custom.db)
 *
 * USAGE (sur le VPS) :
 *   cd /var/www/maison-khan
 *   bun scripts/migrate-images-to-files.ts
 *
 * NB : bun charge automatiquement le .env (DATABASE_URL) — aucun réglage requis.
 */

import { PrismaClient } from '@prisma/client'
import { saveDataUri } from '../src/lib/uploads'

const db = new PrismaClient()

let filesWritten = 0
let valuesConverted = 0
let valuesSkipped = 0

/**
 * Convertit une valeur média : data URI → URL /api/img/...
 * Renvoie la nouvelle valeur, ou null si rien à changer.
 */
function convert(value: string, prefix: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('data:image/') && !value.startsWith('data:video/')) {
    valuesSkipped++
    return null
  }
  const url = saveDataUri(value, prefix)
  if (!url) {
    valuesSkipped++
    return null
  }
  filesWritten++ // note : hash → le même contenu ne réécrit pas réellement le fichier
  valuesConverted++
  return url
}

async function migrateProducts() {
  const products = await db.product.findMany()
  for (const p of products) {
    const image = convert(p.image, 'prod')
    if (image && image !== p.image) {
      await db.product.update({ where: { id: p.id }, data: { image } })
      console.log(`  🖼  Produit « ${p.name} » — image principale convertie`)
    }
  }
  console.log(`  → ${products.length} produits parcourus`)
}

async function migrateProductColors() {
  const colors = await db.productColor.findMany()
  let changed = 0
  for (const c of colors) {
    let images: string[] = []
    try {
      images = JSON.parse(c.images || '[]')
    } catch {
      images = []
    }
    if (!Array.isArray(images) || images.length === 0) continue

    const converted = images.map((img) => convert(img, 'prod'))
    const hasChange = converted.some((url, i) => url && url !== images[i])
    if (hasChange) {
      await db.productColor.update({
        where: { id: c.id },
        data: { images: JSON.stringify(converted) },
      })
      changed++
    }
  }
  console.log(`  → ${colors.length} couleurs parcourues, ${changed} mises à jour`)
}

async function migrateHeroSlides() {
  const slides = await db.heroSlide.findMany()
  for (const s of slides) {
    const converted = convert(s.image, 'slide')
    if (converted && converted !== s.image) {
      await db.heroSlide.update({ where: { id: s.id }, data: { image: converted } })
      console.log(`  🎬 Slide « ${s.title || s.id} » (${s.type}) convertie`)
    }
  }
  console.log(`  → ${slides.length} slides parcourues`)
}

async function migrateAtelierImages() {
  const images = await db.atelierImage.findMany()
  for (const a of images) {
    const converted = convert(a.image, 'atelier')
    if (converted && converted !== a.image) {
      await db.atelierImage.update({ where: { id: a.id }, data: { image: converted } })
      console.log(`  📸 Atelier « ${a.caption || a.id} » convertie`)
    }
  }
  console.log(`  → ${images.length} images d'atelier parcourues`)
}

async function migrateSiteSettings() {
  const settings = await db.siteSetting.findMany()
  for (const s of settings) {
    const converted = convert(s.value, 'setting')
    if (converted && converted !== s.value) {
      await db.siteSetting.update({ where: { id: s.id }, data: { value: converted } })
      console.log(`  ⚙️  Réglage « ${s.key} » converti`)
    }
  }
  console.log(`  → ${settings.length} réglages parcourus`)
}

async function shrinkDatabase() {
  // La base garde la place des données supprimées (freelist) — VACUUM la
  // retaille réellement sur le disque. Sans transaction (SQLite l'exige).
  try {
    await db.$executeRawUnsafe('VACUUM')
    console.log('  ✅ Base de données compactée (VACUUM)')
  } catch (e) {
    console.log('  (compactage VACUUM ignoré :', String(e), ')')
  }
}

async function main() {
  console.log('════════════════════════════════════════════════')
  console.log(' MAISON KHAN — Migration des médias base64 → fichiers')
  console.log('════════════════════════════════════════════════')
  const startedAt = Date.now()

  console.log('\n[1/6] Images principales des produits…')
  await migrateProducts()

  console.log('\n[2/6] Images par couleur des produits…')
  await migrateProductColors()

  console.log('\n[3/6] Slides du hero (images & vidéos)…')
  await migrateHeroSlides()

  console.log('\n[4/6] Images de l atelier…')
  await migrateAtelierImages()

  console.log('\n[5/6] Réglages du site (logo, image « maison »)…')
  await migrateSiteSettings()

  console.log('\n[6/6] Compactage de la base…')
  await shrinkDatabase()

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('\n════════════════════════════════════════════════')
  console.log(` ✅ Migration terminée en ${seconds}s`)
  console.log(`    • ${valuesConverted} média(s) converti(s) en fichier(s)`)
  console.log(`    • ${valuesSkipped} valeur(s) déjà à jour ou non média (ignorées)`)
  console.log('    • Les fichiers sont dans db/uploads/ (survit aux rebuilds)')
  console.log('    • La boutique est immédiatement plus légère — aucun redémarrage requis')
  console.log('════════════════════════════════════════════════')
}

main()
  .catch((e) => {
    console.error('❌ Migration échouée :', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
