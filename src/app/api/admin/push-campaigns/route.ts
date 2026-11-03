import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPushAudienceStats } from '@/lib/push'
import { processDuePushCampaigns } from '@/lib/push-campaigns'

/**
 * Campagnes de notifications push (messages écrits par l'admin).
 *
 * - GET    : liste des campagnes + audience (clients/appareils abonnés).
 *            Déclenche aussi l'envoi des campagnes programmées arrivées à échéance.
 * - POST   : créer une campagne — envoi immédiat (pas de date) ou programmé (date future).
 * - PUT    : agir sur une campagne programmée — { id, action: 'cancel' | 'send-now' }.
 * - DELETE : supprimer une campagne de l'historique.
 *
 * Route protégée par le middleware (/api/admin/* → manager + admin).
 */

interface CampaignBody {
  title?: unknown
  body?: unknown
  url?: unknown
  scheduledAt?: unknown
}

// GET — Liste + audience + traitement des échéances
export async function GET() {
  try {
    // Les campagnes programmées dont l'heure est venue partent maintenant
    const processed = await processDuePushCampaigns()

    const [campaigns, stats] = await Promise.all([
      db.pushCampaign.findMany({
        orderBy: [{ scheduledAt: 'desc' }],
        take: 30,
      }),
      getPushAudienceStats(),
    ])

    return NextResponse.json({ campaigns, stats, processed })
  } catch (error) {
    console.error('Push campaigns GET error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// POST — Créer une campagne (envoi immédiat ou programmé)
export async function POST(request: NextRequest) {
  try {
    const raw = (await request.json()) as CampaignBody

    const title = typeof raw.title === 'string' ? raw.title.trim() : ''
    const body = typeof raw.body === 'string' ? raw.body.trim() : ''
    let url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : '/'
    const scheduledAtRaw = typeof raw.scheduledAt === 'string' ? raw.scheduledAt : ''

    if (!title || title.length < 3) {
      return NextResponse.json({ error: 'Le titre est requis (3 caractères minimum)' }, { status: 400 })
    }
    if (!body || body.length < 3) {
      return NextResponse.json({ error: 'Le message est requis (3 caractères minimum)' }, { status: 400 })
    }
    if (title.length > 80) {
      return NextResponse.json({ error: 'Le titre est trop long (80 caractères maximum)' }, { status: 400 })
    }
    if (body.length > 200) {
      return NextResponse.json({ error: 'Le message est trop long (200 caractères maximum)' }, { status: 400 })
    }
    // Le lien doit être une page interne du site (jamais une URL externe)
    if (!url.startsWith('/') || url.startsWith('//')) url = '/'

    // Date programmée : absente/passée = envoi immédiat
    let scheduledAt = new Date()
    if (scheduledAtRaw) {
      const parsed = new Date(scheduledAtRaw)
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Date de programmation invalide' }, { status: 400 })
      }
      if (parsed.getTime() > Date.now()) scheduledAt = parsed
    }

    const campaign = await db.pushCampaign.create({
      data: { title, body, url, scheduledAt },
    })

    // Envoi immédiat si l'heure est déjà venue
    let sentNow = false
    if (scheduledAt.getTime() <= Date.now()) {
      await processDuePushCampaigns()
      sentNow = true
    }

    return NextResponse.json({
      message: sentNow
        ? 'Notification envoyée ✓'
        : 'Notification programmée ✓',
      campaign,
      sentNow,
    })
  } catch (error) {
    console.error('Push campaigns POST error:', error)
    return NextResponse.json({ error: 'Erreur lors de la création' }, { status: 500 })
  }
}

// PUT — Annuler ou forcer l'envoi d'une campagne programmée
export async function PUT(request: NextRequest) {
  try {
    const raw = (await request.json()) as { id?: unknown; action?: unknown }
    const id = typeof raw.id === 'string' ? raw.id : ''
    const action = typeof raw.action === 'string' ? raw.action : ''

    if (!id || !['cancel', 'send-now'].includes(action)) {
      return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
    }

    const campaign = await db.pushCampaign.findUnique({ where: { id } })
    if (!campaign) {
      return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
    }
    if (campaign.status !== 'scheduled') {
      return NextResponse.json({ error: 'Cette campagne n\'est plus programmée' }, { status: 400 })
    }

    if (action === 'cancel') {
      await db.pushCampaign.update({
        where: { id },
        data: { status: 'cancelled' },
      })
      return NextResponse.json({ message: 'Notification annulée' })
    }

    // send-now : force l'heure à maintenant et envoie
    await db.pushCampaign.update({
      where: { id },
      data: { scheduledAt: new Date() },
    })
    await processDuePushCampaigns()
    return NextResponse.json({ message: 'Notification envoyée ✓' })
  } catch (error) {
    console.error('Push campaigns PUT error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

// DELETE — Supprimer une campagne de l'historique
export async function DELETE(request: NextRequest) {
  try {
    const raw = (await request.json()) as { id?: unknown }
    const id = typeof raw.id === 'string' ? raw.id : ''
    if (!id) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 })
    }

    // Une campagne programmée doit d'abord être annulée (évite les suppressions accidentelles)
    const campaign = await db.pushCampaign.findUnique({ where: { id } })
    if (!campaign) {
      return NextResponse.json({ error: 'Campagne introuvable' }, { status: 404 })
    }
    if (campaign.status === 'scheduled') {
      return NextResponse.json({ error: 'Annulez cette notification avant de la supprimer' }, { status: 400 })
    }

    await db.pushCampaign.delete({ where: { id } })
    return NextResponse.json({ message: 'Notification supprimée de l\'historique' })
  } catch (error) {
    console.error('Push campaigns DELETE error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
