import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Cache bust: v7 - force reload for isBestSeller and isNew fields
// In development, always create a new client to pick up schema changes
const forceNewClient = process.env.NODE_ENV !== 'production'

export const db =
  (forceNewClient ? undefined : globalForPrisma.prisma) ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production' && !forceNewClient) globalForPrisma.prisma = db
