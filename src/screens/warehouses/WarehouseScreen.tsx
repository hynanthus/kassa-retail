import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import WarehouseIcon from '../../shared/components/icons/WarehouseIcon'
import { WarehouseRepo, type ProductStock } from '../../features/repo/WarehouseRepo'
import { showNotification } from '../../services/notifications'

function WarehouseScreen() {
  const { t } = useTranslation()
  const [selectedWarehouse, setSelectedWarehouse] = useState<'main' | 'temporary'>('main')
  const [stockData, setStockData] = useState<ProductStock[]>([])
  const [mainStock, setMainStock] = useState<ProductStock[]>([])
  const [temporaryStock, setTemporaryStock] = useState<ProductStock[]>([])
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductStock | null>(null)
  const [adjustQuantity, setAdjustQuantity] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const [transferFrom, setTransferFrom] = useState<'main' | 'temporary'>('temporary')
  const [transferTo, setTransferTo] = useState<'main' | 'temporary'>('main')
  const [transferProductId, setTransferProductId] = useState('')
  const [transferQuantity, setTransferQuantity] = useState(0)
  const [adjustmentLog, setAdjustmentLog] = useState<any[]>([])
  const [showLog, setShowLog] = useState(false)
  const [stockQuery, setStockQuery] = useState('')

  const selectWarehouse = (warehouse: 'main' | 'temporary') => {
    setSelectedWarehouse(warehouse)
    setStockQuery('')
  }

  const normalizedQuery = stockQuery.trim().toLowerCase()
  const filteredStock = normalizedQuery
    ? stockData.filter(
        (item) =>
          item.sku.toLowerCase().includes(normalizedQuery) ||
          item.name.toLowerCase().includes(normalizedQuery)
      )
    : stockData

  const loadStock = async (warehouse: 'main' | 'temporary') => {
    try {
      const [main, temp] = await Promise.all([
        WarehouseRepo.getStockMain(),
        WarehouseRepo.getStockTemporary(),
      ])
      setMainStock(main)
      setTemporaryStock(temp)
      setStockData(warehouse === 'main' ? main : temp)
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const loadLog = async (warehouse: 'main' | 'temporary') => {
    try {
      const rows = await WarehouseRepo.getAdjustmentLog(warehouse === 'main' ? '1' : '2')
      setAdjustmentLog(rows)
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  useEffect(() => {
    loadStock(selectedWarehouse)
    loadLog(selectedWarehouse)
    // Данные перезагружаются при смене склада.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWarehouse])

  const refreshAll = async (warehouse: 'main' | 'temporary') => {
    await loadStock(warehouse)
    await loadLog(warehouse)
  }

  const openAdjustModal = (product: ProductStock) => {
    setSelectedProduct(product)
    setAdjustQuantity(0)
    setAdjustReason('')
    setShowAdjustModal(true)
  }

  const handleAdjust = async () => {
    if (!selectedProduct || adjustQuantity === 0) return
    try {
      await WarehouseRepo.adjust(
        selectedProduct.productId,
        selectedWarehouse === 'main' ? '1' : '2',
        adjustQuantity,
        adjustReason || 'Корректировка остатков',
        'admin'
      )
      showNotification(t('notifications.saveSuccess'), 'success')
      setShowAdjustModal(false)
      await refreshAll(selectedWarehouse)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'NOT_ENOUGH_MAIN') {
        showNotification(t('warehouse.notEnoughMain'), 'warning')
      } else if (code === 'NOT_ENOUGH_TEMPORARY') {
        showNotification(t('warehouse.notEnoughTemporary'), 'warning')
      } else {
        showNotification(t('notifications.error'), 'error')
      }
    }
  }

  const handleMove = async () => {
    if (transferFrom === transferTo) {
      showNotification(t('notifications.error'), 'warning')
      return
    }
    if (!transferProductId || transferQuantity <= 0) {
      showNotification(t('notifications.error'), 'warning')
      return
    }
    const available = (transferFrom === 'temporary' ? temporaryStock : mainStock).find(
      (item) => item.productId === transferProductId
    )
    if (!available || available.qty < transferQuantity) {
      showNotification(t('notifications.error'), 'warning')
      return
    }
    try {
      await WarehouseRepo.transfer(
        transferProductId,
        transferFrom === 'main' ? '1' : '2',
        transferTo === 'main' ? '1' : '2',
        transferQuantity,
        'admin'
      )
      showNotification(t('notifications.saveSuccess'), 'success')
      setTransferProductId('')
      setTransferQuantity(0)
      await refreshAll(selectedWarehouse)
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Список складов */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <WarehouseIcon className="w-5 h-5" />
            {t('warehouse.warehouse')}
          </h3>
          <div className="space-y-3">
            <button
              onClick={() => selectWarehouse('main')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedWarehouse === 'main'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {t('warehouse.mainWarehouse')}
                </span>
                <span className="px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-xs rounded-full font-medium">
                  {t('warehouse.mainWarehouse')}
                </span>
              </div>
            </button>
            <button
              onClick={() => selectWarehouse('temporary')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                selectedWarehouse === 'temporary'
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {t('warehouse.temporaryWarehouse')}
                </span>
              </div>
            </button>
          </div>
        </div>

        {/* Перемещение */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t('warehouse.transfer')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('warehouse.fromWarehouse')}
              </label>
              <select
                value={transferFrom}
                onChange={(e) => {
                  setTransferFrom(e.target.value as 'main' | 'temporary')
                  setTransferProductId('')
                  setTransferQuantity(0)
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
              >
                <option value="temporary">{t('warehouse.temporaryWarehouse')}</option>
                <option value="main">{t('warehouse.mainWarehouse')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('warehouse.toWarehouse')}
              </label>
              <select
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value as 'main' | 'temporary')}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
              >
                <option value="main">{t('warehouse.mainWarehouse')}</option>
                <option value="temporary">{t('warehouse.temporaryWarehouse')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('warehouse.product')}
              </label>
              <select
                value={transferProductId}
                onChange={(e) => {
                  setTransferProductId(e.target.value)
                  setTransferQuantity(0)
                }}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
              >
                <option value="">—</option>
                {(transferFrom === 'temporary' ? temporaryStock : mainStock).map((item) => (
                  <option key={item.productId} value={item.productId}>
                    {item.sku} — {item.name} ({t('warehouse.available')}: {item.qty})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('warehouse.quantity')}
              </label>
              <input
                type="number"
                min={1}
                value={transferQuantity || ''}
                onChange={(e) => setTransferQuantity(Number(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button
              onClick={handleMove}
              className="w-full py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              {t('warehouse.move')}
            </button>
          </div>
        </div>
      </div>

      {/* Остатки на складе */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('common.stock')}
            {selectedWarehouse && (
              <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                {selectedWarehouse === 'main'
                  ? t('warehouse.mainWarehouse')
                  : t('warehouse.temporaryWarehouse')}
              </span>
            )}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => selectWarehouse('main')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedWarehouse === 'main'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {t('warehouse.mainWarehouse')}
            </button>
            <button
              onClick={() => selectWarehouse('temporary')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedWarehouse === 'temporary'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {t('warehouse.temporaryWarehouse')}
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <input
              type="text"
              value={stockQuery}
              onChange={(e) => setStockQuery(e.target.value)}
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
        </div>
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
                  {t('warehouse.warehouse')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('products.stock')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.length === 0 && (
                <tr className="border-t border-gray-100 dark:border-gray-800">
                  <td colSpan={5} className="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {normalizedQuery ? t('common.nothingFound') : t('warehouse.emptyStock')}
                  </td>
                </tr>
              )}
              {filteredStock.map((item) => (
                <tr key={item.productId} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                    {item.sku}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                    {item.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {item.warehouseId === '1'
                      ? t('warehouse.mainWarehouse')
                      : t('warehouse.temporaryWarehouse')}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.qty}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <button
                      onClick={() => openAdjustModal(item)}
                      className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
                    >
                      {t('warehouse.adjustment')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Журнал действий по складу */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t('warehouse.actionLog')}
          </h3>
          <button
            onClick={() => setShowLog((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {showLog ? t('common.close') : t('common.open')}
          </button>
        </div>
        {showLog && (
          <div className="overflow-x-auto">
            {adjustmentLog.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 dark:text-gray-400">
                {t('warehouse.noRecords')}
              </p>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('warehouse.date')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('products.sku')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('products.name')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('warehouse.changeQuantity')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('warehouse.adjustmentReason')}
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t('warehouse.performedBy')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {adjustmentLog.map((row) => (
                    <tr key={String(row.id)} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {String(row.performedAt).replace('T', ' ').slice(0, 19)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                        {String(row.sku)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                        {String(row.name)}
                      </td>
                      <td className={`py-3 px-4 text-sm font-medium ${Number(row.quantityChange) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {Number(row.quantityChange) >= 0 ? '+' : ''}
                        {Number(row.quantityChange)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {String(row.reason)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {String(row.performedBy)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно корректировки */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">
              {t('warehouse.adjustment')}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('warehouse.product')}
                </label>
                <input
                  type="text"
                  value={`${selectedProduct.sku} — ${selectedProduct.name}`}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('warehouse.currentQuantity')}
                </label>
                <input
                  type="number"
                  value={selectedProduct.qty}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('warehouse.changeQuantity')}
                </label>
                <input
                  type="number"
                  value={adjustQuantity}
                  onChange={(e) => setAdjustQuantity(Number(e.target.value))}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('warehouse.adjustmentReason')}
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                  placeholder={t('warehouse.reasonPlaceholder')}
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleAdjust}
                  className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg hover:bg-primary-700 transition-colors font-medium"
                >
                  {t('common.save')}
                </button>
                <button
                  onClick={() => setShowAdjustModal(false)}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 py-2.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default WarehouseScreen
