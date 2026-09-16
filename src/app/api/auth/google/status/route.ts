import { NextResponse } from 'next/server'
import { isGoogleConfigured } from '@/lib/google-auth'

/**
 * GET /api/auth/google/status
 *
 * Indique au frontend si la connexion Google est disponible sur ce serveur.
 * Le bouton « Continuer avec Google » n'est affiché que si configured === true.
 */
export async function GET() {
  return NextResponse.json(
    { configured: isGoogleConfigured() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
