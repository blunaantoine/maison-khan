// Shared types for admin components — extracted from src/app/page.tsx
// This avoids circular imports and keeps admin components decoupled
// from the monolithic page.tsx.

export interface OrderItem {
  id: string
  productName: string
  productImage: string | null
  colorName: string | null
  size: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface Payment {
  id: string
  amount: number
  status: string
  paymentMethod: string | null
  transactionId: string | null
  createdAt: string
}

export interface Order {
  id: string
  orderNumber: string
  customerEmail: string
  customerPhone: string
  customerFirstName: string | null
  customerLastName: string | null
  shippingAddress: string | null
  shippingCity: string | null
  shippingCountry: string | null
  subtotal: number
  shippingCost: number
  total: number
  status: string
  paymentStatus: string
  paymentMethod: string | null
  trackingNumber: string | null
  notes: string | null
  estimatedDelivery: string | null
  createdAt: string
  items: OrderItem[]
  payments?: Payment[]
}

export interface User {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  role: string
  isActive?: boolean
  createdAt?: string
  // Prisma _count aggregate (returned by /api/admin/users)
  _count?: { orders: number }
}

export interface NewUserData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone: string
  role: string
}

export const formatPrice = (price: number | undefined | null) => {
  if (price === undefined || price === null || isNaN(price)) {
    return 'Prix sur demande'
  }
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' XOF'
}
