import { db } from '@/lib/db'
import { sendPushToAll } from '@/lib/push'

/**
 * MAISON KHAN — Campagnes de notifications push (messages écrits par l'admin).
 *
 * Un message peut être envoyé immédiatement (scheduledAt dans le passé) ou
 * programmé (scheduledAt dans le futur). Les campagnes programmées partent
 * automatiquement à l'heure prévue :
 *   - dès que l'admin ouvre le site (chaque appel API déclenche un contrôle)
 *   - via le cron du serveur (/api/cron/check-payments traite aussi les campagnes)
 *
 * Tolérance aux pannes : rien ici ne doit lever d'exception vers l'appelant.
 */

/** Traiter les campagnes dont l'heure est venue. Retourne le nombre traitées. */
export async function processDuePushCampaigns(): Promise<number> {
  let due: { id: string; title: string; body: string; url: string }[]
  try {
    due = await db.pushCampaign.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: new Date() } },
      select: { id: true, title: true, body: true, url: true },
      take: 10, // par sécurité : jamais plus de 10 campagnes d'un coup
    })
  } catch (e) {
    console.error('[push-campaigns:error] lecture campagnes dues :', e)
    return 0
  }

  for (const campaign of due) {
    let sentCount = 0
    try {
      sentCount = await sendPushToAll({
        title: campaign.title,
        body: campaign.body,
        url: campaign.url,
        tag: `campaign-${campaign.id}`, // une campagne = un fil de notification
      })
    } catch (e) {
      console.error(`[push-campaigns:error] envoi ${campaign.id} :`, e)
    }
    try {
      // Marquer envoyée même si 0 appareil touché (sinon elle repartirait en boucle)
      await db.pushCampaign.update({
        where: { id: campaign.id },
        data: { status: 'sent', sentAt: new Date(), sentCount },
      })
      console.log(
        `[push-campaigns] « ${campaign.title} » envoyée à ${sentCount} appareil(s)`
      )
    } catch (e) {
      console.error(`[push-campaigns:error] marquage ${campaign.id} :`, e)
    }
  }

  return due.length
}
