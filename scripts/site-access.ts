/**
 * Ouvrir / fermer le site au public depuis le serveur (même effet que le
 * bouton du panneau admin).
 *
 *   bun scripts/site-access.ts close    → page « Ouverture très prochaine » pour les visiteurs
 *   bun scripts/site-access.ts open     → boutique visible par tous
 *   bun scripts/site-access.ts status   → état actuel
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const KEY = 'site_closed'

async function main() {
  const action = process.argv[2]
  if (action === 'close' || action === 'open') {
    const value = action === 'close' ? 'true' : 'false'
    await db.siteSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } })
  } else if (action !== 'status') {
    console.error('Usage : bun scripts/site-access.ts close|open|status')
    process.exit(1)
  }
  const row = await db.siteSetting.findUnique({ where: { key: KEY } })
  console.log(row?.value === 'true'
    ? '🔒 Site FERMÉ au public (seuls les admins et managers voient la boutique)'
    : '🌍 Site OUVERT au public')
  console.log('   (appliqué immédiatement)')
  await db.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
