import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/admin/stats
 *
 * Tableau de bord — statistiques agrégées pour l'espace admin/manager.
 *
 * Défense en profondeur : le middleware a déjà vérifié le JWT et le rôle,
 * mais on re-vérifie en base (rôle / isActive) au cas où l'utilisateur
 * aurait été désactivé ou rétrogradé après l'émission du token.
 */
async function authorize(request: NextRequest) {
  const userId = request.headers.get('x-auth-user-id')
  const role = request.headers.get('x-auth-role')
  if (!userId || !role) return null
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  if (user.role !== role) return null
  if (user.role !== 'admin' && user.role !== 'manager') return null
  return user
}

export async function GET(request: NextRequest) {
  try {
    const authUser = await authorize(request)
    if (!authUser) {
      return NextResponse.json(
        { error: 'Accès non autorisé' },
        { status: 403 }
      )
    }

    // Fenêtre de temps : 30 derniers jours
    const now = new Date()
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29) // 30 jours inclus aujourd'hui
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const startOfToday = new Date(now)
    startOfToday.setHours(0, 0, 0, 0)

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    // ──────────────────────────────────────────────────────────────
    // 1. Compteurs globaux (KPIs)
    // ──────────────────────────────────────────────────────────────
    const [
      allOrders,
      paidOrders,
      totalProducts,
      activeProducts,
      totalUsers,
      newUsersThisMonth,
      activeCarts,
    ] = await Promise.all([
      db.order.findMany({
        select: {
          id: true,
          total: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          createdAt: true,
        },
      }),
      db.order.findMany({
        where: { paymentStatus: 'paid' },
        select: { total: true, createdAt: true, paymentMethod: true },
      }),
      db.product.count(),
      db.product.count({ where: { isActive: true } }),
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.cartItem.count(),
    ])

    const totalRevenue = paidOrders.reduce((sum, o) => sum + o.total, 0)
    const totalOrders = allOrders.length
    const avgOrderValue = paidOrders.length > 0 ? Math.round(totalRevenue / paidOrders.length) : 0
    const conversionRate =
      totalOrders > 0
        ? Math.round((paidOrders.length / totalOrders) * 1000) / 10 // 1 décimale
        : 0

    // Revenu aujourd'hui
    const revenueToday = paidOrders
      .filter((o) => o.createdAt >= startOfToday)
      .reduce((sum, o) => sum + o.total, 0)

    // Revenu ce mois-ci
    const revenueThisMonth = paidOrders
      .filter((o) => o.createdAt >= startOfMonth)
      .reduce((sum, o) => sum + o.total, 0)

    // ──────────────────────────────────────────────────────────────
    // 2. Tendance du revenu — 30 derniers jours
    // ──────────────────────────────────────────────────────────────
    const revenueByDay: { date: string; revenue: number; orders: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const day = new Date(thirtyDaysAgo)
      day.setDate(thirtyDaysAgo.getDate() + i)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)

      const dayOrders = paidOrders.filter(
        (o) => o.createdAt >= dayStart && o.createdAt <= dayEnd
      )
      revenueByDay.push({
        date: dayStart.toISOString().slice(0, 10),
        revenue: dayOrders.reduce((sum, o) => sum + o.total, 0),
        orders: dayOrders.length,
      })
    }

    // ──────────────────────────────────────────────────────────────
    // 3. Répartition des commandes par statut
    // ──────────────────────────────────────────────────────────────
    const statusCounts: Record<string, number> = {}
    for (const o of allOrders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1
    }

    // ──────────────────────────────────────────────────────────────
    // 4. Répartition par méthode de paiement (payées)
    // ──────────────────────────────────────────────────────────────
    const paymentMethodCounts: Record<string, { count: number; revenue: number }> = {}
    for (const o of paidOrders) {
      const method = o.paymentMethod || 'inconnu'
      if (!paymentMethodCounts[method]) {
        paymentMethodCounts[method] = { count: 0, revenue: 0 }
      }
      paymentMethodCounts[method].count += 1
      paymentMethodCounts[method].revenue += o.total
    }

    // ──────────────────────────────────────────────────────────────
    // 5. Top 5 produits (par quantité vendue, commandes payées)
    // ──────────────────────────────────────────────────────────────
    const paidOrderIds = (
      await db.order.findMany({
        where: { paymentStatus: 'paid' },
        select: { id: true },
      })
    ).map((o) => o.id)

    let topProducts: {
      id: string
      name: string
      image: string
      quantitySold: number
      revenue: number
    }[] = []

    if (paidOrderIds.length > 0) {
      const orderItems = await db.orderItem.findMany({
        where: { orderId: { in: paidOrderIds } },
        select: {
          productId: true,
          productName: true,
          productImage: true,
          quantity: true,
          totalPrice: true,
        },
      })

      const productMap = new Map<
        string,
        { name: string; image: string; quantity: number; revenue: number }
      >()
      for (const item of orderItems) {
        if (!item.productId) continue
        const existing = productMap.get(item.productId)
        if (existing) {
          existing.quantity += item.quantity
          existing.revenue += item.totalPrice
        } else {
          productMap.set(item.productId, {
            name: item.productName,
            image: item.productImage || '',
            quantity: item.quantity,
            revenue: item.totalPrice,
          })
        }
      }

      topProducts = Array.from(productMap.entries())
        .map(([id, val]) => ({ id, ...val }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)
    }

    // ──────────────────────────────────────────────────────────────
    // 6. 5 dernières commandes
    // ──────────────────────────────────────────────────────────────
    const recentOrders = await db.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        customerFirstName: true,
        customerLastName: true,
        customerEmail: true,
        total: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    })

    // ──────────────────────────────────────────────────────────────
    // 7. Nouveaux utilisateurs — 30 derniers jours (tendance)
    // ──────────────────────────────────────────────────────────────
    const recentUsers = await db.user.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true, role: true },
    })
    const usersByDay: { date: string; count: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const day = new Date(thirtyDaysAgo)
      day.setDate(thirtyDaysAgo.getDate() + i)
      const dayStart = new Date(day)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(day)
      dayEnd.setHours(23, 59, 59, 999)
      const count = recentUsers.filter(
        (u) => u.createdAt >= dayStart && u.createdAt <= dayEnd
      ).length
      usersByDay.push({ date: dayStart.toISOString().slice(0, 10), count })
    }

    return NextResponse.json({
      kpis: {
        totalRevenue,
        revenueToday,
        revenueThisMonth,
        totalOrders,
        paidOrders: paidOrders.length,
        pendingOrders: statusCounts['pending'] || 0,
        avgOrderValue,
        conversionRate,
        totalProducts,
        activeProducts,
        totalUsers,
        newUsersThisMonth,
        activeCarts,
      },
      revenueByDay,
      usersByDay,
      statusCounts,
      paymentMethodCounts,
      topProducts,
      recentOrders,
      generatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json(
      { error: 'Erreur lors du calcul des statistiques' },
      { status: 500 }
    )
  }
}
