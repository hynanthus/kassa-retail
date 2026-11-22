import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { getStorage } from './storage'

let db: Database | null = null
let SQL: initSqlJs.SqlJsStatic | null = null

async function getSQL(): Promise<initSqlJs.SqlJsStatic> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: () => wasmUrl,
    })
  }
  return SQL
}

/* ------------------------------------------------------------------ */
/* Сохранение базы                                                     */
/* ------------------------------------------------------------------ */

const PERSIST_DELAY_MS = 300

let dirty = false
let persistTimer: ReturnType<typeof setTimeout> | null = null
let flushPromise: Promise<void> | null = null

/**
 * Отмечает базу как изменённую и планирует запись.
 * Запись отложена, чтобы пакетные операции (импорт тысяч товаров)
 * не пересобирали и не перезаписывали файл на каждую строку.
 */
export function persistDatabase(): void {
  if (!db) return
  dirty = true
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void flushDatabase()
  }, PERSIST_DELAY_MS)
}

async function runFlush(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  while (db && dirty) {
    dirty = false
    const bytes = db.export()
    try {
      await getStorage().save(bytes)
    } catch (error) {
      dirty = true
      console.warn('Failed to persist database', error)
      break
    }
  }
}

/** Немедленно записывает базу на диск (файл в APK или IndexedDB в вебе). */
export function flushDatabase(): Promise<void> {
  if (!flushPromise) {
    flushPromise = runFlush().finally(() => {
      flushPromise = null
    })
  }
  return flushPromise
}

// Не теряем последние изменения при закрытии/сворачивании вкладки в браузере.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flushDatabase()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushDatabase()
    }
  })
}

let initPromise: Promise<Database> | null = null

/**
 * Повторные вызовы (например, двойной effect в StrictMode) получают
 * один и тот же промис — база не создаётся дважды.
 */
export function initDatabase(): Promise<Database> {
  if (db) {
    return Promise.resolve(db)
  }
  if (!initPromise) {
    initPromise = doInitDatabase().catch((error) => {
      initPromise = null
      throw error
    })
  }
  return initPromise
}

async function doInitDatabase(): Promise<Database> {
  try {
    const sql = await getSQL()

    const stored = await getStorage().load()
    if (stored) {
      try {
        db = new sql.Database(stored)
        await runMigrations(db)
        return db
      } catch (error) {
        console.warn('Stored database is corrupted, creating a new one', error)
        db?.close()
        db = null
      }
    }

    db = new sql.Database()
    await runMigrations(db)
    dirty = true
    await flushDatabase()
    return db
  } catch (error) {
    db = null
    throw new Error(`Failed to initialize database: ${error}`)
  }
}

export function getDatabase(): Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return db
}

export async function checkIntegrity(): Promise<{ valid: boolean; message: string }> {
  try {
    const database = await initDatabase()
    const result = database.exec('PRAGMA integrity_check;')

    const firstValue = result[0]?.values[0]?.[0]
    if (firstValue === 'ok') {
      return { valid: true, message: 'Database is valid' }
    }

    return {
      valid: false,
      message: `Database integrity check failed: ${String(firstValue ?? 'no result')}`,
    }
  } catch (error) {
    return { valid: false, message: `Integrity check error: ${error}` }
  }
}

/**
 * Экспортирует текущую базу как бинарный снимок .sqlite
 */
export function exportDatabase(): Uint8Array {
  const database = getDatabase()
  return database.export()
}

/**
 * Проверяет целостность базы из бинарных данных (без замены текущей базы)
 */
export function checkIntegrityOfBytes(
  bytes: Uint8Array
): { valid: boolean; message: string } {
  try {
    if (!SQL) {
      return { valid: false, message: 'SQL engine is not initialized yet' }
    }
    const testDb = new SQL.Database(bytes)
    try {
      const result = testDb.exec('PRAGMA integrity_check;')
      const firstValue = result[0]?.values[0]?.[0]
      return firstValue === 'ok'
        ? { valid: true, message: 'Database is valid' }
        : { valid: false, message: `Integrity check failed: ${String(firstValue)}` }
    } finally {
      testDb.close()
    }
  } catch (error) {
    return { valid: false, message: `Cannot open database file: ${error}` }
  }
}

/**
 * Заменяет текущую базу данными из файла (после проверки целостности)
 */
export async function loadDatabaseFromBytes(bytes: Uint8Array): Promise<void> {
  if (!SQL) {
    throw new Error('SQL engine is not initialized yet')
  }
  const newDb = new SQL.Database(bytes)
  try {
    const result = newDb.exec('PRAGMA integrity_check;')
    if (result[0]?.values[0]?.[0] !== 'ok') {
      newDb.close()
      throw new Error('Loaded database failed integrity check')
    }
  } catch (error) {
    newDb.close()
    throw error
  }

  db?.close()
  db = newDb
  dirty = true
  await flushDatabase()
}

export async function runMigrations(database: Database): Promise<void> {
  const migrations: string[] = [
    // Таблица пользователей
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'cashier')),
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );`,

    // Таблица клиентов
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      notes TEXT DEFAULT '',
      totalPurchases REAL NOT NULL DEFAULT 0,
      totalBought REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );`,

    // Таблица товаров
    `CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      barcode TEXT,
      priceBuy REAL NOT NULL DEFAULT 0,
      priceSell REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'KZT',
      stockCount INTEGER NOT NULL DEFAULT 0,
      stockValue REAL NOT NULL DEFAULT 0,
      minStock INTEGER NOT NULL DEFAULT 0,
      isActive INTEGER NOT NULL DEFAULT 1,
      imageUrl TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );`,

    // Таблица категорий
    `CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES categories(id)
    );`,

    // Таблица поставщиков
    `CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT,
      createdAt TEXT NOT NULL
    );`,

    // Таблица складов
    `CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      isActive INTEGER NOT NULL DEFAULT 1,
      isMain INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );`,

    // Таблица движений товаров между складами
    `CREATE TABLE IF NOT EXISTS warehouse_movements (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      fromWarehouseId TEXT,
      toWarehouseId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      movementType TEXT NOT NULL CHECK(movementType IN ('transfer', 'writeoff', 'breakage', 'stocktake')),
      reason TEXT NOT NULL,
      performedBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );`,

    // Таблица корректировок остатков
    `CREATE TABLE IF NOT EXISTS stock_adjustments (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      warehouseId TEXT NOT NULL,
      quantityChange INTEGER NOT NULL,
      reason TEXT NOT NULL,
      performedBy TEXT NOT NULL,
      performedAt TEXT NOT NULL
    );`,

    // Таблица продаж
    `CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      saleNumber TEXT UNIQUE NOT NULL,
      date TEXT NOT NULL,
      cashierId TEXT NOT NULL,
      clientId TEXT,
      totalAmount REAL NOT NULL,
      paidAmount REAL NOT NULL,
      paymentMethod TEXT NOT NULL CHECK(paymentMethod IN ('cash', 'card', 'qr', 'certificate')),
      certificateId TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'refunded')),
      comment TEXT DEFAULT '',
      FOREIGN KEY (clientId) REFERENCES clients(id),
      FOREIGN KEY (certificateId) REFERENCES certificates(id)
    );`,

    // Таблица позиций чека
    `CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      saleId TEXT NOT NULL,
      productId TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      discountAmount REAL NOT NULL DEFAULT 0,
      discountPercent REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      FOREIGN KEY (saleId) REFERENCES sales(id)
    );`,

    // Таблица подарочных сертификатов
    `CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      usedAmount REAL NOT NULL DEFAULT 0,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );`,

    // Таблица смен кассиров
    `CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      cashierId TEXT NOT NULL,
      openTime TEXT NOT NULL,
      closeTime TEXT,
      expectedCash REAL NOT NULL DEFAULT 0,
      actualCash REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed'))
    );`,

    // История задолженностей клиентов
    `CREATE TABLE IF NOT EXISTS client_debts (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      FOREIGN KEY (clientId) REFERENCES clients(id)
    );`,
  ]

  for (const migration of migrations) {
    database.exec(migration)
  }

  // Индексы для ускорения поиска
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(saleId);
    CREATE INDEX IF NOT EXISTS idx_sales_cashier_id ON sales(cashierId);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_certificates_code ON certificates(code);
    CREATE INDEX IF NOT EXISTS idx_client_debts_client_id ON client_debts(clientId);
  `)

  // Дополнительные колонки, добавленные в новых версиях
  const hasColumn = (table: string, column: string): boolean => {
    try {
      const info = database.exec(`PRAGMA table_info(${table})`)
      const rows = info[0]?.values ?? []
      return rows.some((row) => String(row[1]) === column)
    } catch {
      return false
    }
  }

  if (!hasColumn('products', 'warehouse')) {
    database.exec(`ALTER TABLE products ADD COLUMN warehouse TEXT DEFAULT '1'`)
  }

  if (!hasColumn('clients', 'debt')) {
    database.exec(`ALTER TABLE clients ADD COLUMN debt REAL NOT NULL DEFAULT 0`)
    // Переносим исторические данные: ранее в totalBought хранилась сумма покупок.
    database.exec(`UPDATE clients SET debt = totalBought`)
  }

  // Проверка целостности после миграций
  const integrityResult = database.exec('PRAGMA integrity_check;')
  if (integrityResult[0]?.values[0]?.[0] !== 'ok') {
    throw new Error('Database migration failed integrity check')
  }
}
