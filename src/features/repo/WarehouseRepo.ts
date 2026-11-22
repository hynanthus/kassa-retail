import { getDatabase, persistDatabase } from '../../db/database'

export interface ProductStock {
  productId: string
  sku: string
  name: string
  warehouseId: string
  qty: number
}

const nowISO = () => new Date().toISOString()

interface RawRow {
  [key: string]: unknown
}

function rowsToStocks(result: ReturnType<ReturnType<typeof getDatabase>['exec']>, warehouseId: string): ProductStock[] {
  const block = result[0]
  if (!block) return []
  return block.values.map((row) => {
    const data: RawRow = {}
    row.forEach((value, index) => {
      data[block.columns[index]] = value
    })
    return {
      productId: String(data.productId),
      sku: String(data.sku),
      name: String(data.name),
      warehouseId,
      qty: Number(data.qty ?? 0),
    }
  })
}

export const WarehouseRepo = {
  /**
   * Остатки на основном складе — это общий остаток товара.
   */
  async getStockMain(): Promise<ProductStock[]> {
    const db = getDatabase()
    const result = db.exec(
      'SELECT p.id AS productId, p.sku, p.name, p.stockCount AS qty FROM products p ORDER BY p.name'
    )
    return rowsToStocks(result, '1')
  },

  /**
   * Остатки на временном складе — сумма движений по этому складу.
   */
  async getStockTemporary(): Promise<ProductStock[]> {
    const db = getDatabase()
    const result = db.exec(
      `SELECT p.id AS productId, p.sku, p.name, COALESCE(SUM(sa.quantityChange), 0) AS qty
       FROM products p
       LEFT JOIN stock_adjustments sa ON sa.productId = p.id AND sa.warehouseId = '2'
       GROUP BY p.id, p.sku, p.name
       HAVING qty > 0
       ORDER BY p.name`
    )
    return rowsToStocks(result, '2')
  },

  async getStockByWarehouse(warehouseId: string): Promise<ProductStock[]> {
    return warehouseId === '2' ? this.getStockTemporary() : this.getStockMain()
  },

  async adjust(
    productId: string,
    warehouseId: string,
    quantityChange: number,
    reason: string,
    performedBy: string
  ): Promise<void> {
    if (quantityChange === 0) return
    const db = getDatabase()
    const id = crypto.randomUUID()
    db.run('BEGIN TRANSACTION')
    try {
      if (warehouseId === '2') {
        // Временный склад — только движение. Общий остаток (stockCount) при этом
        // не меняется, иначе количество посчиталось бы дважды.
        const current = Number(
          db.exec(
            `SELECT COALESCE(SUM(quantityChange), 0) FROM stock_adjustments
             WHERE productId = ? AND warehouseId = '2'`,
            [productId]
          )[0]?.values[0]?.[0] ?? 0
        )
        if (current + quantityChange < 0) {
          throw new Error('NOT_ENOUGH_TEMPORARY')
        }
        db.run(
          'INSERT INTO stock_adjustments (id, productId, warehouseId, quantityChange, reason, performedBy, performedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, productId, warehouseId, quantityChange, reason, performedBy, nowISO()]
        )
      } else {
        const stock = Number(
          db.exec('SELECT stockCount FROM products WHERE id = ?', [productId])[0]?.values[0]?.[0] ?? 0
        )
        if (stock + quantityChange < 0) {
          throw new Error('NOT_ENOUGH_MAIN')
        }
        db.run(
          'INSERT INTO stock_adjustments (id, productId, warehouseId, quantityChange, reason, performedBy, performedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, productId, warehouseId, quantityChange, reason, performedBy, nowISO()]
        )
        // Корректировка основного склада меняет общий остаток товара.
        db.run('UPDATE products SET stockCount = stockCount + ?, updatedAt = ? WHERE id = ?', [
          quantityChange,
          nowISO(),
          productId,
        ])
      }
      db.run('COMMIT')
      persistDatabase()
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  },

  /**
   * Перемещает товар между складами: количество уходит с исходного
   * и приходит на целевой, общий остаток не меняется.
   */
  async transfer(
    productId: string,
    fromWarehouseId: string,
    toWarehouseId: string,
    quantity: number,
    performedBy: string
  ): Promise<void> {
    if (quantity <= 0 || fromWarehouseId === toWarehouseId) return
    const db = getDatabase()
    const reason = `Перемещение: склад ${fromWarehouseId} → склад ${toWarehouseId}`

    db.run('BEGIN TRANSACTION')
    try {
      if (fromWarehouseId === '2') {
        db.run(
          'INSERT INTO stock_adjustments (id, productId, warehouseId, quantityChange, reason, performedBy, performedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), productId, '2', -quantity, reason, performedBy, nowISO()]
        )
        db.run('UPDATE products SET stockCount = stockCount + ?, updatedAt = ? WHERE id = ?', [
          quantity,
          nowISO(),
          productId,
        ])
      } else {
        db.run('UPDATE products SET stockCount = stockCount - ?, updatedAt = ? WHERE id = ?', [
          quantity,
          nowISO(),
          productId,
        ])
        db.run(
          'INSERT INTO stock_adjustments (id, productId, warehouseId, quantityChange, reason, performedBy, performedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), productId, '2', quantity, reason, performedBy, nowISO()]
        )
      }
      // Движение между складами фиксируется в журнале перемещений.
      db.run(
        `INSERT INTO warehouse_movements (id, productId, fromWarehouseId, toWarehouseId, quantity, movementType, reason, performedBy, createdAt)
         VALUES (?, ?, ?, ?, ?, 'transfer', ?, ?, ?)`,
        [crypto.randomUUID(), productId, fromWarehouseId, toWarehouseId, quantity, reason, performedBy, nowISO()]
      )
      db.run('COMMIT')
      persistDatabase()
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }
  },

  async seed(): Promise<void> {
    const db = getDatabase()
    db.run(
      'INSERT INTO warehouses (id, name, address, isActive, isMain, createdAt) VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)',
      ['1', 'Основной склад', 'г. Алматы, ул. Абая 1', 1, 1, nowISO(), '2', 'Временный склад', 'г. Алматы, ул. Достык 15', 1, 0, nowISO()]
    )

    const tempStock: { productId: string; qty: number }[] = [
      { productId: '3', qty: 40 },
      { productId: '5', qty: 50 },
    ]
    for (const item of tempStock) {
      db.run(
        'INSERT INTO stock_adjustments (id, productId, warehouseId, quantityChange, reason, performedBy, performedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), item.productId, '2', item.qty, 'seed', 'admin', nowISO()]
      )
    }
    persistDatabase()
  },

  /**
   * Загружает журнал корректировок (и перемещений) для указанного склада.
   */
  async getAdjustmentLog(warehouseId: string): Promise<Record<string, string | number | boolean | null>[]> {
    const db = getDatabase()
    const result = db.exec(
      `SELECT sa.id, p.sku, p.name, sa.quantityChange, sa.reason, sa.performedBy, sa.performedAt
       FROM stock_adjustments sa
       JOIN products p ON p.id = sa.productId
       WHERE sa.warehouseId = ?
       ORDER BY sa.performedAt DESC`,
      [warehouseId]
    )
    const rows = result[0]?.values ?? []
    return rows.map((r) => r.reduce((acc, v, i) => ((acc as any)[result[0].columns[i]] = v, acc), {} as Record<string, string | number | boolean | null>))
  },
}
