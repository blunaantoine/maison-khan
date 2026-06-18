import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Generate order number
const generateOrderNumber = async () => {
  const year = new Date().getFullYear()
  const count = await db.order.count({
    where: {
      createdAt: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`)
      }
    }
  })
  return `MK-${year}-${String(count + 1).padStart(4, '0')}`
}

// GET - Get orders
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const role = request.headers.get('x-auth-role')
    const isAdmin = role === 'admin' || role === 'manager'
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const orderId = searchParams.get('id')

    // Get single order
    if (orderId) {
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, image: true }
              }
            }
          },
          payments: true
        }
      })

      if (!order) {
        return NextResponse.json(
          { error: 'Commande non trouvée' },
          { status: 404 }
        )
      }

      // Check ownership (unless admin)
      if (!isAdmin && order.userId !== userId && order.userId !== null) {
        return NextResponse.json(
          { error: 'Non autorisé' },
          { status: 403 }
        )
      }

      return NextResponse.json({ order })
    }

    // List orders
    let where: Record<string, unknown> = {}
    
    if (!isAdmin && userId) {
      // Trouver l'email de l'utilisateur connecté
      const currentUser = await db.user.findUnique({
        where: { id: userId },
        select: { email: true }
      })
      
      // Afficher les commandes liées AU COMPTE ou passées avec LE MÊME EMAIL (sans compte)
      if (currentUser?.email) {
        where = {
          OR: [
            { userId: userId },
            { customerEmail: currentUser.email }
          ]
        }
      } else {
        where.userId = userId
      }
    }
    
    if (status) {
      where.status = status
    }

    const orders = await db.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, image: true }
            }
          }
        },
        payments: {
          select: {
            id: true,
            amount: true,
            status: true,
            paymentMethod: true,
            createdAt: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    // Relier automatiquement les commandes orphelines (sans userId) au compte du client
    if (!isAdmin && userId) {
      const orphanOrders = orders.filter(o => !o.userId)
      if (orphanOrders.length > 0) {
        await db.order.updateMany({
          where: {
            id: { in: orphanOrders.map(o => o.id) },
            userId: null
          },
          data: { userId: userId }
        })
      }
    }

    return NextResponse.json({ orders })
  } catch (error) {
    console.error('Get orders error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la récupération des commandes' },
      { status: 500 }
    )
  }
}

// POST - Create order
// export async function POST(request: NextRequest) {
//   try {
//     const userId = request.headers.get('x-user-id')
//     const validUserId = userId && userId !== '' ? userId : null
//     const body = await request.json()

//     console.log('Données reçues:', JSON.stringify(body, null, 2))

//     const { 
//       items, 
//       customerInfo, 
//       shippingAddress, 
//       paymentMethod,
//       subtotal,
//       shippingCost,
//       total
//     } = body

//     if (!items || items.length === 0) {
//       return NextResponse.json(
//         { error: 'Le panier est vide' },
//         { status: 400 }
//       )
//     }

//     if (!customerInfo?.email || !customerInfo?.phone) {
//       return NextResponse.json(
//         { error: 'Informations de contact requises' },
//         { status: 400 }
//       )
//     }

//     // Generate order number
//     const orderNumber = await generateOrderNumber()

//     // Create order
//     const order = await db.order.create({
//       data: {
//         orderNumber,
//         userId: validUserId || null,
//         customerEmail: customerInfo.email,
//         customerPhone: customerInfo.phone,
//         customerFirstName: customerInfo.firstName || null,
//         customerLastName: customerInfo.lastName || null,
//         shippingAddress: shippingAddress?.address || null,
//         shippingCity: shippingAddress?.city || null,
//         shippingCountry: shippingAddress?.country || 'Togo',
//         shippingPhone: shippingAddress?.phone || customerInfo.phone,
//         // shippingLatitude: shippingAddress?.latitude || null,
//         // shippingLongitude: shippingAddress?.longitude || null,

//         shippingLatitude: shippingAddress?.latitude ? parseFloat(shippingAddress.latitude.toString()) : null,
//         shippingLongitude: shippingAddress?.longitude ? parseFloat(shippingAddress.longitude.toString()) : null,

//         subtotal: subtotal || 0,
//         shippingCost: shippingCost || 0,
//         discount: 0,
//         total: total || 0,
//         status: 'pending',
//         paymentStatus: 'pending',
//         paymentMethod: paymentMethod || null,
//         items: {
//           create: items.map((item: Record<string, unknown>) => ({
//             productId: item.productId as string || null,
//             productName: item.productName as string || item.name as string,
//             productImage: item.productImage as string || item.image as string || null,
//             colorName: item.colorName as string || null,
//             size: item.size as string,
//             quantity: item.quantity as number,
//             unitPrice: item.unitPrice as number || item.price as number,
//             totalPrice: (item.unitPrice as number || item.price as number) * (item.quantity as number)
//           }
        
//         ))
//         }
//       },
//       include: {
//         items: true
//       }
//     })

//     // Clear cart after order creation
//     if (userId) {
//       await db.cartItem.deleteMany({ where: { userId } })
//     }

//     return NextResponse.json({
//       message: 'Commande créée avec succès',
//       order
//     })
//   } catch (error) {
//     console.error('Create order error:', error)
//     console.error('Erreur complète:', error)
//     return NextResponse.json(
//       { error: 'Erreur lors de la création de la commande' },
//       { status: 500 }
//     )
//   }
// }

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-auth-user-id')
    const validUserId = userId && userId !== '' ? userId : null  // <-- AJOUTEZ CETTE LIGNE
    
    const body = await request.json()
    console.log('Données reçues:', JSON.stringify(body, null, 2))
    
    const { 
      items, 
      customerInfo, 
      shippingAddress, 
      paymentMethod,
      subtotal,
      shippingCost,
      total
    } = body

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Le panier est vide' },
        { status: 400 }
      )
    }

    if (!customerInfo?.email || !customerInfo?.phone) {
      return NextResponse.json(
        { error: 'Informations de contact requises' },
        { status: 400 }
      )
    }

    const orderNumber = await generateOrderNumber()

    const order = await db.order.create({
      data: {
        orderNumber,
        userId: validUserId,  // <-- UTILISEZ validUserId ICI
        customerEmail: customerInfo.email,
        customerPhone: customerInfo.phone,
        customerFirstName: customerInfo.firstName || null,
        customerLastName: customerInfo.lastName || null,
        shippingAddress: shippingAddress?.address || null,
        shippingCity: shippingAddress?.city || null,
        shippingCountry: shippingAddress?.country || 'Togo',
        shippingPhone: shippingAddress?.phone || customerInfo.phone,
        shippingLatitude: shippingAddress?.latitude ? parseFloat(shippingAddress.latitude.toString()) : null,
        shippingLongitude: shippingAddress?.longitude ? parseFloat(shippingAddress.longitude.toString()) : null,
        subtotal: subtotal || 0,
        shippingCost: shippingCost || 0,
        discount: 0,
        total: total || 0,
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: paymentMethod || null,
        items: {
          create: items.map((item: Record<string, unknown>) => ({
            productId: item.productId as string || null,
            productName: item.productName as string || item.name as string,
            productImage: item.productImage as string || item.image as string || null,
            colorName: item.colorName as string || null,
            size: item.size as string,
            quantity: item.quantity as number,
            unitPrice: item.unitPrice as number || item.price as number,
            totalPrice: (item.unitPrice as number || item.price as number) * (item.quantity as number)
          }))
        }
      },
      include: {
        items: true
      }
    })

    if (validUserId) {
      await db.cartItem.deleteMany({ where: { userId: validUserId } })
    }

    return NextResponse.json({
      message: 'Commande créée avec succès',
      order
    })
  } catch (error) {
    console.error('Erreur complète:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la création de la commande', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// PUT - Update order (admin or status update)
export async function PUT(request: NextRequest) {
  try {
    const role = request.headers.get('x-auth-role')
    const isAdmin = role === 'admin' || role === 'manager'
    const body = await request.json()
    const { id, status, paymentStatus, trackingNumber, notes, estimatedDelivery } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID commande requis' },
        { status: 400 }
      )
    }

    // Only admin can update most fields
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Non autorisé' },
        { status: 403 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (paymentStatus) updateData.paymentStatus = paymentStatus
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber
    if (notes !== undefined) updateData.notes = notes
    if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery

    const order = await db.order.update({
      where: { id },
      data: updateData,
      include: {
        items: true,
        payments: true
      }
    })

    return NextResponse.json({
      message: 'Commande mise à jour',
      order
    })
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json(
      { error: 'Erreur lors de la mise à jour de la commande' },
      { status: 500 }
    )
  }
}
