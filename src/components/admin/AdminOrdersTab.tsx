'use client'

import { Order, formatPrice } from './types'

interface AdminOrdersTabProps {
  orders: Order[]
  orderFilter: string
  setOrderFilter: (v: string) => void
  onUpdateOrderStatus: (orderId: string, status: string, trackingNumber?: string) => void
  onDeleteOrder: (orderId: string, orderNumber: string) => void
  getWhatsAppLink: (message: string) => string
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  paid: 'Payée',
  processing: 'En préparation',
  shipped: 'Expédiée',
  delivered: 'Livrée',
  cancelled: 'Annulée',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  paid: 'bg-blue-100 text-blue-800',
  processing: 'bg-indigo-100 text-indigo-800',
  shipped: 'bg-purple-100 text-purple-800',
  delivered: 'bg-[#15803D]/10 text-[#15803D]',
  cancelled: 'bg-red-100 text-red-800',
}

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'bg-[#15803D]/10 text-[#15803D]',
  pending: 'bg-yellow-100 text-yellow-800',
}

const FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'pending', label: 'En attente' },
  { id: 'paid', label: 'Payées' },
  { id: 'processing', label: 'En préparation' },
  { id: 'shipped', label: 'Expédiées' },
  { id: 'delivered', label: 'Livrées' },
]

export function AdminOrdersTab({
  orders,
  orderFilter,
  setOrderFilter,
  onUpdateOrderStatus,
  onDeleteOrder,
  getWhatsAppLink,
}: AdminOrdersTabProps) {
  const filteredOrders = orders.filter(
    (o) => orderFilter === 'all' || o.status === orderFilter
  )

  return (
    <div className="space-y-6">
      {/* Order Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setOrderFilter(filter.id)}
            className={`px-4 py-2 text-sm uppercase tracking-wider transition-colors ${
              orderFilter === filter.id
                ? 'bg-[#9C7C5C] text-white'
                : 'bg-white text-[#0A0A0A] border border-[#E5E0DA] hover:border-[#9C7C5C]'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white p-12 text-center">
          <p className="text-[#6B6560]">Aucune commande à afficher</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <div key={order.id} className="bg-white p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <h3 className="font-medium text-lg">{order.orderNumber}</h3>
                    <span
                      className={`inline-block px-3 py-1 text-xs uppercase tracking-wider ${
                        STATUS_BADGE[order.status] || 'bg-red-100 text-red-800'
                      }`}
                    >
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                    <span
                      className={`inline-block px-3 py-1 text-xs uppercase tracking-wider ${
                        PAYMENT_BADGE[order.paymentStatus] || 'bg-red-100 text-red-800'
                      }`}
                    >
                      {order.paymentStatus === 'paid'
                        ? 'Payé'
                        : order.paymentStatus === 'pending'
                        ? 'Paiement en attente'
                        : order.paymentStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-[#6B6560]">Client:</p>
                      <p>
                        {order.customerFirstName} {order.customerLastName}
                      </p>
                      <p className="text-[#6B6560]">{order.customerEmail}</p>
                      <p className="text-[#6B6560]">{order.customerPhone}</p>
                    </div>
                    <div>
                      <p className="text-[#6B6560]">Livraison:</p>
                      <p>{order.shippingAddress || 'Non spécifiée'}</p>
                      <p>
                        {order.shippingCity || ''} {order.shippingCountry || ''}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-[#E5E0DA]">
                    <p className="text-[#6B6560] text-xs uppercase tracking-wider mb-2">
                      Articles:
                    </p>
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm py-1">
                        <span>
                          {item.productName} - {item.size}
                          {item.colorName ? `, ${item.colorName}` : ''} x{item.quantity}
                        </span>
                        <span>{formatPrice(item.totalPrice)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between font-medium mt-2 pt-2 border-t border-[#E5E0DA]">
                      <span>Total</span>
                      <span>{formatPrice(order.total)}</span>
                    </div>
                  </div>

                  {order.trackingNumber && (
                    <div className="mt-4 p-3 bg-[#EDE8E1] text-sm">
                      <p>
                        <strong>Numéro de suivi:</strong> {order.trackingNumber}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-[#6B6560] mt-4">
                    Créée le{' '}
                    {new Date(order.createdAt).toLocaleDateString('fr-FR')} à{' '}
                    {new Date(order.createdAt).toLocaleTimeString('fr-FR')}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 lg:w-48">
                  <select
                    value={order.status}
                    onChange={(e) => onUpdateOrderStatus(order.id, e.target.value)}
                    className="p-2 border border-[#E5E0DA] text-sm"
                  >
                    <option value="pending">En attente</option>
                    <option value="paid">Payée</option>
                    <option value="processing">En préparation</option>
                    <option value="shipped">Expédiée</option>
                    <option value="delivered">Livrée</option>
                    <option value="cancelled">Annulée</option>
                  </select>

                  {order.status === 'shipped' && !order.trackingNumber && (
                    <input
                      type="text"
                      placeholder="Numéro de suivi"
                      className="p-2 border border-[#E5E0DA] text-sm"
                      onBlur={(e) => {
                        if (e.target.value) {
                          onUpdateOrderStatus(order.id, order.status, e.target.value)
                        }
                      }}
                    />
                  )}

                  <button
                    onClick={() => onDeleteOrder(order.id, order.orderNumber)}
                    className="bg-red-500 text-white text-center py-2 text-xs uppercase tracking-wider hover:bg-red-600 transition-colors"
                  >
                    Supprimer
                  </button>

                  <a
                    href={getWhatsAppLink(
                      `Bonjour, concernant votre commande ${order.orderNumber}...`
                    )}
                    target="_blank"
                    rel="noopener"
                    className="bg-[#9C7C5C] text-white text-center py-2 text-xs uppercase tracking-wider hover:bg-[#8B6B4B] transition-colors"
                  >
                    Contacter client
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
