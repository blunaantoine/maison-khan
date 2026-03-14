import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Début du seed...\n')

  // ============================================
  // 1. CRÉER LES CATÉGORIES DU MENU
  // ============================================
  console.log('📂 Création des catégories du menu...')
  
  const chaussures = await prisma.menuCategory.upsert({
    where: { slug: 'chaussures' },
    update: {},
    create: {
      name: 'Chaussures',
      slug: 'chaussures',
      order: 0,
      isActive: true
    }
  })
  console.log(`  ✅ ${chaussures.name}`)
  
  const accessoires = await prisma.menuCategory.upsert({
    where: { slug: 'accessoires' },
    update: {},
    create: {
      name: 'Accessoires',
      slug: 'accessoires',
      order: 1,
      isActive: true
    }
  })
  console.log(`  ✅ ${accessoires.name}`)

  // ============================================
  // 2. CRÉER LES SOUS-CATÉGORIES
  // ============================================
  console.log('\n📁 Création des sous-catégories...')
  
  const subCategoriesData = [
    // Chaussures
    { name: 'Mules', slug: 'mules', genre: 'all', menuCategoryId: chaussures.id, order: 0 },
    { name: 'Sandales', slug: 'sandales', genre: 'all', menuCategoryId: chaussures.id, order: 1 },
    { name: 'Ballerines', slug: 'ballerines', genre: 'femme', menuCategoryId: chaussures.id, order: 2 },
    { name: 'Escarpins', slug: 'escarpins', genre: 'femme', menuCategoryId: chaussures.id, order: 3 },
    { name: 'Mocassins', slug: 'mocassins', genre: 'homme', menuCategoryId: chaussures.id, order: 4 },
    { name: 'Derbies', slug: 'derbies', genre: 'homme', menuCategoryId: chaussures.id, order: 5 },
    { name: 'Bottines', slug: 'bottines', genre: 'all', menuCategoryId: chaussures.id, order: 6 },
    { name: 'Tongs', slug: 'tongs', genre: 'all', menuCategoryId: chaussures.id, order: 7 },
    // Accessoires
    { name: 'Sacs', slug: 'sacs', genre: 'all', menuCategoryId: accessoires.id, order: 0 },
    { name: 'Ceintures', slug: 'ceintures', genre: 'all', menuCategoryId: accessoires.id, order: 1 },
    { name: 'Porte-cartes', slug: 'porte-cartes', genre: 'all', menuCategoryId: accessoires.id, order: 2 },
  ]

  for (const sub of subCategoriesData) {
    const existing = await prisma.subCategory.findFirst({
      where: { slug: sub.slug }
    })
    
    if (!existing) {
      await prisma.subCategory.create({ data: sub })
      console.log(`  ✅ ${sub.name} (${sub.genre})`)
    } else {
      console.log(`  ℹ️ ${sub.name} existe déjà`)
    }
  }

  // ============================================
  // 3. CRÉER DES PRODUITS DE TEST
  // ============================================
  console.log('\n👟 Création de produits de test...')
  
  const testProducts = [
    {
      name: 'Mule Classic Noir',
      category: 'mules',
      subCategory: null,
      genre: 'femme',
      price: 25000,
      stock: 10,
      description: 'Mule élégante en cuir véritable, fabrication artisanale africaine.',
      image: 'https://placehold.co/400x500?text=Mule+Noir',
      sizes: JSON.stringify(['35', '36', '37', '38', '39', '40']),
      colors: '[]',
      type: 'chaussure',
      isActive: true
    },
    {
      name: 'Sandale Élégante Camel',
      category: 'sandales',
      subCategory: null,
      genre: 'femme',
      price: 28000,
      stock: 8,
      description: 'Sandale chic en cuir, parfaite pour l\'été.',
      image: 'https://placehold.co/400x500?text=Sandale+Camel',
      sizes: JSON.stringify(['36', '37', '38', '39', '40', '41']),
      colors: '[]',
      type: 'chaussure',
      isActive: true
    },
    {
      name: 'Mocassin Cuir Homme',
      category: 'mocassins',
      subCategory: null,
      genre: 'homme',
      price: 35000,
      stock: 5,
      description: 'Mocassin en cuir de qualité, confort garanti.',
      image: 'https://placehold.co/400x500?text=Mocassin+Homme',
      sizes: JSON.stringify(['39', '40', '41', '42', '43', '44', '45']),
      colors: '[]',
      type: 'chaussure',
      isActive: true
    },
    {
      name: 'Sac Bandoulière',
      category: 'sacs',
      subCategory: null,
      genre: 'femme',
      price: 45000,
      stock: 3,
      description: 'Sac bandoulière en cuir artisanal.',
      image: 'https://placehold.co/400x500?text=Sac+Bandouliere',
      sizes: JSON.stringify(['Unique']),
      colors: '[]',
      type: 'accessoire',
      isActive: true
    }
  ]

  for (const product of testProducts) {
    const existing = await prisma.product.findFirst({
      where: { name: product.name }
    })
    
    if (!existing) {
      await prisma.product.create({ data: product })
      console.log(`  ✅ ${product.name}`)
    } else {
      console.log(`  ℹ️ ${product.name} existe déjà`)
    }
  }

  // ============================================
  // 4. CRÉER UN HERO SLIDE DE TEST
  // ============================================
  console.log('\n🖼️ Création d\'un slide de test...')
  
  const existingSlide = await prisma.heroSlide.findFirst()
  if (!existingSlide) {
    await prisma.heroSlide.create({
      data: {
        image: 'https://placehold.co/1920x1080?text=MAISON+KHAN',
        title: 'Nouvelle Collection',
        subtitle: 'Made in Africa',
        order: 0,
        isActive: true,
        interval: 5000
      }
    })
    console.log('  ✅ Slide créé')
  } else {
    console.log('  ℹ️ Slide existe déjà')
  }

  // ============================================
  // 5. CRÉER LE CONTENU DU SITE
  // ============================================
  console.log('\n📝 Création du contenu du site...')

  const siteContents = [
    // Hero Section
    { key: 'hero_title', value: "L'Art de la Marche", description: "Titre principal de la page d'accueil", category: 'hero' },
    { key: 'hero_title_highlight', value: "Marche", description: "Mot mis en évidence dans le titre (italique)", category: 'hero' },
    { key: 'hero_description', value: "Chaussures artisanales confectionnées en Afrique. Le savoir-faire Africain au service de l'élégance contemporaine.", description: "Description sous le titre principal", category: 'hero' },
    { key: 'hero_button_primary', value: "Voir les créations", description: "Texte du bouton principal", category: 'hero' },
    { key: 'hero_button_secondary', value: "Nous contacter", description: "Texte du bouton secondaire", category: 'hero' },

    // Nouveautés Section
    { key: 'new_title', value: "Dernières Créations", description: "Titre de la section nouveautés", category: 'nouveautes' },
    { key: 'new_subtitle', value: "Nouveautés", description: "Sous-titre de la section nouveautés", category: 'nouveautes' },
    { key: 'new_description', value: "Découvrez nos dernières pièces artisanales, fraîchement confectionnées par nos artisans.", description: "Description de la section nouveautés", category: 'nouveautes' },

    // Catalogue Section
    { key: 'catalogue_title', value: "Nos Chaussures", description: "Titre de la section catalogue", category: 'catalogue' },
    { key: 'catalogue_subtitle', value: "Catalogue", description: "Sous-titre de la section catalogue", category: 'catalogue' },
    { key: 'catalogue_description', value: "Explorez notre collection de chaussures artisanales, confectionnées avec passion par nos artisans africains.", description: "Description de la section catalogue", category: 'catalogue' },

    // Accessoires Section
    { key: 'accessoires_title', value: "Nos Accessoires", description: "Titre de la section accessoires", category: 'accessoires' },
    { key: 'accessoires_subtitle', value: "Catalogue", description: "Sous-titre de la section accessoires", category: 'accessoires' },
    { key: 'accessoires_description', value: "Complétez votre style avec nos accessoires artisanaux, sacs et ceintures en cuir véritable.", description: "Description de la section accessoires", category: 'accessoires' },

    // Notre Maison Section
    { key: 'maison_title', value: "Notre Maison", description: "Titre de la section Notre Maison", category: 'maison' },
    { key: 'maison_description', value: "MAISON KHAN est une marque de chaussures de luxe artisanales, fièrement confectionnées en Afrique. Chaque paire raconte une histoire de savoir-faire ancestral et d'élégance contemporaine.", description: "Description de la section Notre Maison", category: 'maison' },
    { key: 'maison_subtitle1', value: "Savoir-faire Artisanal", description: "Titre du premier bloc", category: 'maison' },
    { key: 'maison_text1', value: "Chaque chaussure est façonnée à la main par nos artisans qualifiés, perpétuant des techniques ancestrales transmises de génération en génération.", description: "Texte du premier bloc", category: 'maison' },
    { key: 'maison_subtitle2', value: "Cuir Premium", description: "Titre du deuxième bloc", category: 'maison' },
    { key: 'maison_text2', value: "Nous sélectionnons uniquement les meilleurs cuirs pour garantir confort, durabilité et élégance à chacune de nos créations.", description: "Texte du deuxième bloc", category: 'maison' },
    { key: 'maison_subtitle3', value: "Fait en Afrique", description: "Titre du troisième bloc", category: 'maison' },
    { key: 'maison_text3', value: "Fièrement produits sur le continent africain, nos chaussures célèbrent l'excellence et la créativité de l'artisanat local.", description: "Texte du troisième bloc", category: 'maison' },

    // Contact Section
    { key: 'contact_title', value: "Parlons-en", description: "Titre de la section contact", category: 'contact' },
    { key: 'contact_subtitle', value: "Contact", description: "Sous-titre de la section contact", category: 'contact' },
    { key: 'contact_description', value: "Une question, une commande ? Contactez-nous directement.", description: "Description de la section contact", category: 'contact' },
    { key: 'contact_email', value: "contact@maison-khan.com", description: "Adresse email", category: 'contact' },
    { key: 'contact_phone', value: "00228 70 16 67 67", description: "Numéro de téléphone", category: 'contact' },
    { key: 'contact_whatsapp', value: "22870166767", description: "Numéro WhatsApp (sans +)", category: 'contact' },
    { key: 'contact_tiktok', value: "https://www.tiktok.com/@maison..khan7", description: "Lien TikTok", category: 'contact' },

    // Footer
    { key: 'footer_brand', value: "MAISON KHAN", description: "Nom de la marque dans le footer", category: 'footer' },
    { key: 'footer_tagline', value: "Chaussures de luxe artisanales Made in Africa", description: "Slogan dans le footer", category: 'footer' },
    { key: 'footer_rights', value: "2024 MAISON KHAN. Tous droits réservés.", description: "Texte des droits réservés", category: 'footer' },
  ]

  for (const content of siteContents) {
    const existing = await prisma.siteContent.findUnique({
      where: { key: content.key }
    })

    if (!existing) {
      await prisma.siteContent.create({ data: content })
      console.log(`  ✅ ${content.key}`)
    } else {
      console.log(`  ℹ️ ${content.key} existe déjà`)
    }
  }

  // ============================================
  // 6. RÉSUMÉ
  // ============================================
  console.log('\n' + '='.repeat(50))
  console.log('📊 RÉSUMÉ')
  console.log('='.repeat(50))
  
  const categories = await prisma.menuCategory.findMany({
    include: { subCategories: true },
    orderBy: { order: 'asc' }
  })
  
  const productsCount = await prisma.product.count()
  const slidesCount = await prisma.heroSlide.count()
  const contentCount = await prisma.siteContent.count()
  
  categories.forEach(cat => {
    console.log(`\n📂 ${cat.name}:`)
    cat.subCategories.forEach(sub => {
      console.log(`   └─ ${sub.name} (${sub.genre})`)
    })
  })
  
  console.log(`\n👟 Produits: ${productsCount}`)
  console.log(`🖼️ Slides: ${slidesCount}`)
  console.log(`📝 Contenu: ${contentCount}`)
  
  console.log('\n✅ Seed terminé avec succès !')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
