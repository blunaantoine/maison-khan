import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Création des comptes admin et manager...\n')

  // Créer l'admin
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
  console.log(`✅ Admin créé: ${admin.email}`)

  // Créer le manager
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
  console.log(`✅ Manager créé: ${manager.email}`)

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
