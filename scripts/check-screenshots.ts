/**
 * Validation visuelle des captures d'écran du système de notifications.
 * Usage : bun scripts/check-screenshots.ts
 */
import ZAI from 'z-ai-web-dev-sdk'
import fs from 'fs'

const CAPTURES = [
  {
    path: '/tmp/notif-dropdown-desktop.png',
    prompt:
      "Décris cette capture d'une dropdown de notifications e-commerce de luxe (desktop). Vérifie : 1) une cloche avec badge rouge dans le header, 2) le dropdown aligné à droite avec en-tête 'Notifications', 3) des notifications avec icônes colorées, titres, messages, badges de type (COMMANDE, PAIEMENT, SYSTÈME, MESSAGE), 4) un point rouge pour les non-lues, 5) un bouton 'Tout lire' et 'Voir toutes les notifications'. Signale tout problème visuel : chevauchement, texte coupé, désalignement, couleur incohérente avec une charte ivoire/noir/bronze.",
  },
  {
    path: '/tmp/notif-tab-client.png',
    prompt:
      "Décris cette capture d'un dashboard client e-commerce de luxe, onglet 'Mes Notifications'. Vérifie : 1) le titre 'Mes Notifications' avec compteur, 2) des filtres par type (Toutes, Commande, Paiement, Message, Promotion, Système, Compte) et un filtre 'Non lues', 3) une liste de notifications avec icônes, badges, dates relatives, 4) des boutons Actualiser et 'Tout marquer lu'. Signale tout problème visuel.",
  },
  {
    path: '/tmp/notif-dropdown-mobile.png',
    prompt:
      "Décris cette capture MOBILE (390px) d'une dropdown de notifications e-commerce. Vérifie : 1) la dropdown prend presque toute la largeur sans dépasser, 2) les notifications sont lisibles sans chevauchement, 3) le footer 'Voir toutes les notifications' visible, 4) l'ensemble est propre et adapté au mobile. Signale tout problème : débordement horizontal, texte coupé, boutons trop petits.",
  },
]

async function main() {
  const zai = await ZAI.create()
  for (const capture of CAPTURES) {
    if (!fs.existsSync(capture.path)) {
      console.log(`✗ Capture manquante : ${capture.path}`)
      continue
    }
    const base64 = fs.readFileSync(capture.path).toString('base64')
    try {
      const completion = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
              { type: 'text', text: capture.prompt },
            ],
          },
        ],
        thinking: { type: 'disabled' },
      })
      console.log(`\n═══ ${capture.path} ═══`)
      console.log(completion.choices[0]?.message?.content ?? '(pas de réponse)')
    } catch (e) {
      console.log(`✗ Erreur VLM sur ${capture.path} :`, e)
    }
  }
}

main()
