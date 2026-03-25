import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Delete hero content
  const result = await prisma.siteContent.deleteMany({
    where: {
      key: {
        in: ['hero_title', 'hero_title_highlight', 'hero_description']
      }
    }
  })
  console.log('Deleted:', result.count, 'records')
  
  // Verify
  const remaining = await prisma.siteContent.findMany({
    where: { category: 'hero' }
  })
  console.log('Remaining hero content:', remaining)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
