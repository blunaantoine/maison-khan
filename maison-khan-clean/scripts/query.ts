import { db } from '../src/lib/db'

async function main() {
  // Get ALL content with raw SQL
  const result = await db.$queryRaw`SELECT * FROM SiteContent WHERE key LIKE 'hero_%'`
  console.log('Raw query result:', JSON.stringify(result, null, 2))
}

main().finally(() => db.$disconnect())
