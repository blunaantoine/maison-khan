import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { sendTestPush } from '@/lib/push'
import { rateLimit } from '@/lib/rate-limit'

/**
 * POST /api/push/test — envoie un push de test aux appareils du compte connecté
 * et renvoie le diagnostic : clés VAPID présentes ? combien d'appareils ? envoyés ?
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })

  if (!rateLimit(`pushtest:${user.id}`, 5, 60_000).allowed) {
    return NextResponse.json({ error: 'Trop de tests. Réessayez dans une minute.' }, { status: 429 })
  }

  try {
    const result = await sendTestPush(user.id)
    return NextResponse.json(result)
  } catch (e) {
    console.error('Push test error:', e)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
