import { NextResponse } from 'next/server'
import { isAppleConfigured } from '@/lib/apple-auth'

/**
 * GET /api/auth/apple/status
 *
 * Indique au frontend si la connexion Apple est disponible sur ce serveur.
 * Le bouton « Continuer avec Apple » n'est affiché que si configured === true.
 */
export async function GET() {
  return NextResponse.json(
    { configured: isAppleConfigured() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
