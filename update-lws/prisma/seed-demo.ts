import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Début du seed...')

  // 1. Créer les catégories du menu
  const chaussuresCategory = await prisma.menuCategory.upsert({
    where: { slug: 'chaussures' },
    update: {},
    create: {
      name: 'Chaussures',
      slug: 'chaussures',
      order: 1,
      isActive: true
    }
  })
  
  const accessoiresCategory = await prisma.menuCategory.upsert({
    where: { slug: 'accessoires' },
    update: {},
    create: {
      name: 'Accessoires',
      slug: 'accessoires',
      order: 2,
      isActive: true
    }
  })
  
  console.log('✅ Catégories créées')

  // 2. Créer les sous-catégories
  await prisma.subCategory.upsert({
    where: { slug: 'mules' },
    update: {},
    create: {
      name: 'Mules',
      slug: 'mules',
      genre: 'femme',
      menuCategoryId: chaussuresCategory.id,
      order: 1
    }
  })
  
  await prisma.subCategory.upsert({
    where: { slug: 'sandales' },
    update: {},
    create: {
      name: 'Sandales',
      slug: 'sandales',
      genre: 'femme',
      menuCategoryId: chaussuresCategory.id,
      order: 2
    }
  })
  
  await prisma.subCategory.upsert({
    where: { slug: 'ballerines' },
    update: {},
    create: {
      name: 'Ballerines',
      slug: 'ballerines',
      genre: 'femme',
      menuCategoryId: chaussuresCategory.id,
      order: 3
    }
  })
  
  await prisma.subCategory.upsert({
    where: { slug: 'mocassins' },
    update: {},
    create: {
      name: 'Mocassins',
      slug: 'mocassins',
      genre: 'homme',
      menuCategoryId: chaussuresCategory.id,
      order: 4
    }
  })
  
  await prisma.subCategory.upsert({
    where: { slug: 'sacs' },
    update: {},
    create: {
      name: 'Sacs',
      slug: 'sacs',
      genre: 'all',
      menuCategoryId: accessoiresCategory.id,
      order: 1
    }
  })
  
  await prisma.subCategory.upsert({
    where: { slug: 'ceintures' },
    update: {},
    create: {
      name: 'Ceintures',
      slug: 'ceintures',
      genre: 'all',
      menuCategoryId: accessoiresCategory.id,
      order: 2
    }
  })
  
  console.log('✅ Sous-catégories créées')

  // 3. Créer le contenu du site
  const siteContentData = [
    { key: 'hero_title', value: 'L\'Art de la', description: 'Titre principal hero', category: 'hero' },
    { key: 'hero_title_highlight', value: 'Chaussure Artisanale', description: 'Mise en avant du titre hero', category: 'hero' },
    { key: 'hero_description', value: 'Découvrez des créations uniques, façonnées avec passion par des artisans togolais. Chaque paire raconte une histoire d\'excellence et de tradition.', description: 'Description hero', category: 'hero' },
    { key: 'hero_button_primary', value: 'Voir les créations', description: 'Bouton principal hero', category: 'hero' },
    { key: 'hero_button_secondary', value: 'Notre Histoire', description: 'Bouton secondaire hero', category: 'hero' },
    { key: 'maison_title', value: 'Notre Maison', description: 'Titre section Maison', category: 'maison' },
    { key: 'maison_subtitle', value: 'L\'Excellence Artisanale', description: 'Sous-titre section Maison', category: 'maison' },
    { key: 'maison_description', value: 'MAISON KHAN incarne l\'excellence de l\'artisanat africain. Chaque création est le fruit d\'un savoir-faire transmis de génération en génération, alliant tradition et modernité pour offrir des pièces uniques.', description: 'Description section Maison', category: 'maison' },
    { key: 'about_title', value: 'Notre Histoire', description: 'Titre section À propos', category: 'about' },
    { key: 'about_description', value: 'Fondée avec la vision de valoriser l\'artisanat togolais, MAISON KHAN est née de la passion pour les belles matières et le savoir-faire ancestral. Nos artisans perpétuent des techniques traditionnelles tout en embrassant l\'innovation pour créer des pièces intemporelles.', description: 'Description section À propos', category: 'about' },
    { key: 'contact_address', value: 'Lomé, Togo', description: 'Adresse', category: 'contact' },
    { key: 'contact_phone', value: '+228 70 16 67 67', description: 'Téléphone', category: 'contact' },
    { key: 'contact_email', value: 'contact@maisonkhan.com', description: 'Email', category: 'contact' },
  ]
  
  for (const content of siteContentData) {
    await prisma.siteContent.upsert({
      where: { key: content.key },
      update: { value: content.value },
      create: content
    })
  }
  
  console.log('✅ Contenu du site créé')

  console.log('🎉 Seed terminé avec succès!')
  console.log('📝 Le menu est maintenant disponible.')
  console.log('📝 Allez dans Admin pour ajouter des produits.')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
