import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Récupérer les logs d'emails (simplifié)
export async function GET() {
  try {
    // Retourner une réponse simple pour l'instant
    return NextResponse.json({
      logs: [],
      failedCount: 0,
      totalCount: 0,
      message: 'Email logging not configured'
    })
  } catch (error) {
    console.error('Error fetching email logs:', error)
    return NextResponse.json({ error: 'Failed to fetch email logs' }, { status: 500 })
  }
}
