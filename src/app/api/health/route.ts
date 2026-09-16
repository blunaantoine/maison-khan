import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/health — Sonde de santé pour monitoring externe (UptimeRobot, etc.)
 *
 * Objectif : détecter AVANT vos clients que le site est tombé.
 * Config UptimeRobot (gratuit) :
 *   - Type     : HTTP(s)
 *   - URL      : https://shop.maison-khan.com/api/health
 *   - Intervalle : 5 minutes
 *   - Alerte   : email/SMS si 2 échecs consécutifs ("keyword" : "ok")
 *
 * Réponse 200 = app ET base de données opérationnelles.
 * Réponse 503 = au moins un composant est défaillant.
 */
export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbError: string | null = null

  // Vérification de la base de données (requête légère)
  try {
    await db.$queryRaw`SELECT 1`
    dbOk = true
  } catch (error) {
    dbError = error instanceof Error ? error.message : String(error)
    console.error('[HEALTH] Base de données injoignable:', dbError)
  }

  const healthy = dbOk

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      checks: {
        app: 'ok',
        database: dbOk ? 'ok' : 'error'
      },
      latencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  )
}
