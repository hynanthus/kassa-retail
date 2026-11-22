import { getDatabase } from '../../db/database'

export interface DashboardStats {
  revenueToday: number
  checksToday: number
  profitToday: number
  revenueWeek: number
  checksWeek: number
  profitWeek: number
  revenueMonth: number
  checksMonth: number
  profitMonth: number
  avgCheck: number
  chart: { date: string; revenue: number }[]
  topProducts: { name: string; quantity: number; revenue: number }[]
  lowStock: { id: string; name: string; sku: string; stock: number; minStock: number }[]
}

export interface DashboardPeriodStats {
  revenue: number
  checks: number
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function shiftDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function firstDayOfMonth(): string {
  const now = new Date()
  return toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
}

function readTotals(from: string, to: string): DashboardPeriodStats {
  const db = getDatabase()
  const result = db.exec(
    `SELECT COALESCE(SUM(totalAmount), 0) AS revenue, COUNT(*) AS checks
     FROM sales
     WHERE date(date) >= ? AND date(date) <= ? AND status = 'completed'`,
    [from, to]
  )
  const block = result[0]
  if (!block || block.values.length === 0) return { revenue: 0, checks: 0 }
  const row = block.values[0]
  return { revenue: Number(row[0] ?? 0), checks: Number(row[1] ?? 0) }
}

/**
 * Реальная прибыль за период: сумма (продажа − закупка) по позициям закрытых чеков.
 * Скидка уменьшает сумму продажи, поэтому считается subtotal минус закупочная стоимость.
 */
function readProfit(from: string, to: string): DashboardPeriodStats {
  const db = getDatabase()
  const result = db.exec(
    `SELECT COALESCE(SUM(si.subtotal - p.priceBuy * si.quantity), 0) AS revenue, COUNT(DISTINCT s.id) AS checks
     FROM sale_items si
     JOIN sales s ON s.id = si.saleId
     JOIN products p ON p.id = si.productId
     WHERE date(s.date) >= ? AND date(s.date) <= ? AND s.status = 'completed'`,
    [from, to]
  )
  const block = result[0]
  if (!block || block.values.length === 0) return { revenue: 0, checks: 0 }
  const row = block.values[0]
  return { revenue: Number(row[0] ?? 0), checks: Number(row[1] ?? 0) }
}

function readChart(from: string, to: string): { date: string; revenue: number }[] {
  const db = getDatabase()
  const result = db.exec(
    `SELECT date(date) AS day, COALESCE(SUM(totalAmount), 0) AS revenue
     FROM sales
     WHERE date(date) >= ? AND date(date) <= ? AND status = 'completed'
     GROUP BY date(date)
     ORDER BY day`,
    [from, to]
  )
  const block = result[0]
  const totals: Record<string, number> = {}
  if (block) {
    block.values.forEach((row) => {
      totals[String(row[0])] = Number(row[1] ?? 0)
    })
  }
  const days: { date: string; revenue: number }[] = []
  const cursor = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  let guard = 0
  while (cursor <= end && guard < 400) {
    const key = toISODate(cursor)
    days.push({ date: key, revenue: totals[key] ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return days
}

function readTopProducts(from: string, to: string): DashboardStats['topProducts'] {
  const db = getDatabase()
  const result = db.exec(
    `SELECT si.name AS name, COALESCE(SUM(si.quantity), 0) AS quantity, COALESCE(SUM(si.subtotal), 0) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.saleId
     WHERE date(s.date) >= ? AND date(s.date) <= ? AND s.status = 'completed'
     GROUP BY si.name
     ORDER BY revenue DESC
     LIMIT 5`,
    [from, to]
  )
  const block = result[0]
  if (!block) return []
  return block.values.map((row) => ({
    name: String(row[0]),
    quantity: Number(row[1] ?? 0),
    revenue: Number(row[2] ?? 0),
  }))
}

function readLowStock(): DashboardStats['lowStock'] {
  const db = getDatabase()
  const result = db.exec(
    `SELECT id, name, sku, stockCount, minStock
     FROM products
     WHERE isActive = 1 AND stockCount <= minStock
     ORDER BY stockCount ASC
     LIMIT 10`
  )
  const block = result[0]
  if (!block) return []
  return block.values.map((row) => ({
    id: String(row[0]),
    name: String(row[1]),
    sku: String(row[2]),
    stock: Number(row[3] ?? 0),
    minStock: Number(row[4] ?? 0),
  }))
}

export const DashboardRepo = {
  load(): DashboardStats {
    const today = todayISO()
    const weekStart = shiftDays(-6)
    const monthStart = firstDayOfMonth()

    const todayStats = readTotals(today, today)
    const weekStats = readTotals(weekStart, today)
    const monthStats = readTotals(monthStart, today)

    const profitToday = readProfit(today, today)
    const profitWeek = readProfit(weekStart, today)
    const profitMonth = readProfit(monthStart, today)

    return {
      revenueToday: todayStats.revenue,
      checksToday: todayStats.checks,
      profitToday: profitToday.revenue,
      revenueWeek: weekStats.revenue,
      checksWeek: weekStats.checks,
      profitWeek: profitWeek.revenue,
      revenueMonth: monthStats.revenue,
      checksMonth: monthStats.checks,
      profitMonth: profitMonth.revenue,
      avgCheck: weekStats.checks > 0 ? Math.round(weekStats.revenue / weekStats.checks) : 0,
      chart: readChart(weekStart, today),
      topProducts: readTopProducts(monthStart, today),
      lowStock: readLowStock(),
    }
  },
}
