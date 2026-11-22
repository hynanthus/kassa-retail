import { getDatabase, persistDatabase } from '../../db/database'

export type ProductWarehouse = '1' | '2'

export interface Product {
  id: string
  sku: string
  name: string
  barcode: string
  priceBuy: number
  priceSell: number
  stock: number
  minStock: number
  active: boolean
  warehouse: ProductWarehouse
}

const productToEntity = (row: Record<string, string | number | boolean | null>): Product => ({
  id: String(row.id),
  sku: String(row.sku),
  name: String(row.name),
  barcode: String(row.barcode ?? ''),
  priceBuy: Number(row.priceBuy),
  priceSell: Number(row.priceSell),
  stock: Number(row.stockCount),
  minStock: Number(row.minStock),
  active: Boolean(row.isActive),
  warehouse: String(row.warehouse) as ProductWarehouse,
})

const nowISO = () => new Date().toISOString()

export const ProductRepo = {
  async list(): Promise<Product[]> {
    const db = getDatabase()
    const result = db.exec('SELECT id, sku, name, barcode, priceBuy, priceSell, stockCount, minStock, isActive, COALESCE(warehouse, \'1\') AS warehouse FROM products ORDER BY name')
    const rows = result[0]?.values ?? []
    return rows.map((r) => productToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async get(id: string): Promise<Product | null> {
    const products = await this.list()
    return products.find((p) => p.id === id) ?? null
  },

  async add(product: Omit<Product, 'id'>): Promise<string> {
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.run(
      'INSERT INTO products (id, sku, name, barcode, priceBuy, priceSell, stockCount, minStock, isActive, warehouse, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, product.sku, product.name, product.barcode || '', product.priceBuy, product.priceSell, product.stock, product.minStock, product.active ? 1 : 0, product.warehouse ?? '1', nowISO(), nowISO()]
    )
    persistDatabase()
    return id
  },

  /**
   * Пакетная вставка (импорт из Excel/CSV): одна транзакция и одна запись базы.
   * Некорректные строки (например, дубликат SKU) пропускаются.
   */
  async addMany(products: Omit<Product, 'id'>[]): Promise<{ imported: number; skipped: number }> {
    const db = getDatabase()
    let imported = 0
    let skipped = 0
    db.run('BEGIN TRANSACTION')
    try {
      for (const product of products) {
        try {
          db.run(
            'INSERT INTO products (id, sku, name, barcode, priceBuy, priceSell, stockCount, minStock, isActive, warehouse, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [crypto.randomUUID(), product.sku, product.name, product.barcode || '', product.priceBuy, product.priceSell, product.stock, product.minStock, product.active ? 1 : 0, product.warehouse ?? '1', nowISO(), nowISO()]
          )
          imported++
        } catch {
          skipped++
        }
      }
      db.run('COMMIT')
    } catch (error) {
      try {
        db.run('ROLLBACK')
      } catch {
        // Транзакция уже завершена.
      }
      throw error
    }
    persistDatabase()
    return { imported, skipped }
  },

  async update(id: string, product: Partial<Omit<Product, 'id'>>) {
    const db = getDatabase()
    db.run(
      'UPDATE products SET sku = ?, name = ?, barcode = ?, priceBuy = ?, priceSell = ?, stockCount = ?, minStock = ?, isActive = ?, warehouse = ?, updatedAt = ? WHERE id = ?',
      [product.sku ?? '', product.name ?? '', product.barcode ?? '', product.priceBuy ?? 0, product.priceSell ?? 0, product.stock ?? 0, product.minStock ?? 0, product.active ? 1 : 0, product.warehouse ?? '1', nowISO(), id]
    )
    persistDatabase()
  },

  async remove(id: string): Promise<void> {
    const db = getDatabase()
    db.run('DELETE FROM products WHERE id = ?', [id])
    persistDatabase()
  },

  async search(query: string): Promise<Product[]> {
    const db = getDatabase()
    const result = db.exec('SELECT id, sku, name, barcode, priceBuy, priceSell, stockCount, minStock, isActive, COALESCE(warehouse, \'1\') AS warehouse FROM products WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ? ORDER BY name', [`%${query}%`, `%${query}%`, `%${query}%`])
    const rows = result[0]?.values ?? []
    return rows.map((r) => productToEntity(r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, any>)))
  },

  async seed(): Promise<void> {
    const db = getDatabase()
    const seeds: Omit<Product, 'id'>[] = [
      { sku: '001', name: 'Хлеб белый', barcode: '1234567890123', priceBuy: 45, priceSell: 65, stock: 120, minStock: 20, active: true, warehouse: '1' },
      { sku: '002', name: 'Молоко 3.2%', barcode: '1234567890124', priceBuy: 180, priceSell: 250, stock: 85, minStock: 25, active: true, warehouse: '1' },
      { sku: '003', name: 'Яйца С0', barcode: '1234567890125', priceBuy: 100, priceSell: 145, stock: 200, minStock: 30, active: true, warehouse: '1' },
      { sku: '004', name: 'Вода 0.5л', barcode: '1234567890126', priceBuy: 45, priceSell: 65, stock: 5, minStock: 20, active: true, warehouse: '1' },
      { sku: '005', name: 'Кофе зерновой', barcode: '1234567890127', priceBuy: 300, priceSell: 450, stock: 45, minStock: 15, active: true, warehouse: '1' },
      { sku: '006', name: 'Сахар песок', barcode: '1234567890128', priceBuy: 90, priceSell: 130, stock: 8, minStock: 25, active: true, warehouse: '1' },
      { sku: '007', name: 'Чай черный', barcode: '1234567890129', priceBuy: 250, priceSell: 380, stock: 60, minStock: 20, active: true, warehouse: '1' },
      { sku: '008', name: 'Макароны', barcode: '1234567890130', priceBuy: 80, priceSell: 120, stock: 150, minStock: 30, active: true, warehouse: '1' },
    ]
    for (const p of seeds) {
      const id = String(seeds.indexOf(p) + 1)
      db.run('INSERT INTO products (id, sku, name, barcode, priceBuy, priceSell, stockCount, minStock, isActive, warehouse, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, p.sku, p.name, p.barcode, p.priceBuy, p.priceSell, p.stock, p.minStock, p.active ? 1 : 0, p.warehouse, nowISO(), nowISO()])
    }
    persistDatabase()
  },
}
