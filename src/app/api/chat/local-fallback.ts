/**
 * Mode dégradé local du chatbot — MAISON KHAN.
 *
 * Utilisé quand le moteur IA (z-ai-web-dev-sdk) n'est pas disponible
 * (ex. déploiement VPS sans fichier .z-ai-config). L'assistant répond
 * alors à partir des connaissances réelles de la boutique : paiement,
 * livraison, savoir-faire, contacts, et le CATALOGUE RÉEL reconstruit
 * depuis la base à chaque requête (prix, tailles, disponibilité).
 *
 * Mêmes règles que le prompt LLM : français, ton luxe, concis,
 * jamais d'invention — si l'info manque → WhatsApp.
 */

const WHATSAPP = '+228 70 16 67 67'

/** Raccourcit le catalogue pour rester lisible dans une bulle de chat. */
function shortCatalog(catalog: string, max = 700): string {
  if (catalog.length <= max) return catalog
  return `${catalog.slice(0, max).replace(/\n[^\n]*$/, '')}\n… (et d'autres modèles dans la boutique)`
}

export function buildLocalReply(userMessage: string, catalog: string): string {
  const q = ` ${userMessage.toLowerCase()} `
  const has = (...words: string[]) => words.some((w) => q.includes(w))

  // Salutations / remerciements
  if (has('bonjour', 'salut', 'bonsoir', 'hello', 'coucou', 'bjr', 'slt', 'merci')) {
    return `Bonjour et bienvenue chez MAISON KHAN ✨ Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement ou les livraisons. Que souhaitez-vous savoir ?`
  }

  // Livraison / international / douanes
  if (has('livraison', 'livrer', 'livré', 'expédi', 'international', 'douane', 'colis', 'délai', 'delai')) {
    return `Nous préparons chaque commande dès confirmation du paiement. Le retrait en boutique est possible dès que votre commande est « Prête » (présentez simplement votre numéro de commande), et la livraison locale à Lomé peut être organisée. Les commandes internationales sont expédiées, mais les droits de douane et taxes d'importation restent à la charge du client. Pour une livraison spéciale, écrivez-nous sur WhatsApp (${WHATSAPP}).`
  }

  // Paiement
  if (has('paiement', 'payer', 'paydunya', 'mobile money', 'flooz', 'tmoney', 'carte', 'espèce', 'espece')) {
    return `Le paiement s'effectue en ligne de façon sécurisée via PayDunya — Mobile Money (Flooz, TMoney…) en francs CFA (XOF). Votre commande est préparée dès confirmation du paiement et vous suivez chaque étape depuis votre espace « Mon Compte » (email + notification à chaque mise à jour). Une question sur un paiement en particulier ? WhatsApp : ${WHATSAPP}.`
  }

  // Contact / horaires / boutique
  if (has('contact', 'téléphone', 'telephone', 'whatsapp', 'email', 'mail', 'joindre', 'appeler', 'adresse', 'boutique', 'où êtes', 'ou etes', 'horaire')) {
    return `Vous pouvez nous joindre du lundi au samedi : 📞 WhatsApp / téléphone ${WHATSAPP} · ✉️ contact@maison-khan.com. Nous sommes également sur TikTok (@maison..khan7) et Instagram (@maisonkhanofficial). Notre atelier est à Lomé, au Togo.`
  }

  // Tailles / pointures
  if (has('taille', 'pointure', 'crampon', 'mesure')) {
    return `Chaque modèle propose ses propres tailles : consultez le sélecteur de tailles sur la page du produit qui vous intéresse (les disponibilités y sont en temps réel). Pour un conseil de pointure personnalisé, nos artisans vous répondent avec plaisir sur WhatsApp (${WHATSAPP}).`
  }

  // Prix / produits / catalogue
  if (has('prix', 'coûte', 'coute', 'tarif', 'combien', 'modèle', 'modele', 'disponible', 'catalogue', 'chaussure', 'escarpin', 'sandale', 'bottine', 'mocassin', 'sac', 'accessoire', 'montre', 'ce que vous avez')) {
    return `Avec plaisir ! Voici notre catalogue du moment :\n${shortCatalog(catalog)}\nChaque fiche produit détaille les couleurs, tailles et disponibilités en temps réel. Pour un conseil personnalisé : WhatsApp ${WHATSAPP}.`
  }

  // Retours / échanges / après-vente
  if (has('retour', 'échange', 'echange', 'remboursement', 'après-vente', 'apres-vente', 'problème', 'probleme', 'cassé', 'casse')) {
    return `Nous sommes désolés pour ce désagrément. Pour tout échange, remboursement ou demande après-vente, contactez-nous sur WhatsApp (${WHATSAPP}) avec votre numéro de commande : notre équipe étudiera la meilleure solution avec vous, en toute transparence.`
  }

  // Commande / suivi
  if (has('commande', 'suivi', 'suivre', 'statut', 'compte')) {
    return `Vous pouvez suivre votre commande en temps réel depuis votre espace « Mon Compte » — un email et une notification vous sont envoyés à chaque étape (confirmée, en préparation, prête, livrée). Vous y retrouverez aussi l'historique de vos achats. Pour toute question sur une commande en cours : WhatsApp ${WHATSAPP}.`
  }

  // Savoir-faire / atelier / marque
  if (has('atelier', 'artisan', 'fabriqu', 'savoir-faire', 'cuir', 'qualité', 'qualite', 'marque', 'maison khan', 'qui êtes', 'qui etes', 'lomé', 'lome', 'togo', 'africa', 'afrique')) {
    return `MAISON KHAN est une maison de chaussures et d'accessoires de luxe entièrement fabriqués à la main dans nos ateliers de Lomé, au Togo. Chaque pièce suit quatre étapes : cuir sélectionné (peaux premium), coupe artisanale à la main, couture main méticuleuse et finition luxe avec contrôle qualité rigoureux. « L'excellence artisanale africaine sur chaque pas que vous faites. » ✨`
  }

  // Réductions / promotions
  if (has('promotion', 'réduction', 'reduction', 'remise', 'soldes', 'promo')) {
    return `Nos prix reflètent le travail artisanal de nos créations, et chaque offre éventuelle est affichée directement sur les fiches produits. Pour un projet particulier ou une commande spéciale, nos équipes vous répondent sur WhatsApp (${WHATSAPP}).`
  }

  // Fallback générique
  return `Je suis l'assistant de MAISON KHAN ✨ Je peux vous renseigner sur nos créations, les prix, les tailles, le paiement (PayDunya) ou les livraisons. Voici notre catalogue actuel :\n${shortCatalog(catalog)}\nPour une demande précise, nos équipes vous répondent sur WhatsApp : ${WHATSAPP}.`
}
