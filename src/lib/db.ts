import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Instance Prisma unique (singleton) partagée entre tous les modules.
 *
 * IMPORTANT (correctif du 2025) :
 * - L'ancienne version ne mettait le client en cache qu'en développement,
 *   ce qui pouvait créer plusieurs clients en production et provoquer des
 *   erreurs "database is locked" (SQLITE_BUSY) sous charge.
 * - connection_limit=1 sérialise les accès au fichier SQLite et réduit
 *   fortement les verrouillages concurrents.
 */
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV !== 'production' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: process.env.DATABASE_URL?.includes('?')
          ? process.env.DATABASE_URL // respecte les paramètres déjà présents
          : `${process.env.DATABASE_URL}?connection_limit=1`,
      },
    },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
