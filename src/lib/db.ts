import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Cache bust: v7 - force reload for isBestSeller and isNew fields
const isDev = process.env.NODE_ENV !== 'production'

export const db =
  (isDev ? undefined : globalForPrisma.prisma) ??
  new PrismaClient({
    log: isDev ? ['query', 'error', 'warn'] : ['error', 'warn'],
  })

if (isDev && !globalForPrisma.prisma) globalForPrisma.prisma = db
