import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🔧 Création des comptes admin et manager...\n')

  const adminPasswordRaw = process.env.SEED_ADMIN_PASSWORD
  const managerPasswordRaw = process.env.SEED_MANAGER_PASSWORD

  if (!adminPasswordRaw || !managerPasswordRaw) {
    console.error('❌ Variables SEED_ADMIN_PASSWORD et SEED_MANAGER_PASSWORD requises')
    console.error('   Ex: SEED_ADMIN_PASSWORD=xxx SEED_MANAGER_PASSWORD=xxx bun prisma/seed-admin.ts')
    process.exit(1)
  }

  const adminPassword = await bcrypt.hash(adminPasswordRaw, 12)
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

  const managerPassword = await bcrypt.hash(managerPasswordRaw, 12)
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

  console.log('\n📋 Comptes créés avec les mots de passe fournis via variables d\'environnement.')
}

main()
  .catch((e) => {
    console.error('❌ Erreur:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
