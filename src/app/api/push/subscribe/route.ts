import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Gestion des abonnements aux notifications push (Web Push).
 *
 * - GET    : l'utilisateur a-t-il des appareils abonnés ? (état de l'UI)
 * - POST   : enregistrer/rafraîchir l'abonnement de l'appareil courant
 * - DELETE : se désabonner (permission révoquée, bouton « Désactiver »…)
 *
 * Route protégée par le middleware (x-auth-user-id injecté après vérification
 * du cookie de session).
 */

interface PushSubscriptionBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

function isValidSubscription(body: unknown): body is PushSubscriptionBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.endpoint === 'string' &&
    b.endpoint.startsWith('https://') &&
    typeof b.keys === 'object' && b.keys !== null &&
    typeof (b.keys as Record<string, unknown>).p256dh === 'string' &&
    typeof (b.keys as Record<string, unknown>).auth === 'string'
  )
}

// GET — État des abonnements de l'utilisateur connecté
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }
    const count = await db.pushSubscription.count({ where: { userId } })
    return NextResponse.json({ subscribed: count > 0, devices: count })
  } catch (error) {
    console.error('Push subscribe GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST — Enregistrer (ou mettre à jour) l'abonnement de cet appareil
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }

    const body = await request.json()
    if (!isValidSubscription(body)) {
      return NextResponse.json({ error: 'Abonnement push invalide' }, { status: 400 })
    }

    const userAgent = request.headers.get('user-agent') || undefined

    // Upsert par endpoint : un même appareil ne doit créer qu'une seule ligne
    // (le navigateur régénère parfois la subscription → endpoint change)
    const existing = await db.pushSubscription.findUnique({
      where: { endpoint: body.endpoint },
      select: { id: true },
    })

    if (existing) {
      await db.pushSubscription.update({
        where: { id: existing.id },
        data: { userId, p256dh: body.keys.p256dh, auth: body.keys.auth, userAgent },
      })
    } else {
      await db.pushSubscription.create({
        data: {
          userId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent,
        },
      })
    }

    return NextResponse.json({ message: 'Notifications activées sur cet appareil' })
  } catch (error) {
    console.error('Push subscribe POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'activation' }, { status: 500 })
  }
}

// DELETE — Supprimer l'abonnement (par endpoint, corps JSON)
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Authentification requise' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const endpoint = (body as Record<string, unknown>)?.endpoint

    if (typeof endpoint !== 'string' || !endpoint) {
      return NextResponse.json({ error: 'Endpoint requis' }, { status: 400 })
    }

    // On ne supprime que SES abonnements
    await db.pushSubscription.deleteMany({ where: { endpoint, userId } })

    return NextResponse.json({ message: 'Notifications désactivées' })
  } catch (error) {
    console.error('Push subscribe DELETE error:', error)
    return NextResponse.json({ error: 'Erreur lors de la désactivation' }, { status: 500 })
  }
}
