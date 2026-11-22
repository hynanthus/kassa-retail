import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  checkIntegrity,
  exportDatabase,
  flushDatabase,
  checkIntegrityOfBytes,
  loadDatabaseFromBytes,
} from '../db/database'
import {
  exportDatabaseFile,
  isNativeApp,
  savePrivateBackup,
  writePublicCopy,
} from '../db/backup'
import { showNotification } from '../services/notifications'
import { useTheme } from '../shared/hooks/useTheme'
import { useLanguage } from '../shared/hooks/useLanguage'
import DatabaseIcon from '../shared/components/icons/DatabaseIcon'
import UploadIcon from '../shared/components/icons/UploadIcon'
import MoonIcon from '../shared/components/icons/MoonIcon'
import SunIcon from '../shared/components/icons/SunIcon'

function generateBackupFileName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `kassa_backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.sqlite`
}

function downloadBytes(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function SettingsScreen() {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isNative = isNativeApp()

  const handleBackup = async () => {
    try {
      await flushDatabase()
      const bytes = exportDatabase()
      const fileName = generateBackupFileName()
      if (isNative) {
        const location = await exportDatabaseFile(bytes, fileName)
        showNotification(`${t('notifications.backupSuccess')}: ${location}`, 'success')
      } else {
        downloadBytes(bytes, fileName)
        showNotification(`${t('notifications.backupSuccess')}: ${fileName}`, 'success')
      }
    } catch {
      showNotification(t('notifications.backupFailure'), 'error')
    }
  }

  const handleLoadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Сбрасываем значение input, чтобы повторный выбор того же файла работал
    event.target.value = ''
    if (!file) return

    try {
      const bytes = new Uint8Array(await file.arrayBuffer())

      // 1. Проверяем целостность загружаемого файла
      const fileIntegrity = checkIntegrityOfBytes(bytes)
      if (!fileIntegrity.valid) {
        showNotification(`${t('notifications.integrityFailure')}: ${fileIntegrity.message}`, 'error')
        return
      }

      // 2. Автоматически сохраняем текущую базу как резервную копию (с датой и временем)
      try {
        await flushDatabase()
        const currentBytes = exportDatabase()
        const oldBackupName = generateBackupFileName()
        if (isNative) {
          await savePrivateBackup(currentBytes, oldBackupName)
          await writePublicCopy(currentBytes, 'kassa_before_restore.sqlite')
        } else {
          downloadBytes(currentBytes, oldBackupName)
        }
        showNotification(`${t('notifications.oldBackupSaved')} ${oldBackupName}`, 'info')
      } catch {
        showNotification(t('notifications.backupFailure'), 'warning')
      }

      // 3. Заменяем текущую базу загруженной
      await loadDatabaseFromBytes(bytes)
      showNotification(`${t('notifications.loadSuccess')} (${file.name})`, 'success')
    } catch (error) {
      showNotification(
        `${t('notifications.loadFailure')}: ${error instanceof Error ? error.message : error}`,
        'error'
      )
    }
  }

  const handleIntegrityCheck = async () => {
    const integrity = await checkIntegrity()
    showNotification(
      integrity.valid ? t('notifications.integritySuccess') : t('notifications.integrityFailure'),
      integrity.valid ? 'success' : 'error'
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Настройки приложения */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          {t('app.name')}
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.language')}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'ru' | 'kk' | 'en')}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
            >
              <option value="ru">Русский</option>
              <option value="kk">Қазақша</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('settings.theme')}
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setTheme('light')}
                className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                  theme === 'light'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <SunIcon className="w-5 h-5" />
                <span>{t('settings.light')}</span>
              </button>
              <button
                onClick={() => setTheme('dark')}
                className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                  theme === 'dark'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <MoonIcon className="w-5 h-5" />
                <span>{t('settings.dark')}</span>
              </button>
              <button
                onClick={() => setTheme('system')}
                className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center gap-2 ${
                  theme === 'system'
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-xl font-bold">Aa</span>
                <span>{t('settings.system')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Управление данными */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <DatabaseIcon className="w-5 h-5" />
          {t('settings.dataManagement')}
        </h3>
        <div className="space-y-4">
          <button
            onClick={handleBackup}
            className="w-full p-4 rounded-lg border-2 border-primary-500 bg-primary-50 dark:bg-primary-900/20 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center gap-3"
          >
            <UploadIcon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {t('settings.backupDatabase')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.backupDescription')}
              </p>
            </div>
          </button>

          <input
            ref={fileInputRef}
            id="restore-db-input"
            type="file"
            aria-label={t('settings.loadDatabase')}
            accept={isNative ? '*/*' : '.sqlite,.db,application/x-sqlite3'}
            onChange={handleLoadBackup}
            className="sr-only"
          />
          <label
            htmlFor="restore-db-input"
            className="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-500 transition-colors flex items-center gap-3 cursor-pointer"
          >
            <UploadIcon className="w-6 h-6 text-gray-400" />
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {t('settings.loadDatabase')}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.loadDatabaseDescription')}
              </p>
            </div>
          </label>

          {isNative && (
            <p className="text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/40 rounded-lg p-3">
              {t('settings.deviceStorageHint')}
            </p>
          )}

          <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={handleIntegrityCheck}
              className="w-full p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center justify-between"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {t('settings.integrityCheck')}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.integrityCheckDescription')}
                </p>
              </div>
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsScreen
