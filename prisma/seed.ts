import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Initialisation de la base de données...\n')

  // ============================================
  // 1. CRÉER LES COMPTES ADMIN ET MANAGER
  // ============================================
  console.log('👤 Création des comptes administrateurs...')

  const adminPassword = await bcrypt.hash('Khan1975@@', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'technique@maison-khan.com' },
    update: {
      password: adminPassword,
      role: 'admin',
      isActive: true
    },
    create: {
      email: 'technique@maison-khan.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'MAISON KHAN',
      role: 'admin',
      isActive: true
    }
  })
  console.log(`  ✅ Admin: ${admin.email}`)

  const managerPassword = await bcrypt.hash('Manager2024@@', 10)
  const manager = await prisma.user.upsert({
    where: { email: 'manager@maisonkhan.com' },
    update: {
      password: managerPassword,
      role: 'manager',
      isActive: true
    },
    create: {
      email: 'manager@maisonkhan.com',
      password: managerPassword,
      firstName: 'Manager',
      lastName: 'MAISON KHAN',
      role: 'manager',
      isActive: true
    }
  })
  console.log(`  ✅ Manager: ${manager.email}`)

  // ============================================
  // 2. CRÉER LES CATÉGORIES DU MENU
  // ============================================
  console.log('\n📂 Création des catégories du menu...')

  const menuCategories = [
    { name: 'Chaussures', slug: 'chaussures', order: 1, isActive: true },
    { name: 'Accessoires', slug: 'accessoires', order: 2, isActive: true }
  ]

  for (const cat of menuCategories) {
    const existing = await prisma.menuCategory.findFirst({
      where: { slug: cat.slug }
    })
    
    if (!existing) {
      await prisma.menuCategory.create({ data: cat })
      console.log(`  ✅ ${cat.name}`)
    } else {
      console.log(`  ℹ️ ${cat.name} existe déjà`)
    }
  }

  // ============================================
  // 3. CRÉER LES SOUS-CATÉGORIES
  // ============================================
  console.log('\n📁 Création des sous-catégories...')

  const chaussuresCategory = await prisma.menuCategory.findFirst({
    where: { slug: 'chaussures' }
  })
  const accessoiresCategory = await prisma.menuCategory.findFirst({
    where: { slug: 'accessoires' }
  })

  const subCategories = [
    { name: 'Mules', slug: 'mules', genre: 'femme', menuCategoryId: chaussuresCategory?.id || '', order: 1, isActive: true },
    { name: 'Sandales', slug: 'sandales', genre: 'femme', menuCategoryId: chaussuresCategory?.id || '', order: 2, isActive: true },
    { name: 'Ballerines', slug: 'ballerines', genre: 'femme', menuCategoryId: chaussuresCategory?.id || '', order: 3, isActive: true },
    { name: 'Escarpins', slug: 'escarpins', genre: 'femme', menuCategoryId: chaussuresCategory?.id || '', order: 4, isActive: true },
    { name: 'Mocassins', slug: 'mocassins', genre: 'homme', menuCategoryId: chaussuresCategory?.id || '', order: 5, isActive: true },
    { name: 'Derbies', slug: 'derbies', genre: 'homme', menuCategoryId: chaussuresCategory?.id || '', order: 6, isActive: true },
    { name: 'Bottines', slug: 'bottines', genre: 'mixte', menuCategoryId: chaussuresCategory?.id || '', order: 7, isActive: true },
    { name: 'Tongs', slug: 'tongs', genre: 'mixte', menuCategoryId: chaussuresCategory?.id || '', order: 8, isActive: true },
    { name: 'Sacs', slug: 'sacs', genre: 'femme', menuCategoryId: accessoiresCategory?.id || '', order: 1, isActive: true },
    { name: 'Ceintures', slug: 'ceintures', genre: 'mixte', menuCategoryId: accessoiresCategory?.id || '', order: 2, isActive: true },
    { name: 'Porte-cartes', slug: 'porte-cartes', genre: 'mixte', menuCategoryId: accessoiresCategory?.id || '', order: 3, isActive: true }
  ]

  for (const sub of subCategories) {
    if (!sub.menuCategoryId) continue
    
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
  ]

  for (const content of siteContents) {
    const existing = await prisma.siteContent.findFirst({
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
  // 6. PARAMÈTRES DU SITE
  // ============================================
  console.log('\n⚙️ Création des paramètres du site...')

  const settings = [
    { key: 'site_name', value: 'MAISON KHAN' },
    { key: 'contact_email', value: 'contact@maison-khan.com' },
    { key: 'contact_phone', value: '+228 70 16 67 67' },
    { key: 'contact_address', value: 'Lomé, Togo' },
    { key: 'whatsapp_number', value: '+22870166767' },
    { key: 'facebook_url', value: 'https://facebook.com/maisonkhan' },
    { key: 'instagram_url', value: 'https://instagram.com/maisonkhan' }
  ]

  for (const setting of settings) {
    const existing = await prisma.siteSetting.findFirst({
      where: { key: setting.key }
    })
    
    if (!existing) {
      await prisma.siteSetting.create({ data: setting })
      console.log(`  ✅ ${setting.key}`)
    } else {
      console.log(`  ℹ️ ${setting.key} existe déjà`)
    }
  }

  console.log('\n✅ Initialisation terminée avec succès!')
  console.log('\n📋 Comptes créés:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Admin:')
  console.log('  Email: technique@maison-khan.com')
  console.log('  Mot de passe: Khan1975@@')
  console.log('')
  console.log('Manager:')
  console.log('  Email: manager@maisonkhan.com')
  console.log('  Mot de passe: Manager2024@@')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
