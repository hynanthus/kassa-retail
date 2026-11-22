import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { showNotification } from '../../services/notifications'
import { scanBarcode } from '../../features/scanner/scanner'
import { ProductRepo, type Product } from '../../features/repo/ProductRepo'
import { SaleRepo, type CreateSaleInput } from '../../features/repo/SaleRepo'
import { CertificateRepo, type Certificate } from '../../features/repo/CertificateRepo'
import CameraIcon from '../../shared/components/icons/CameraIcon'
import ShoppingCartIcon from '../../shared/components/icons/ShoppingCartIcon'
import TrashIcon from '../../shared/components/icons/TrashIcon'
import SearchIcon from '../../shared/components/icons/SearchIcon'

interface CartItem {
  id: string
  product: {
    id: string
    sku: string
    name: string
    priceBuy: number
    priceSell: number
  }
  quantity: number
  discountPercent: number
}

function POScreen() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr' | 'certificate'>('cash')
  const [paidAmount, setPaidAmount] = useState(0)
  const [certificateCode, setCertificateCode] = useState('')
  const [availableCertificates, setAvailableCertificates] = useState<Certificate[]>([])
  const [confirming, setConfirming] = useState(false)
  const stopScannerRef = useRef<(() => void) | null>(null)

  const loadProducts = useCallback(async () => {
    const data = await ProductRepo.list()
    // Показываем только товары с остатком > 0 и активные
    setProducts(data.filter((product) => product.active && product.stock > 0))
  }, [])

  useEffect(() => {
    loadProducts()
  }, [loadProducts])

  const loadAvailableCertificates = useCallback(async () => {
    try {
      const certs = await CertificateRepo.list()
      const today = new Date().toISOString().slice(0, 10)
      setAvailableCertificates(
        certs.filter(
          (c) => c.amount - c.usedAmount > 0 && c.active && (!c.endDate || c.endDate >= today)
        )
      )
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }, [t])

  useEffect(() => {
    if (paymentMethod === 'certificate') {
      loadAvailableCertificates()
    }
  }, [paymentMethod, loadAvailableCertificates])

  const filteredProducts = products.filter(
    (product) =>
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.barcode.includes(searchQuery)
  )

  const addToCart = useCallback((product: Product) => {
    setConfirming(false)
    setCart((prev) => {
      const existing = prev.find((item) => item.product.sku === product.sku)
      if (existing) {
        return prev.map((item) =>
          item.product.sku === product.sku
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prev, { id: product.id, product, quantity: 1, discountPercent: 0 }]
    })
  }, [])

  const removeFromCart = (sku: string) => {
    setConfirming(false)
    setCart((prev) => prev.filter((item) => item.product.sku !== sku))
  }

  const updateQuantity = (sku: string, delta: number) => {
    setConfirming(false)
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.sku === sku
            ? { ...item, quantity: Math.max(1, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const totalAmount = cart.reduce(
    (sum, item) => sum + item.product.priceSell * item.quantity * (1 - item.discountPercent / 100),
    0
  )

  // Закупочная стоимость товаров в корзине (с учётом скидки)
  const purchaseAmount = cart.reduce(
    (sum, item) => sum + item.product.priceBuy * item.quantity * (1 - item.discountPercent / 100),
    0
  )

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0)

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      stopScannerRef.current?.()
      stopScannerRef.current = null
      setShowCamera(false)
      const product = products.find(
        (p) => p.sku === decodedText || p.barcode === decodedText
      )
      if (product) {
        addToCart(product)
        showNotification(t('notifications.productAdded'), 'success')
      } else {
        showNotification(t('camera.scanError'), 'warning')
      }
    },
    [products, addToCart, t]
  )

  // Запуск/остановка сканера камеры
  useEffect(() => {
    if (showCamera) {
      const stop = scanBarcode({
        onScanSuccess: handleScanSuccess,
      })
      stopScannerRef.current = stop
      return () => {
        stop()
        stopScannerRef.current = null
      }
    }
  }, [showCamera, handleScanSuccess])

  // Возвращает сертификат или причину отказа; тост показывает вызывающий код.
  const findCertificate = useCallback(
    async (code: string): Promise<{ cert: Certificate } | { error: 'notFound' | 'expired' | 'insufficient' }> => {
      const trimmed = code.trim()
      if (!trimmed) return { error: 'notFound' }
      const list = await CertificateRepo.search(trimmed)
      const exact = list.find((c) => c.code.toLowerCase() === trimmed.toLowerCase())
      if (!exact) return { error: 'notFound' }
      const today = new Date().toISOString().slice(0, 10)
      if (exact.endDate && exact.endDate < today) return { error: 'expired' }
      if (!exact.active) return { error: 'notFound' }
      const remaining = exact.amount - exact.usedAmount
      if (remaining < totalAmount) return { error: 'insufficient' }
      return { cert: exact }
    },
    [totalAmount]
  )

  const handlePayment = async () => {
    setConfirming(false)
    // Общее правило: количество товаров > 0
    if (totalQuantity <= 0) {
      showNotification(t('pos.emptyCart'), 'warning')
      return
    }
    // Сумма чека должна быть положительной
    if (totalAmount <= 0) {
      showNotification(t('pos.noProductsInCart'), 'warning')
      return
    }
    // Покупка не должна быть убыточной: оплата не менее закупочной стоимости
    if (totalAmount < purchaseAmount) {
      showNotification(t('pos.sellBelowCost'), 'warning')
      return
    }

    let paidAmountValue = paymentMethod === 'cash' ? paidAmount : totalAmount
    let certificateId: string | null = null

    if (paymentMethod === 'certificate') {
      const check = await findCertificate(certificateCode)
      if ('error' in check) {
        showNotification(
          check.error === 'expired' ? t('pos.certificateExpired') : t('pos.certificateNotFound'),
          'warning'
        )
        return
      }
      paidAmountValue = totalAmount
      certificateId = check.cert.id
    }

    if (paymentMethod === 'cash' && paidAmount < totalAmount) {
      showNotification(t('pos.lessThanTotal'), 'warning')
      return
    }

    try {
      const createInput: CreateSaleInput = {
        cashierId: 'admin',
        paymentMethod,
        paidAmount: paidAmountValue,
        totalAmount,
        items: cart.map((item) => ({
          productId: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.priceSell,
          discountPercent: item.discountPercent,
        })),
      }
      if (certificateId) {
        createInput.certificateId = certificateId
      }
      // Списание с сертификата выполняется внутри SaleRepo.create одной транзакцией.
      await SaleRepo.create(createInput)

      showNotification(t('notifications.saleSuccess'), 'success')
      setCart([])
      setSearchQuery('')
      setPaidAmount(0)
      setCertificateCode('')
      setConfirming(false)
      await loadProducts()
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'CERT_EXPIRED') {
        showNotification(t('pos.certificateExpired'), 'warning')
      } else if (code === 'CERT_INSUFFICIENT' || code === 'CERT_INACTIVE' || code === 'CERT_NOT_FOUND') {
        showNotification(t('pos.certificateNotFound'), 'warning')
      } else {
        showNotification(t('notifications.error'), 'error')
      }
    }
  }

  const handlePayClick = () => {
    if (confirming) {
      handlePayment()
    } else {
      setConfirming(true)
    }
  }

  const choosePaymentMethod = (method: 'cash' | 'card' | 'qr' | 'certificate') => {
    setPaymentMethod(method)
    setConfirming(false)
  }

  return (
    <div className="flex items-start gap-6">
      {/* Левая часть - товары */}
      <div className="flex-1 flex flex-col gap-4 sticky top-[88px] h-[calc(100vh-140px)]">
        {/* Поиск */}
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('pos.searchProduct')}
            className="w-full pl-12 pr-32 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
          />
          <button
            onClick={() => setShowCamera(!showCamera)}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1.5 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors flex items-center gap-2"
          >
            <CameraIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{t('pos.scanBarcode')}</span>
          </button>
        </div>

        {/* Сетка товаров */}
        <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {showCamera ? (
            <div className="bg-gray-900 rounded-lg p-4 h-full flex flex-col items-center justify-center">
              <div id="reader" className="w-full max-w-md" />
              <button
                onClick={() => setShowCamera(false)}
                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {t('common.close')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 hover:border-primary-500 dark:hover:border-primary-400 transition-all text-left group"
                >
                  <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                    {product.name}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {product.sku}
                  </p>
                  <p className="text-lg font-bold text-primary-600 dark:text-primary-400 mt-2">
                    {product.priceSell} тг
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Правая часть - корзина */}
      <div className="w-96 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col min-h-[calc(100vh-140px)]">
        {/* Итого и оплата */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-4">
          <button
            onClick={handlePayClick}
            disabled={cart.length === 0}
            className={`w-full font-bold py-3 rounded-lg transition-colors text-base ${
              confirming
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : cart.length === 0
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-primary-600 hover:bg-primary-700 text-white'
            }`}
          >
            {confirming ? t('pos.confirmClose') : `${t('pos.pay')} — ${Math.round(totalAmount)} тг`}
          </button>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('pos.paymentMethod')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => choosePaymentMethod('cash')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  paymentMethod === 'cash'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('pos.cash')}
              </button>
              <button
                onClick={() => choosePaymentMethod('card')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  paymentMethod === 'card'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('pos.card')}
              </button>
              <button
                onClick={() => choosePaymentMethod('qr')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  paymentMethod === 'qr'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('pos.qr')}
              </button>
              <button
                onClick={() => choosePaymentMethod('certificate')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  paymentMethod === 'certificate'
                    ? 'bg-primary-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                {t('pos.certificate')}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-gray-600 dark:text-gray-400">
              {t('pos.total')}
            </span>
            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {Math.round(totalAmount)} тг
            </span>
          </div>

          {paymentMethod === 'cash' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('pos.paid')}
              </label>
              <input
                type="number"
                value={paidAmount}
                onChange={(e) => {
                  setPaidAmount(parseFloat(e.target.value) || 0)
                  setConfirming(false)
                }}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                placeholder="0"
              />
              {paidAmount > 0 && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  {t('pos.change')}: {Math.round(paidAmount - totalAmount)} тг
                </p>
              )}
            </div>
          )}

          {paymentMethod === 'certificate' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('pos.certificateInput')}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={certificateCode}
                  onChange={(e) => {
                    setCertificateCode(e.target.value.toUpperCase())
                    setConfirming(false)
                  }}
                  placeholder="CERT-XXXX"
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                />
              </div>
              {availableCertificates.length > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('pos.availableCertificates', { count: availableCertificates.length })}
                </p>
              )}
            </div>
          )}

        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <ShoppingCartIcon className="w-5 h-5" />
              {t('pos.cart')}
            </h3>
            {cart.length > 0 && (
              <button
                onClick={() => {
                  setCart([])
                  setConfirming(false)
                }}
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
              >
                {t('pos.clear')}
              </button>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <ShoppingCartIcon className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>{t('pos.noProductsInCart')}</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.sku}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.product.sku} × {item.quantity}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.product.sku, -1)}
                    className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-300"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(item.product.sku, 1)}
                    className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-center text-gray-700 dark:text-gray-300"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => removeFromCart(item.product.sku)}
                  className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {Math.round(item.product.priceSell * item.quantity)} тг
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  )
}

export default POScreen
