import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Check if admin already exists
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'contact@maison-khan.com' }
  })

  if (existingAdmin) {
    console.log('✅ Admin user already exists')
    return
  }

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 10)
  
  const admin = await prisma.user.create({
    data: {
      email: 'contact@maison-khan.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'MAISON KHAN',
      role: 'admin',
      isActive: true
    }
  })

  console.log('✅ Created admin user:', admin.email)
  console.log('⚠️  Default password: admin123')
  console.log('⚠️  Please change the password after first login!')

  // Create manager user
  const managerExists = await prisma.user.findUnique({
    where: { email: 'manager@maisonkhan.com' }
  })

  if (!managerExists) {
    const managerPassword = await bcrypt.hash('manager123', 10)
    const manager = await prisma.user.create({
      data: {
        email: 'manager@maisonkhan.com',
        password: managerPassword,
        firstName: 'Manager',
        lastName: 'MAISON KHAN',
        role: 'manager',
        isActive: true
      }
    })
    console.log('✅ Created manager user:', manager.email)
    console.log('⚠️  Default password: manager123')
  }

  console.log('🌱 Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
