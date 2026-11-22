import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductRepo, type Product } from '../../features/repo/ProductRepo'
import { showNotification } from '../../services/notifications'
import * as XLSX from 'xlsx'

function ProductsScreen() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  useEffect(() => {
    const loadProducts = async () => {
      const data = await ProductRepo.list()
      setProducts(data)
    }
    loadProducts()
  }, [])

  const loadProducts = async () => {
    const data = await ProductRepo.list()
    setProducts(data)
  }

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSaveProduct = async (product: Omit<Product, 'id'>) => {
    try {
      if (editProduct) {
        await ProductRepo.update(editProduct.id, product)
        showNotification(t('notifications.saveSuccess'), 'success')
      } else {
        await ProductRepo.add(product)
        showNotification(t('notifications.addSuccess'), 'success')
      }
      setShowAddModal(false)
      setEditProduct(null)
      loadProducts()
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm(t('products.deleteConfirm'))) return
    try {
      await ProductRepo.remove(id)
      showNotification(t('notifications.deleteSuccess'), 'success')
      loadProducts()
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const openAddModal = () => {
    setEditProduct(null)
    setShowAddModal(true)
  }

  const openEditModal = (product: Product) => {
    setEditProduct(product)
    setShowAddModal(true)
  }

  const handleExportProducts = async () => {
    try {
      const data = await ProductRepo.list()
      const worksheet = XLSX.utils.json_to_sheet(
        data.map((p) => ({
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          buyPrice: p.priceBuy,
          sellPrice: p.priceSell,
          stock: p.stock,
          minStock: p.minStock,
          active: p.active,
          warehouse: p.warehouse === '1' ? 'main' : 'temporary',
        }))
      )
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products')
      XLSX.writeFile(workbook, 'products_export.xlsx')
      showNotification(t('notifications.exportSuccess'), 'success')
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const handleImportProducts = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.xlsx,.xls,.csv'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      try {
        const isCsv = file.name.toLowerCase().endsWith('.csv')
        const workbook = isCsv
          ? XLSX.read(await file.text(), { type: 'string' })
          : XLSX.read(await file.arrayBuffer())
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet)
        // Собираем все строки и вставляем одним пакетом: для тысяч товаров
        // это одна транзакция и одна запись базы вместо тысяч.
        const items: Omit<Product, 'id'>[] = data.map((row) => {
          const warehouseValue = String(row.warehouse ?? '1').toLowerCase()
          return {
            sku: String(row.sku ?? ''),
            name: String(row.name ?? ''),
            barcode: String(row.barcode ?? ''),
            priceBuy: Number(row.buyPrice ?? 0),
            priceSell: Number(row.sellPrice ?? 0),
            stock: Number(row.stock ?? 0),
            minStock: Number(row.minStock ?? 0),
            active: row.active === false || row.active === 'false' || row.active === 0 ? false : true,
            warehouse: warehouseValue === '2' || warehouseValue === 'temporary' ? '2' : '1',
          }
        })
        const { imported, skipped } = await ProductRepo.addMany(items)
        await loadProducts()
        showNotification(t('notifications.importSuccess', { count: imported }), 'success')
        if (skipped > 0) {
          showNotification(t('notifications.importSkipped', { count: skipped }), 'warning')
        }
      } catch {
        showNotification(t('notifications.error'), 'error')
      }
    }
    input.click()
  }

  return (
    <div className="space-y-6">
      {/* Верхняя панель */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('common.search')}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleImportProducts}
            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            {t('products.importProducts')}
          </button>
          <button
            onClick={handleExportProducts}
            className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            {t('products.exportProducts')}
          </button>
          <button
            onClick={openAddModal}
            className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
          >
            <span className="text-xl">+</span>
            {t('products.addProduct')}
          </button>
        </div>
      </div>

      {/* Таблица товаров */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.sku')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.name')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.barcode')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.buyPrice')} (тг)
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.sellPrice')} (тг)
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.stock')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.minStock')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.active')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {product.sku}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                    {product.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {product.barcode}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {product.priceBuy}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-primary-600 dark:text-primary-400">
                    {product.priceSell}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                    <span
                      className={`font-bold ${
                        product.stock <= product.minStock
                          ? 'text-red-600 dark:text-red-400'
                          : ''
                      }`}
                    >
                      {product.stock}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {product.minStock}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        product.active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {product.active ? t('products.active') : t('products.inactive')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <button
                      onClick={() => openEditModal(product)}
                      className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors mr-3"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(product.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                    >
                      {t('common.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно добавления/редактирования товара */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              {editProduct ? t('products.editProduct') : t('products.addProduct')}
            </h3>
            <ProductForm
              initialData={editProduct ?? { sku: '', name: '', barcode: '', priceBuy: 0, priceSell: 0, stock: 0, minStock: 0, active: true, warehouse: '1' }}
              onSave={handleSaveProduct}
              onCancel={() => { setShowAddModal(false); setEditProduct(null) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface ProductFormProps {
  initialData: Omit<Product, 'id'>
  onSave: (product: Omit<Product, 'id'>) => Promise<void>
  onCancel: () => void
}

function ProductForm({ initialData, onSave, onCancel }: ProductFormProps) {
  const { t } = useTranslation()
  const [sku, setSku] = useState(initialData.sku)
  const [name, setName] = useState(initialData.name)
  const [barcode, setBarcode] = useState(initialData.barcode)
  const [priceBuy, setPriceBuy] = useState(initialData.priceBuy)
  const [priceSell, setPriceSell] = useState(initialData.priceSell)
  const [stock, setStock] = useState(initialData.stock)
  const [minStock, setMinStock] = useState(initialData.minStock)
  const [active, setActive] = useState(initialData.active)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Склад товара здесь не выбирается: остатки по складам ведутся
    // на экране «Склад» (корректировки и перемещения).
    onSave({ sku, name, barcode, priceBuy, priceSell, stock, minStock, active, warehouse: initialData.warehouse ?? '1' })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('products.sku')}
        </label>
        <input
          type="text"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('products.sku')}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('products.name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('products.name')}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('products.barcode')}
        </label>
        <input
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('products.barcode')}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('products.buyPrice')} (тг)
          </label>
          <input
            type="number"
            value={priceBuy}
            onChange={(e) => setPriceBuy(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            placeholder="0"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('products.sellPrice')} (тг)
          </label>
          <input
            type="number"
            value={priceSell}
            onChange={(e) => setPriceSell(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            placeholder="0"
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('products.stock')}
          </label>
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            placeholder="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('products.minStock')}
          </label>
          <input
            type="number"
            value={minStock}
            onChange={(e) => setMinStock(Number(e.target.value))}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            placeholder="0"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="active"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="w-4 h-4 text-primary-600 rounded"
        />
        <label htmlFor="active" className="text-sm text-gray-700 dark:text-gray-300">
          {t('products.active')}
        </label>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          type="submit"
          className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium"
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

export default ProductsScreen
