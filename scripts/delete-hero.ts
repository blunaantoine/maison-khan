import { db } from '../src/lib/db'

async function main() {
  // First, let's see what's there
  const allContent = await db.siteContent.findMany({
    where: { category: 'hero' }
  })
  console.log('Hero content:', allContent)

  // Delete specific keys
  const keysToDelete = ['hero_title', 'hero_title_highlight', 'hero_description']

  for (const key of keysToDelete) {
    try {
      await db.siteContent.delete({ where: { key } })
      console.log(`Deleted: ${key}`)
    } catch (e: any) {
      console.log(`Error for ${key}:`, e.message)
    }
  }

  // Verify
  const afterDelete = await db.siteContent.findMany({
    where: { category: 'hero' }
  })
  console.log('After delete:', afterDelete)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
