export interface User {
  id: string
  login: string
  passwordHash: string
  role: 'admin' | 'cashier'
  isActive: boolean
  createdAt: string
}

export interface Client {
  id: string
  name: string
  phone: string
  notes: string
  totalPurchases: number
  totalBought: number
  createdAt: string
}

export interface Product {
  id: string
  sku: string
  name: string
  barcode: string
  priceBuy: number
  priceSell: number
  currency: string
  stockCount: number
  stockValue: number
  minStock: number
  isActive: boolean
  imageUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  parentId: string | null
  isActive: boolean
  createdAt: string
}

export interface Supplier {
  id: string
  name: string
  contact: string
  createdAt: string
}

export interface Warehouse {
  id: string
  name: string
  address: string
  isActive: boolean
  isMain: boolean
  createdAt: string
}

export interface WarehouseMovement {
  id: string
  productId: string
  fromWarehouseId: string | null
  toWarehouseId: string
  quantity: number
  movementType: 'transfer' | 'writeoff' | 'breakage' | 'stocktake'
  reason: string
  performedBy: string
  createdAt: string
}

export interface StockAdjustment {
  id: string
  productId: string
  warehouseId: string
  quantityChange: number
  reason: string
  performedBy: string
  performedAt: string
}

export interface Sale {
  id: string
  saleNumber: string
  date: string
  cashierId: string
  client?: Client
  totalAmount: number
  paidAmount: number
  paymentMethod: 'cash' | 'card' | 'qr' | 'certificate'
  certificate?: Certificate | null
  status: 'completed' | 'refunded'
  comment: string
}

export interface SaleItem {
  id: string
  saleId: string
  productId: string
  sku: string
  name: string
  quantity: number
  price: number
  discountAmount: number
  discountPercent: number
  subtotal: number
}

export interface Certificate {
  id: string
  code: string
  amount: number
  usedAmount: number
  startDate: string
  endDate: string
  isActive: boolean
  createdBy: string
  createdAt: string
}

export interface Shift {
  id: string
  cashierId: string
  openTime: string
  closeTime: string | null
  expectedCash: number
  actualCash: number
  status: 'open' | 'closed'
}
