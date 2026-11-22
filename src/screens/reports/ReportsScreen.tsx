import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { showNotification } from '../../services/notifications'
import { getDatabase } from '../../db/database'

interface Sale {
  id: string
  saleNumber: string
  date: string
  cashierId: string
  clientId: string | null
  totalAmount: number
  paidAmount: number
  paymentMethod: 'cash' | 'card' | 'qr' | 'certificate'
  status: string
}

const pad = (n: number) => String(n).padStart(2, '0')

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function shiftDays(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

function toDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year.slice(2)}`
}

function daysBetween(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return result
  }
  const cursor = new Date(start)
  let guard = 0
  while (cursor <= end && guard < 400) {
    result.push(toISODate(cursor))
    cursor.setDate(cursor.getDate() + 1)
    guard++
  }
  return result
}

function readSales(from: string, to: string): Sale[] {
  const db = getDatabase()
  const result = db.exec(
    `SELECT id, saleNumber, date, cashierId, clientId, totalAmount, paidAmount, paymentMethod, status
     FROM sales
     WHERE date(date) >= ? AND date(date) <= ? AND status = 'completed'
     ORDER BY date`,
    [from, to]
  )
  const block = result[0]
  if (!block) return []
  return block.values.map((row) => {
    const data: Record<string, unknown> = {}
    row.forEach((value, index) => {
      data[block.columns[index]] = value
    })
    return {
      id: String(data.id),
      saleNumber: String(data.saleNumber),
      date: String(data.date),
      cashierId: String(data.cashierId),
      clientId: data.clientId == null ? null : String(data.clientId),
      totalAmount: Number(data.totalAmount),
      paidAmount: Number(data.paidAmount),
      paymentMethod: String(data.paymentMethod) as Sale['paymentMethod'],
      status: String(data.status),
    }
  })
}

function readItemsSold(from: string, to: string): number {
  const db = getDatabase()
  const result = db.exec(
    `SELECT COALESCE(SUM(si.quantity), 0)
     FROM sale_items si
     JOIN sales s ON s.id = si.saleId
     WHERE date(s.date) >= ? AND date(s.date) <= ? AND s.status = 'completed'`,
    [from, to]
  )
  return Number(result[0]?.values[0]?.[0] ?? 0)
}

interface PaymentProduct {
  paymentMethod: string
  sku: string
  name: string
  quantity: number
  amount: number
}

function readPaymentProducts(from: string, to: string): PaymentProduct[] {
  const db = getDatabase()
  const result = db.exec(
    `SELECT s.paymentMethod AS paymentMethod, si.sku AS sku, si.name AS name,
            SUM(si.quantity) AS quantity, SUM(si.subtotal) AS amount
     FROM sale_items si
     JOIN sales s ON s.id = si.saleId
     WHERE date(s.date) >= ? AND date(s.date) <= ? AND s.status = 'completed'
     GROUP BY s.paymentMethod, si.sku, si.name
     ORDER BY s.paymentMethod, amount DESC`,
    [from, to]
  )
  const block = result[0]
  if (!block) return []
  return block.values.map((row) => {
    const data: Record<string, unknown> = {}
    row.forEach((value, index) => {
      data[block.columns[index]] = value
    })
    return {
      paymentMethod: String(data.paymentMethod),
      sku: String(data.sku),
      name: String(data.name),
      quantity: Number(data.quantity ?? 0),
      amount: Number(data.amount ?? 0),
    }
  })
}

function ReportsScreen() {
  const { t } = useTranslation()
  const [reportType, setReportType] = useState('sales')
  const [period, setPeriod] = useState('week')
  const [fromDate, setFromDate] = useState(shiftDays(-6))
  const [toDate, setToDate] = useState(shiftDays(0))
  const [sales, setSales] = useState<Sale[]>(() => readSales(shiftDays(-6), shiftDays(0)))
  const [itemsSold, setItemsSold] = useState(() => readItemsSold(shiftDays(-6), shiftDays(0)))
  const [paymentProducts, setPaymentProducts] = useState<PaymentProduct[]>(() =>
    readPaymentProducts(shiftDays(-6), shiftDays(0))
  )
  const [expandedMethod, setExpandedMethod] = useState<string | null>(null)

  const generateReport = () => {
    let from = fromDate
    let to = toDate

    if (period === 'today') {
      from = shiftDays(0)
      to = shiftDays(0)
    } else if (period === 'week') {
      from = shiftDays(-6)
      to = shiftDays(0)
    } else if (period === 'month') {
      const now = new Date()
      from = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
      to = shiftDays(0)
    }

    if (from > to) {
      const swap = from
      from = to
      to = swap
    }

    setFromDate(from)
    setToDate(to)
    setSales(readSales(from, to))
    setItemsSold(readItemsSold(from, to))
    setPaymentProducts(readPaymentProducts(from, to))
    setExpandedMethod(null)
    showNotification(t('reports.generated'), 'success')
  }

  const totalRevenue = sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
  const totalChecks = sales.length
  const avgCheck = totalChecks > 0 ? Math.round(totalRevenue / totalChecks) : 0

  const salesByDate = sales.reduce<Record<string, Sale[]>>((acc, sale) => {
    const key = sale.date.slice(0, 10)
    acc[key] = acc[key] ? [...acc[key], sale] : [sale]
    return acc
  }, {})

  const dailySales = daysBetween(fromDate, toDate).map((date) => {
    const daySales = salesByDate[date] ?? []
    return {
      date: toDisplayDate(date),
      checks: daySales.length,
      revenue: daySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
    }
  })

  const paymentMethods: { key: string; method: string; amount: number; percentage: number }[] = [
    { key: 'cash', method: t('pos.cash') },
    { key: 'card', method: t('pos.card') },
    { key: 'qr', method: t('pos.qr') },
    { key: 'certificate', method: t('pos.certificate') },
  ].map(({ key, method }) => {
    const amount = sales
      .filter((sale) => sale.paymentMethod === key)
      .reduce((sum, sale) => sum + sale.totalAmount, 0)
    return {
      key,
      method,
      amount,
      percentage: totalRevenue > 0 ? Math.round((amount / totalRevenue) * 100) : 0,
    }
  })

  const cashiers = Array.from(new Set(sales.map((sale) => sale.cashierId)))
  const cashierReport = cashiers.map((cashier) => {
    const cashierSales = sales.filter((sale) => sale.cashierId === cashier)
    const revenue = cashierSales.reduce((sum, sale) => sum + sale.totalAmount, 0)
    return {
      cashier,
      checks: cashierSales.length,
      revenue,
      avgCheck: cashierSales.length > 0 ? Math.round(revenue / cashierSales.length) : 0,
    }
  })

  return (
    <div className="space-y-6">
      {/* Фильтры */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('reports.title')}
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="sales">{t('reports.salesReport')}</option>
              <option value="cashier">{t('reports.cashierReport')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('reports.period')}
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="today">{t('reports.today')}</option>
              <option value="week">{t('reports.thisWeek')}</option>
              <option value="month">{t('reports.thisMonth')}</option>
              <option value="custom">{t('reports.custom')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('reports.from')}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value)
                setPeriod('custom')
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('reports.to')}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value)
                setPeriod('custom')
              }}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={generateReport}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              {t('reports.generate')}
            </button>
          </div>
        </div>
      </div>

      {reportType === 'sales' && (
        <>
          {/* Ключевые показатели */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('reports.revenue')}
              </span>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                {totalRevenue.toLocaleString('ru-KZ')} тг
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('reports.checks')}
              </span>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                {totalChecks}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('reports.avgCheck')}
              </span>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                {avgCheck.toLocaleString('ru-KZ')} тг
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('reports.items')}
              </span>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-2">
                {itemsSold}
              </p>
            </div>
          </div>

          {/* График выручки */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('reports.dailySales')}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailySales}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" stroke="#6b7280" />
                <YAxis stroke="#6b7280" tickFormatter={(value) => `${Math.round(value / 1000)}к`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                  }}
                  formatter={(value) => [`${Number(value).toLocaleString('ru-KZ')} тг`, t('reports.revenue')]}
                />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Оплата по методам */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t('reports.paymentMethods')}
            </h3>
            <div className="space-y-3">
              {paymentMethods.map((item) => {
                const expanded = expandedMethod === item.key
                const products = paymentProducts.filter(
                  (product) => product.paymentMethod === item.key
                )
                return (
                  <div key={item.key}>
                    <button
                      type="button"
                      onClick={() => setExpandedMethod(expanded ? null : item.key)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                              {item.method}
                              <svg
                                className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                            </span>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {item.amount.toLocaleString('ru-KZ')} тг ({item.percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-primary-500 h-2 rounded-full transition-all"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                    {expanded && (
                      <div className="mt-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 space-y-1">
                        {products.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('reports.noPaymentProducts')}
                          </p>
                        ) : (
                          products.map((product, index) => (
                            <div
                              key={`${item.key}-${product.sku}-${index}`}
                              className="flex items-center justify-between gap-3 text-xs leading-5"
                            >
                              <span className="text-gray-700 dark:text-gray-300 truncate">
                                {product.name}{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  × {product.quantity}
                                </span>
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                {Math.round(product.amount).toLocaleString('ru-KZ')} тг
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}

      {reportType === 'cashier' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('common.cashier')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('reports.checks')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('reports.revenue')}
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t('reports.avgCheck')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {cashierReport.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      {t('dashboard.noData')}
                    </td>
                  </tr>
                )}
                {cashierReport.map((row) => (
                  <tr key={row.cashier} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {row.cashier}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {row.checks}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {row.revenue.toLocaleString('ru-KZ')} тг
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {row.avgCheck.toLocaleString('ru-KZ')} тг
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReportsScreen
