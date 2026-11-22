import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CertificateRepo, type Certificate } from '../../features/repo/CertificateRepo'
import { showNotification } from '../../services/notifications'

function CertificatesScreen() {
  const { t } = useTranslation()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const loadCertificates = async () => {
      const data = await CertificateRepo.list()
      setCertificates(data)
    }
    loadCertificates()
  }, [])

  const loadCertificates = async () => {
    const data = await CertificateRepo.list()
    setCertificates(data)
  }

  const handleSaveCertificate = async (code: string, amount: number, startDate: string, endDate: string) => {
    try {
      await CertificateRepo.add(code, amount, startDate, endDate)
      showNotification(t('notifications.addSuccess'), 'success')
      setShowAddModal(false)
      loadCertificates()
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const handleDeleteCertificate = async (id: string, code: string) => {
    if (confirm(t('certificates.deleteConfirm', { code }))) {
      await CertificateRepo.remove(id)
      showNotification(t('notifications.deleteSuccess'), 'success')
      loadCertificates()
    }
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredCertificates = normalizedQuery
    ? certificates.filter(
        (cert) =>
          cert.code.toLowerCase().includes(normalizedQuery) ||
          String(cert.amount).includes(normalizedQuery)
      )
    : certificates

  return (
    <div className="space-y-6">
      {/* Верхняя панель */}
      <div className="flex justify-between items-center gap-4">
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
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
        >
          <span className="text-xl">+</span>
          {t('certificates.addCertificate')}
        </button>
      </div>

      {/* Таблица сертификатов */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.code')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.amount')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.usedAmount')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.remainingAmount')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.startDate')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.endDate')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('certificates.active')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCertificates.length === 0 && (
                <tr className="border-t border-gray-100 dark:border-gray-800">
                  <td colSpan={8} className="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('certificates.noCertificates')}
                  </td>
                </tr>
              )}
              {filteredCertificates.map((cert) => (
                <tr key={cert.id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="py-3 px-4">
                    <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">
                      {cert.code}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                    {cert.amount.toLocaleString('ru-KZ')} тг
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {cert.usedAmount.toLocaleString('ru-KZ')} тг
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-primary-600 dark:text-primary-400">
                    {(cert.amount - cert.usedAmount).toLocaleString('ru-KZ')} тг
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {cert.startDate}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                    {cert.endDate}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        cert.active
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}
                    >
                      {cert.active ? t('certificates.active') : t('certificates.inactive')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {cert.amount - cert.usedAmount <= 0 ? (
                      <button
                        onClick={() => handleDeleteCertificate(cert.id, cert.code)}
                        className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                      >
                        {t('common.delete')}
                      </button>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно создания сертификата */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              {t('certificates.addCertificate')}
            </h3>
            <CertificateForm
              onSave={handleSaveCertificate}
              onCancel={() => setShowAddModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface CertificateFormProps {
  onSave: (code: string, amount: number, startDate: string, endDate: string) => Promise<void>
  onCancel: () => void
}

function CertificateForm({ onSave, onCancel }: CertificateFormProps) {
  const { t } = useTranslation()
  const [code, setCode] = useState(() => `CERT-${String(Date.now()).slice(-6)}`)
  const [amount, setAmount] = useState(0)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(code, amount, startDate, endDate)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('certificates.code')}
        </label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('certificates.code')}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('certificates.amount')} (тг)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('certificates.amount')}
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('certificates.startDate')}
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('certificates.endDate')}
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            required
          />
        </div>
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

export default CertificatesScreen
