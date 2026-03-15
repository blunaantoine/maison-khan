import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Intelligent rule-based chatbot for MAISON KHAN

// Get products from database
async function getProductsInfo(): Promise<string> {
  try {
    const products = await db.product.findMany({
      where: { isActive: true },
      include: { colors: { orderBy: { order: 'asc' } } },
      take: 10
    })
    
    if (products.length === 0) return "Nous avons des chaussures de luxe artisanales disponibles."
    
    return products.map(p => {
      const colors = p.colors?.map(c => c.colorName).join(', ') || 'Standard'
      const sizes = p.sizes?.join(', ') || 'Variées'
      return `• ${p.name} - Tailles: ${sizes} - Couleurs: ${colors}`
    }).join('\n')
  } catch {
    return "Des chaussures de luxe artisanales pour homme et femme sont disponibles."
  }
}

// Generate contextual response
async function generateResponse(message: string): Promise<string> {
  const msg = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  
  // Greeting patterns
  if (msg.match(/bonjour|salut|hello|coucou|hey|bonsoir/)) {
    return `Bonjour et bienvenue chez MAISON KHAN !

Je suis votre assistant personnel. Je suis là pour vous aider à trouver la paire de chaussures parfaite.

Que recherchez-vous aujourd'hui ?
• Des chaussures pour homme ou femme ?
• Pour quelle occasion ? (mariage, travail, casual...)
• Avez-vous un budget en tête ?`
  }
  
  // About MAISON KHAN
  if (msg.match(/maison khan|qui etes vous|votre histoire|apropos|a propos|parlez moi/)) {
    return `MAISON KHAN - Chaussures de Luxe Artisanales

Nous sommes une maison de création de chaussures de luxe, fièrement Made in Africa.

Notre histoire:
Chaque paire est fabriquée à la main par des artisans qualifiés au Togo, avec un souci du détail et une qualité exceptionnelle.

Nos valeurs:
• Artisanat d'excellence
• Made in Africa avec fierté
• Qualité et durabilité
• Design unique et élégant

Nous trouver:
Adresse: Lomé, Togo
WhatsApp: +228 70 16 67 67
Email: contact@maison-khan.com`
  }
  
  // Products for men
  if (msg.match(/homme|masculin|monsieur|pour lui/)) {
    const products = await getProductsInfo()
    return `Excellent choix ! Nous avons de magnifiques créations pour homme.

Nos modèles pour homme:
${products}

Questions pour mieux vous aider:
• Quel style recherchez-vous ? (classique, décontracté, habillé)
• Pour quelle occasion ? (travail, mariage, casual)
• Quelle est votre pointure ?

Pour plus de détails, contactez-nous sur WhatsApp: +228 70 16 67 67`
  }
  
  // Products for women
  if (msg.match(/femme|feminin|dame|pour elle|madame/)) {
    const products = await getProductsInfo()
    return `Parfait ! Nous avons de superbes créations pour femme.

Nos modèles pour femme:
${products}

Questions pour mieux vous aider:
• Quel style préférez-vous ? (talons, plats, sandales)
• Pour quelle occasion ? (soirée, travail, casual)
• Quelle est votre pointure ?

Pour personnaliser votre choix: WhatsApp +228 70 16 67 67`
  }
  
  // Pricing
  if (msg.match(/prix|combien|cout|tarif|budget|cher|pas cher/)) {
    return `Nos tarifs dépendent du modèle et des finitions.

Fourchette de prix:
• 15 000 - 30 000 XOF : Modèles casual
• 30 000 - 50 000 XOF : Modèles classiques
• 50 000 - 80 000 XOF : Modèles premium & sur-mesure

Chaque paire est une création artisanale unique, fabriquée avec des matériaux de première qualité.

Pour un devis précis, envoyez-nous le modèle qui vous intéresse sur WhatsApp: +228 70 16 67 67`
  }
  
  // Delivery
  if (msg.match(/livraison|delai|expedition|recevoir|livrer|envoi/)) {
    return `Livraison

Livraison GRATUITE (frais de port offerts)

Délais de livraison:
• Togo : 3-7 jours
• Afrique de l'Ouest : 7-15 jours
• International : 15-30 jours

À noter:
• Frais d'envoi au transporteur à votre charge
• Taxes et douanes selon votre pays

Suivi de commande: WhatsApp +228 70 16 67 67`
  }
  
  // Returns/Exchange
  if (msg.match(/retour|echange|remboursement|changer|taille ne va pas/)) {
    return `Politique de Retours & Échanges

Échanges possibles - Les frais de livraison sont à votre charge.

Conditions:
• Frais d'expédition non remboursables
• Aucun retour international accepté

Pour un échange, contactez-nous rapidement via WhatsApp: +228 70 16 67 67
Nous trouverons ensemble la meilleure solution !`
  }
  
  // How to order
  if (msg.match(/commander|acheter|payer|commande|comment faire/)) {
    return `Comment commander

Option 1 - Sur le site:
1. Parcourez notre catalogue
2. Ajoutez au panier
3. Passez commande avec CinetPay

Option 2 - Via WhatsApp:
Envoyez-nous directement votre commande au +228 70 16 67 67

Paiement accepté:
• T-Money
• Moov Money
• Cartes bancaires
• Virement

Besoin d'aide ? Je suis là pour vous guider !`
  }
  
  // Sizes
  if (msg.match(/taille|pointure|mesure|grandeur/)) {
    return `Guide des tailles

Pour trouver votre pointure idéale:

1. Mesurez votre pied (de la pointe au talon)
2. Ajoutez 0.5cm pour le confort
3. Reportez-vous à notre tableau

Pointures disponibles:
• Homme: 38-46
• Femme: 35-42

Conseil: Si vous hésitez entre deux tailles, prenez la plus grande.

Pour des conseils personnalisés: +228 70 16 67 67`
  }
  
  // Wedding/Special occasion
  if (msg.match(/mariage|mariee|marié|celebration|fete|soiree|evenement/)) {
    return `Félicitations ! Pour un mariage, nous avons des modèles parfaits.

Pour lui:
• Chaussures classiques en cuir
• Richelieu et Derby élégants
• Finitions premium

Pour elle:
• Sandales de soirée
• Escarpins raffinés
• Talons confortables

Conseil personnalisé:
Envoyez-nous une photo de votre tenue sur WhatsApp (+228 70 16 67 67) pour des recommandations sur-mesure !`
  }
  
  // Contact advisor
  if (msg.match(/conseiller|humain|personne|parler|whatsapp|contact/)) {
    return `Je vais vous mettre en contact avec notre équipe !

Contactez-nous directement:

WhatsApp: +228 70 16 67 67
Email: contact@maison-khan.com
Adresse: Lomé, Togo

Notre équipe est disponible pour:
• Conseils personnalisés
• Commandes sur-mesure
• Suivi de livraison
• Toute autre question

À très bientôt !`
  }
  
  // Colors
  if (msg.match(/couleur|coloris|teinte|noir|blanc|marron/)) {
    return `Nos coloris disponibles

Nous proposons une large gamme de couleurs:

Classiques:
• Noir
• Marron (différentes nuances)
• Beige

Tendances:
• Blanc
• Bordeau
• Bleu marine
• Doré/Argenté (pour les occasions)

Personnalisation:
Vous ne trouvez pas votre couleur ? Nous pouvons créer la paire de vos rêves !

Contactez-nous: +228 70 16 67 67`
  }
  
  // Stock/Availability
  if (msg.match(/stock|disponible|disponibilite|reste|available/)) {
    return `Les stocks varient selon les modèles.

Pour vérifier la disponibilité:
1. Indiquez le modèle qui vous intéresse
2. Précisez votre pointure
3. Mentionnez la couleur souhaitée

Je peux vérifier pour vous, ou contactez directement notre équipe:
WhatsApp: +228 70 16 67 67`
  }
  
  // Default response for unknown queries
  const products = await getProductsInfo()
  return `Je comprends votre question ! Permettez-moi de vous aider.

Ce que je peux faire:
• Vous présenter nos modèles
• Vous renseigner sur les prix
• Expliquer nos politiques (livraison, retours)
• Vous guider pour commander

Nos produits:
${products}

Pour une réponse personnalisée:
WhatsApp: +228 70 16 67 67
Email: contact@maison-khan.com

Que puis-je faire pour vous ?`
}

// Store conversations in memory
const conversations = new Map<string, Array<{ role: string; content: string }>>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, message } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Message requis' },
        { status: 400 }
      )
    }

    const sessionIdKey = sessionId || 'default'
    const history = conversations.get(sessionIdKey) || []
    
    // Generate response
    const response = await generateResponse(message)
    
    // Save to history
    history.push(
      { role: 'user', content: message },
      { role: 'assistant', content: response }
    )
    
    // Keep last 20 messages
    if (history.length > 20) {
      conversations.set(sessionIdKey, history.slice(-20))
    } else {
      conversations.set(sessionIdKey, history)
    }

    return NextResponse.json({
      success: true,
      response: response,
      messageCount: history.length
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { success: true, response: 'Je suis désolé, une erreur est survenue. Contactez-nous via WhatsApp au +228 70 16 67 67 pour une assistance immédiate.' },
      { status: 200 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    if (sessionId) {
      conversations.delete(sessionId)
    }
    return NextResponse.json({ success: true, message: 'Conversation réinitialisée' })
  } catch {
    return NextResponse.json({ success: true, message: 'Conversation réinitialisée' })
  }
}
