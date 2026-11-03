'use client'

import { useMemo } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  RefreshCw,
  ArrowRight,
  CircleDollarSign,
  Clock,
  CheckCircle2,
} from 'lucide-react'

interface AdminDashboardStats {
  kpis: {
    totalRevenue: number
    revenueToday: number
    revenueThisMonth: number
    totalOrders: number
    paidOrders: number
    pendingOrders: number
    avgOrderValue: number
    conversionRate: number
    totalProducts: number
    activeProducts: number
    totalUsers: number
    newUsersThisMonth: number
    activeCarts: number
  }
  revenueByDay: { date: string; revenue: number; orders: number }[]
  usersByDay: { date: string; count: number }[]
  statusCounts: Record<string, number>
  paymentMethodCounts: Record<string, { count: number; revenue: number }>
  topProducts: {
    id: string
    name: string
    image: string
    quantitySold: number
    revenue: number
  }[]
  recentOrders: {
    id: string
    orderNumber: string
    customerFirstName: string | null
    customerLastName: string | null
    customerEmail: string
    total: number
    status: string
    paymentStatus: string
    createdAt: string
  }[]
  generatedAt: string
}

interface AdminDashboardProps {
  stats: AdminDashboardStats | null
  loading: boolean
  onRefresh: () => void
  onGoToOrders: () => void
  onGoToProducts: () => void
}

const formatPrice = (price: number | undefined | null) => {
  if (price === undefined || price === null || isNaN(price)) {
    return 'Prix sur demande'
  }
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' XOF'
}

const formatCompact = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return n.toString()
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payée',
  processing: 'En préparation',
  ready: 'Prête (retrait)',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  ready: 'bg-amber-100 text-amber-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
}

const PAYMENT_LABELS: Record<string, string> = {
  paygate: 'PayGate (Moov/T-Money)',
  fedapay: 'FedaPay',
  card: 'Carte bancaire',
  inconnu: 'Non spécifié',
}

export function AdminDashboard({
  stats,
  loading,
  onRefresh,
  onGoToOrders,
  onGoToProducts,
}: AdminDashboardProps) {
  // Calculs dérivés pour le graphique de revenus
  const chartData = useMemo(() => {
    if (!stats) return { bars: [], maxRevenue: 0, total30d: 0 }
    const maxRevenue = Math.max(...stats.revenueByDay.map((d) => d.revenue), 1)
    const total30d = stats.revenueByDay.reduce((sum, d) => sum + d.revenue, 0)
    return { bars: stats.revenueByDay, maxRevenue, total30d }
  }, [stats])

  const statusEntries = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.statusCounts)
      .map(([status, count]) => ({ status, count, label: STATUS_LABELS[status] || status }))
      .sort((a, b) => b.count - a.count)
  }, [stats])

  const paymentEntries = useMemo(() => {
    if (!stats) return []
    return Object.entries(stats.paymentMethodCounts)
      .map(([method, data]) => ({
        method,
        label: PAYMENT_LABELS[method] || method,
        ...data,
      }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [stats])

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <Card className="p-12 text-center">
        <p className="text-[#6B6560] mb-4">Impossible de charger les statistiques.</p>
        <Button onClick={onRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
        </Button>
      </Card>
    )
  }

  const { kpis } = stats

  return (
    <div className="space-y-6">
      {/* Header avec refresh */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6B6560]">
          Données calculées le{' '}
          {new Date(stats.generatedAt).toLocaleString('fr-FR', {
            dateStyle: 'long',
            timeStyle: 'short',
          })}
        </p>
        <Button
          onClick={onRefresh}
          variant="outline"
          size="sm"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={formatPrice(kpis.totalRevenue)}
          sub={`${formatPrice(kpis.revenueThisMonth)} ce mois-ci`}
          icon={<CircleDollarSign className="h-5 w-5" />}
          accent="#9C7C5C"
        />
        <KpiCard
          label="Commandes"
          value={kpis.totalOrders.toString()}
          sub={`${kpis.paidOrders} payées · ${kpis.pendingOrders} en attente`}
          icon={<ShoppingCart className="h-5 w-5" />}
          accent="#0A0A0A"
        />
        <KpiCard
          label="Panier moyen"
          value={formatPrice(kpis.avgOrderValue)}
          sub="sur commandes payées"
          icon={<TrendingUp className="h-5 w-5" />}
          accent="#15803D"
        />
        <KpiCard
          label="Taux de conversion"
          value={kpis.conversionRate + '%'}
          sub={`${kpis.paidOrders}/${kpis.totalOrders} commandes payées`}
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent="#B45309"
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat
          label="Revenu aujourd'hui"
          value={formatPrice(kpis.revenueToday)}
          icon={<CircleDollarSign className="h-4 w-4" />}
        />
        <MiniStat
          label="Produits actifs"
          value={`${kpis.activeProducts} / ${kpis.totalProducts}`}
          icon={<Package className="h-4 w-4" />}
        />
        <MiniStat
          label="Utilisateurs"
          value={`${kpis.totalUsers}`}
          sub={`+${kpis.newUsersThisMonth} ce mois`}
          icon={<Users className="h-4 w-4" />}
        />
        <MiniStat
          label="Paniers actifs"
          value={`${kpis.activeCarts}`}
          icon={<ShoppingCart className="h-4 w-4" />}
        />
      </div>

      {/* Revenue chart + Order status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue bar chart - last 30 days */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Revenus — 30 derniers jours
              </h3>
              <p className="text-sm text-[#6B6560] mt-1">
                Total : <span className="font-medium text-[#0A0A0A]">{formatPrice(chartData.total30d)}</span>
              </p>
            </div>
          </div>
          <RevenueChart data={chartData.bars} max={chartData.maxRevenue} />
        </Card>

        {/* Order status breakdown */}
        <Card className="p-6">
          <h3 className="font-display text-xl text-[#0A0A0A] mb-6" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Statut des commandes
          </h3>
          {statusEntries.length === 0 ? (
            <p className="text-sm text-[#6B6560]">Aucune commande</p>
          ) : (
            <div className="space-y-3">
              {statusEntries.map(({ status, count, label }) => {
                const pct = kpis.totalOrders > 0 ? (count / kpis.totalOrders) * 100 : 0
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#0A0A0A]">{label}</span>
                      <span className="text-[#6B6560]">{count} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-[#EDE8E1] overflow-hidden">
                      <div
                        className="h-full bg-[#9C7C5C] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <button
            onClick={onGoToOrders}
            className="mt-6 text-sm text-[#9C7C5C] hover:text-[#8B6B4B] flex items-center gap-1 uppercase tracking-wider"
          >
            Voir les commandes <ArrowRight className="h-3 w-3" />
          </button>
        </Card>
      </div>

      {/* Top products + Recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display text-xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Top produits
            </h3>
            <button
              onClick={onGoToProducts}
              className="text-sm text-[#9C7C5C] hover:text-[#8B6B4B] flex items-center gap-1 uppercase tracking-wider"
            >
              Tout voir <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {stats.topProducts.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-10 w-10 text-[#E5E0DA] mx-auto mb-2" />
              <p className="text-sm text-[#6B6560]">Aucune vente enregistrée pour le moment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.topProducts.map((product, idx) => (
                <div key={product.id} className="flex items-center gap-4">
                  <span className="text-xs font-medium text-[#6B6560] w-5">{idx + 1}</span>
                  <div className="w-12 h-12 bg-[#EDE8E1] flex items-center justify-center overflow-hidden flex-shrink-0">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="h-5 w-5 text-[#6B6560]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0A0A0A] truncate">{product.name}</p>
                    <p className="text-xs text-[#6B6560]">{product.quantitySold} vendus</p>
                  </div>
                  <p className="text-sm font-medium text-[#9C7C5C] flex-shrink-0">
                    {formatPrice(product.revenue)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent orders */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display text-xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Dernières commandes
            </h3>
            <button
              onClick={onGoToOrders}
              className="text-sm text-[#9C7C5C] hover:text-[#8B6B4B] flex items-center gap-1 uppercase tracking-wider"
            >
              Tout voir <ArrowRight className="h-3 w-3" />
            </button>
          </div>
          {stats.recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-10 w-10 text-[#E5E0DA] mx-auto mb-2" />
              <p className="text-sm text-[#6B6560]">Aucune commande pour le moment</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stats.recentOrders.map((order) => (
                <div key={order.id} className="flex items-center gap-3 pb-3 border-b border-[#E5E0DA] last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0A0A0A]">{order.orderNumber}</p>
                    <p className="text-xs text-[#6B6560] truncate">
                      {[order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') || order.customerEmail}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className={`text-xs ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800'}`}
                  >
                    {STATUS_LABELS[order.status] || order.status}
                  </Badge>
                  <p className="text-sm font-medium text-[#0A0A0A] flex-shrink-0 w-24 text-right">
                    {formatPrice(order.total)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Payment methods */}
      {paymentEntries.length > 0 && (
        <Card className="p-6">
          <h3 className="font-display text-xl text-[#0A0A0A] mb-6" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Méthodes de paiement (commandes payées)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paymentEntries.map(({ method, label, count, revenue }) => (
              <div key={method} className="border border-[#E5E0DA] p-4">
                <p className="text-xs uppercase tracking-widest text-[#6B6560] mb-2">{label}</p>
                <p className="font-display text-2xl text-[#0A0A0A]" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  {formatPrice(revenue)}
                </p>
                <p className="text-xs text-[#6B6560] mt-1">{count} transaction{count > 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Sous-composants
// ──────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
  accent: string
}) {
  return (
    <Card className="p-6 relative overflow-hidden">
      <div
        className="absolute top-0 left-0 w-1 h-full"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-[#6B6560]">{label}</p>
        <div style={{ color: accent }}>{icon}</div>
      </div>
      <p className="font-display text-3xl text-[#0A0A0A] leading-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
        {value}
      </p>
      {sub && <p className="text-xs text-[#6B6560] mt-2">{sub}</p>}
    </Card>
  )
}

function MiniStat({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white p-4 shadow-sm border-l-2 border-[#E5E0DA]">
      <div className="flex items-center gap-2 text-[#6B6560] mb-1">
        {icon}
        <p className="text-xs uppercase tracking-widest">{label}</p>
      </div>
      <p className="text-lg font-medium text-[#0A0A0A]">{value}</p>
      {sub && <p className="text-xs text-[#6B6560]">{sub}</p>}
    </div>
  )
}

function RevenueChart({
  data,
  max,
}: {
  data: { date: string; revenue: number; orders: number }[]
  max: number
}) {
  const width = 600
  const height = 200
  const padding = { top: 10, right: 10, bottom: 30, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const barWidth = chartWidth / data.length

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ minWidth: '500px' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Axe Y — lignes de grille */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padding.top + chartHeight * (1 - t)
          const val = Math.round(max * t)
          return (
            <g key={t}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#E5E0DA"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#6B6560"
              >
                {formatCompact(val)}
              </text>
            </g>
          )
        })}

        {/* Barres */}
        {data.map((d, i) => {
          const barHeight = max > 0 ? (d.revenue / max) * chartHeight : 0
          const x = padding.left + i * barWidth
          const y = padding.top + chartHeight - barHeight
          const isToday = i === data.length - 1
          return (
            <g key={d.date}>
              <rect
                x={x + 1}
                y={y}
                width={Math.max(barWidth - 2, 1)}
                height={barHeight}
                fill={isToday ? '#9C7C5C' : '#C4A77D'}
                opacity={d.revenue > 0 ? 1 : 0.2}
              >
                <title>{`${d.date}: ${formatPrice(d.revenue)} (${d.orders} cmd)`}</title>
              </rect>
              {/* Label tous les ~5 jours */}
              {i % 5 === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={height - padding.bottom + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#6B6560"
                >
                  {new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </text>
              )}
            </g>
          )
        })}

        {/* Axe X */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={width - padding.right}
          y2={padding.top + chartHeight}
          stroke="#0A0A0A"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
