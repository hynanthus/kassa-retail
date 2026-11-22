import { getDatabase, persistDatabase } from './database'
import { ProductRepo } from '../features/repo/ProductRepo'
import { ClientRepo } from '../features/repo/ClientRepo'
import { CertificateRepo } from '../features/repo/CertificateRepo'
import { WarehouseRepo } from '../features/repo/WarehouseRepo'

const nowISO = () => new Date().toISOString()

function tableIsEmpty(table: string): boolean {
  const db = getDatabase()
  try {
    const result = db.exec(`SELECT COUNT(*) FROM ${table}`)
    return Number(result[0]?.values[0]?.[0] ?? 0) === 0
  } catch {
    return false
  }
}

function seedUsers(): void {
  const db = getDatabase()
  const users = [
    { id: 'admin-001', login: 'admin', role: 'admin' },
    { id: 'cashier-001', login: 'cashier1', role: 'cashier' },
    { id: 'cashier-002', login: 'cashier2', role: 'cashier' },
  ]
  for (const user of users) {
    db.run(
      `INSERT OR IGNORE INTO users (id, login, passwordHash, role, isActive, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, user.login, 'demo', user.role, 1, nowISO()]
    )
  }
}

function seedCategoriesAndSuppliers(): void {
  const db = getDatabase()
  const categories = [
    'Продукты питания',
    'Напитки',
    'Бакалея',
    'Бытовая химия',
    'Товары для дома',
  ]
  categories.forEach((category) => {
    db.run(
      `INSERT OR IGNORE INTO categories (id, name, parentId, isActive, createdAt)
       VALUES (?, ?, NULL, ?, ?)`,
      [`category-${category.replace(/\s/g, '')}`, category, 1, nowISO()]
    )
  })

  const suppliers = [
    'ТОО "Казахстан Продукт"',
    'ТОО "Алматы Торговый Дом"',
    'ИП "Смирнов А.А."',
  ]
  suppliers.forEach((supplier) => {
    db.run(
      `INSERT OR IGNORE INTO suppliers (id, name, contact, createdAt)
       VALUES (?, ?, ?, ?)`,
      [`supplier-${supplier.replace(/\s/g, '')}`, supplier, '', nowISO()]
    )
  })
}

let seedPromise: Promise<void> | null = null

/**
 * Наполняет пустую базу демонстрационными данными.
 * Если в базе уже есть товары, ничего не делает.
 * Повторные вызовы переиспользуют тот же промис (защита от StrictMode).
 */
export function seedIfEmpty(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeedIfEmpty().catch((error) => {
      seedPromise = null
      throw error
    })
  }
  return seedPromise
}

async function doSeedIfEmpty(): Promise<void> {
  getDatabase()

  if (tableIsEmpty('users')) {
    seedUsers()
  }
  if (tableIsEmpty('categories') || tableIsEmpty('suppliers')) {
    seedCategoriesAndSuppliers()
  }
  if (tableIsEmpty('warehouses')) {
    await WarehouseRepo.seed()
  }
  if (tableIsEmpty('products')) {
    await ProductRepo.seed()
  }
  if (tableIsEmpty('clients')) {
    await ClientRepo.seed()
  }
  if (tableIsEmpty('certificates')) {
    await CertificateRepo.seed()
  }
  if (tableIsEmpty('sales')) {
    seedSales()
  }

  persistDatabase()
}

function seedSales(): void {
  const db = getDatabase()
  const productsResult = db.exec('SELECT id, sku, name, priceSell FROM products ORDER BY id')
  const productRows = productsResult[0]?.values ?? []
  if (productRows.length === 0) return

  const products = productRows.map((row) => ({
    id: String(row[0]),
    sku: String(row[1]),
    name: String(row[2]),
    price: Number(row[3]),
  }))

  const clientsResult = db.exec('SELECT id FROM clients ORDER BY id')
  const clientIds = (clientsResult[0]?.values ?? []).map((row) => String(row[0]))
  const methods = ['cash', 'card', 'qr', 'certificate'] as const

  const pad = (n: number) => String(n).padStart(2, '0')
  let index = 0

  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date()
    date.setDate(date.getDate() - dayOffset)
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

    const checksPerDay = 2 + ((dayOffset * 3) % 4)
    for (let check = 0; check < checksPerDay; check++) {
      index++
      const product = products[index % products.length]
      const quantity = 1 + (index % 3)
      const total = product.price * quantity
      const saleId = `seed-sale-${index}`
      const clientId = index % 3 === 0 ? clientIds[index % clientIds.length] ?? null : null

      db.run(
        `INSERT INTO sales (id, saleNumber, date, cashierId, clientId, totalAmount, paidAmount, paymentMethod, certificateId, status, comment)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'completed', '')`,
        [
          saleId,
          `CHK-${dateStr.replace(/-/g, '')}-${pad(check + 1)}`,
          dateStr,
          'admin',
          clientId,
          total,
          total,
          methods[index % methods.length],
        ]
      )

      db.run(
        `INSERT INTO sale_items (id, saleId, productId, sku, name, quantity, price, discountAmount, discountPercent, subtotal)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        [`seed-item-${index}`, saleId, product.id, product.sku, product.name, quantity, product.price, total]
      )
    }
  }
}

