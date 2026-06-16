import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - List addresses
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const addresses = await db.address.findMany({
      where: { userId },
      orderBy: { isDefault: 'desc' }
    })

    return NextResponse.json({ addresses })
  } catch (error) {
    console.error('Get addresses error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des adresses' },
      { status: 500 }
    )
  }
}

// POST - Create address
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { label, firstName, lastName, phone, country, city, address, postalCode, isDefault } = body

    if (!firstName || !lastName || !phone || !city || !address) {
      return NextResponse.json(
        { error: 'Veuillez remplir tous les champs obligatoires' },
        { status: 400 }
      )
    }

    // If this is the default address, remove default from others
    if (isDefault) {
      await db.address.updateMany({
        where: { userId },
        data: { isDefault: false }
      })
    }

    const newAddress = await db.address.create({
      data: {
        userId,
        label: label || 'Adresse',
        firstName,
        lastName,
        phone,
        country: country || 'Togo',
        city,
        address,
        postalCode: postalCode || null,
        isDefault: isDefault || false
      }
    })

    return NextResponse.json({
      message: 'Adresse ajoutée avec succès',
      address: newAddress
    })
  } catch (error) {
    console.error('Create address error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de l\'ajout de l\'adresse' },
      { status: 500 }
    )
  }
}

// PUT - Update address
export async function PUT(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { id, label, firstName, lastName, phone, country, city, address, postalCode, isDefault } = body

    // Verify ownership
    const existingAddress = await db.address.findFirst({
      where: { id, userId }
    })

    if (!existingAddress) {
      return NextResponse.json(
        { error: 'Adresse non trouvée' },
        { status: 404 }
      )
    }

    // If this is the default address, remove default from others
    if (isDefault) {
      await db.address.updateMany({
        where: { userId, NOT: { id } },
        data: { isDefault: false }
      })
    }

    const updatedAddress = await db.address.update({
      where: { id },
      data: {
        label: label || existingAddress.label,
        firstName: firstName || existingAddress.firstName,
        lastName: lastName || existingAddress.lastName,
        phone: phone || existingAddress.phone,
        country: country || existingAddress.country,
        city: city || existingAddress.city,
        address: address || existingAddress.address,
        postalCode: postalCode || null,
        isDefault: isDefault ?? existingAddress.isDefault
      }
    })

    return NextResponse.json({
      message: 'Adresse mise à jour',
      address: updatedAddress
    })
  } catch (error) {
    console.error('Update address error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de l\'adresse' },
      { status: 500 }
    )
  }
}

// DELETE - Delete address
export async function DELETE(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!userId) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 401 }
      )
    }

    if (!id) {
      return NextResponse.json(
        { error: 'ID adresse requis' },
        { status: 400 }
      )
    }

    // Verify ownership
    const address = await db.address.findFirst({
      where: { id, userId }
    })

    if (!address) {
      return NextResponse.json(
        { error: 'Adresse non trouvée' },
        { status: 404 }
      )
    }

    await db.address.delete({
      where: { id }
    })

    return NextResponse.json({
      message: 'Adresse supprimée'
    })
  } catch (error) {
    console.error('Delete address error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de l\'adresse' },
      { status: 500 }
    )
  }
}
