import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { ClientRepo, type Client, type ClientDebt } from '../../features/repo/ClientRepo'
import { showNotification } from '../../services/notifications'

function ClientsScreen() {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [clients, setClients] = useState<Client[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null)

  useEffect(() => {
    const loadClients = async () => {
      const data = await ClientRepo.list()
      setClients(data)
    }
    loadClients()
  }, [])

  const loadClients = async () => {
    const data = await ClientRepo.list()
    setClients(data)
  }

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.includes(searchQuery)
  )

  const handleSaveClient = async (client: Omit<Client, 'id'>) => {
    try {
      if (editClient) {
        await ClientRepo.update(editClient.id, client)
        showNotification(t('notifications.saveSuccess'), 'success')
      } else {
        await ClientRepo.add(client)
        showNotification(t('notifications.addSuccess'), 'success')
      }
      setShowAddModal(false)
      setEditClient(null)
      loadClients()
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  const handleDeleteClient = async (id: string) => {
    if (confirm(t('clients.deleteConfirm'))) {
      await ClientRepo.remove(id)
      if (expandedClientId === id) setExpandedClientId(null)
      showNotification(t('notifications.deleteSuccess'), 'success')
      loadClients()
    }
  }

  const openAddModal = () => {
    setEditClient(null)
    setShowAddModal(true)
  }

  const openEditModal = (client: Client) => {
    setEditClient(client)
    setShowAddModal(true)
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
        <button
          onClick={openAddModal}
          className="px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium flex items-center gap-2"
        >
          <span className="text-xl">+</span>
          {t('clients.addClient')}
        </button>
      </div>

      {/* Таблица клиентов */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('clients.name')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('clients.phone')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('clients.debt')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('clients.lastPurchase')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 && (
                <tr className="border-t border-gray-100 dark:border-gray-800">
                  <td colSpan={5} className="py-6 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('clients.noClients')}
                  </td>
                </tr>
              )}
              {filteredClients.map((client) => {
                const isExpanded = expandedClientId === client.id
                return (
                  <Fragment key={client.id}>
                    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                            {client.name.split(' ').map((n) => n[0]).join('')}
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedClientId(isExpanded ? null : client.id)}
                            className="font-medium text-gray-900 dark:text-gray-100 hover:text-primary-600 dark:hover:text-primary-400 transition-colors text-left"
                          >
                            {client.name}
                          </button>
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {client.phone}
                      </td>
                      <td className={`py-3 px-4 text-sm font-medium ${client.debt > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                        {client.debt.toLocaleString('ru-KZ')} тг
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {client.lastPurchase ?? t('clients.never')}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <button
                          onClick={() => openEditModal(client)}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors mr-3"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleDeleteClient(client.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={5} className="px-4 py-3">
                          <ClientDebtPanel
                            client={client}
                            onChanged={loadClients}
                            onEdit={() => openEditModal(client)}
                            onDelete={() => handleDeleteClient(client.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно добавления/редактирования клиента */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              {editClient ? t('clients.editClient') : t('clients.addClient')}
            </h3>
            <ClientForm
              initialData={editClient ?? { name: '', phone: '', debt: 0, lastPurchase: null }}
              onSave={handleSaveClient}
              onCancel={() => { setShowAddModal(false); setEditClient(null) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

interface ClientDebtPanelProps {
  client: Client
  onChanged: () => Promise<void> | void
  onEdit: () => void
  onDelete: () => void
}

function ClientDebtPanel({ client, onChanged, onEdit, onDelete }: ClientDebtPanelProps) {
  const { t } = useTranslation()
  const [debts, setDebts] = useState<ClientDebt[]>([])
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const refreshDebts = async () => {
    const data = await ClientRepo.listDebts(client.id)
    setDebts(data)
  }

  useEffect(() => {
    let active = true
    ClientRepo.listDebts(client.id).then((data) => {
      if (active) setDebts(data)
    })
    return () => {
      active = false
    }
  }, [client.id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = Number(amount)
    if (!parsed || parsed <= 0) return
    setSaving(true)
    try {
      await ClientRepo.addDebt(client.id, parsed, reason.trim())
      setAmount('')
      setReason('')
      await refreshDebts()
      await onChanged()
      showNotification(t('notifications.saveSuccess'), 'success')
    } catch {
      showNotification(t('notifications.error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (debtId: string) => {
    try {
      await ClientRepo.removeDebt(debtId)
      await refreshDebts()
      await onChanged()
      showNotification(t('notifications.deleteSuccess'), 'success')
    } catch {
      showNotification(t('notifications.error'), 'error')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('clients.debtHistory')}
        </h4>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={onEdit}
            className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            {t('common.edit')}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>

      {debts.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('clients.noDebts')}</p>
      ) : (
        <div className="space-y-1">
          {debts.map((debt) => (
            <div
              key={debt.id}
              className="flex items-center justify-between gap-3 text-xs bg-white dark:bg-gray-800 rounded px-3 py-1.5 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex-1 min-w-0">
                <span className="text-gray-500 dark:text-gray-400">{debt.createdAt.slice(0, 10)}</span>
                <span className="ml-2 text-gray-900 dark:text-gray-100">{debt.reason || '—'}</span>
              </div>
              <span className="font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
                {debt.amount.toLocaleString('ru-KZ')} тг
              </span>
              <button
                type="button"
                onClick={() => handleRemove(debt.id)}
                className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors whitespace-nowrap"
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('clients.debtAmount')}
          className="w-full sm:w-40 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
        />
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('clients.debtReasonPlaceholder')}
          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="submit"
          disabled={saving || !Number(amount)}
          className="px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {t('common.save')}
        </button>
      </form>
    </div>
  )
}

interface ClientFormProps {
  initialData: Omit<Client, 'id'>
  onSave: (client: Omit<Client, 'id'>) => Promise<void>
  onCancel: () => void
}

function ClientForm({ initialData, onSave, onCancel }: ClientFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialData.name)
  const [phone, setPhone] = useState(initialData.phone)
  const [debt, setDebt] = useState(initialData.debt)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ name, phone, debt, lastPurchase: initialData.lastPurchase })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('clients.name')}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder={t('clients.name')}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('clients.phone')}
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder="+7 777 000 00 00"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('clients.debt')} (тг)
        </label>
        <input
          type="number"
          value={debt}
          onChange={(e) => setDebt(Number(e.target.value))}
          className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
          placeholder="0"
        />
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

export default ClientsScreen
