import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  try {
    // Check if admin already exists
    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' }
    })

    if (existingAdmin) {
      return NextResponse.json({
        initialized: true,
        message: 'Admin already exists',
        adminEmail: existingAdmin.email
      })
    }

    // Create default admin
    const hashedPassword = await bcrypt.hash('admin123', 10)

    const admin = await db.user.create({
      data: {
        email: 'contact@maison-khan.com',
        password: hashedPassword,
        firstName: 'Admin',
        lastName: 'MAISON KHAN',
        role: 'admin',
        isActive: true
      }
    })

    // Create default manager
    const managerPassword = await bcrypt.hash('manager123', 10)
    await db.user.create({
      data: {
        email: 'manager@maisonkhan.com',
        password: managerPassword,
        firstName: 'Manager',
        lastName: 'MAISON KHAN',
        role: 'manager',
        isActive: true
      }
    })

    return NextResponse.json({
      initialized: true,
      message: 'Admin and manager created successfully',
      adminEmail: admin.email,
      defaultPassword: 'admin123',
      warning: 'Please change the default password after first login!'
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json({
      initialized: false,
      error: 'Failed to initialize'
    }, { status: 500 })
  }
}
