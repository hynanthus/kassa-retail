import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { App as CapacitorApp } from '@capacitor/app'
import { initDatabase, checkIntegrity, flushDatabase } from './db/database'
import { seedIfEmpty } from './db/seed'
import { isNativeApp, mirrorDatabase } from './db/backup'
import {
  showNotification,
  dismissNotification,
  subscribeToNotifications,
  getNotifications,
} from './services/notifications'

// Screens
import LoginScreen from './screens/auth/LoginScreen'
import DashboardScreen from './screens/DashboardScreen'
import POScreen from './screens/pos/POScreen'
import ProductsScreen from './screens/products/ProductsScreen'
import WarehouseScreen from './screens/warehouses/WarehouseScreen'
import ClientsScreen from './screens/clients/ClientsScreen'
import CertificatesScreen from './screens/certificates/CertificatesScreen'
import ReportsScreen from './screens/reports/ReportsScreen'
import SettingsScreen from './screens/SettingsScreen'
import { ThemeContext } from './shared/context/ThemeContext'
import { LangContext } from './shared/context/LangContext'

// Icons
import HomeIcon from './shared/components/icons/HomeIcon'
import CashierIcon from './shared/components/icons/CashierIcon'
import ProductsIcon from './shared/components/icons/ProductsIcon'
import WarehouseIcon from './shared/components/icons/WarehouseIcon'
import ClientsIcon from './shared/components/icons/ClientsIcon'
import CertificatesIcon from './shared/components/icons/CertificatesIcon'
import ReportsIcon from './shared/components/icons/ReportsIcon'
import SettingsIcon from './shared/components/icons/SettingsIcon'
import LogoutIcon from './shared/components/icons/LogoutIcon'

export type Screen = 'dashboard' | 'pos' | 'products' | 'warehouse' | 'clients' | 'certificates' | 'reports' | 'settings'

interface NavItem {
  id: Screen
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'common.home', icon: HomeIcon },
  { id: 'pos', label: 'common.cashier', icon: CashierIcon },
  { id: 'products', label: 'common.products', icon: ProductsIcon },
  { id: 'warehouse', label: 'common.warehouse', icon: WarehouseIcon },
  { id: 'clients', label: 'common.clients', icon: ClientsIcon },
  { id: 'certificates', label: 'common.certificates', icon: CertificatesIcon },
  { id: 'reports', label: 'common.reports', icon: ReportsIcon },
  { id: 'settings', label: 'common.settings', icon: SettingsIcon },
]

function App() {
  const { t, i18n } = useTranslation()
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard')
  const [isAuthenticatedScreen, setIsAuthenticatedScreen] = useState(true)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('kassa_theme')
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  })
  const [language, setLanguage] = useState<'ru' | 'kk' | 'en'>(() => {
    const stored = localStorage.getItem('kassa_language')
    return stored === 'ru' || stored === 'kk' || stored === 'en' ? stored : 'ru'
  })
  const [isDbReady, setIsDbReady] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)
  const didInitRef = useRef(false)

  useEffect(() => {
    // Защита от повторного запуска (двойной effect в StrictMode):
    // проверка целостности и её тост должны быть однократными.
    if (didInitRef.current) return
    didInitRef.current = true
    const initialize = async () => {
      try {
        await initDatabase()
        await seedIfEmpty()
        const integrity = await checkIntegrity()
        if (integrity.valid) {
          showNotification(i18n.t('notifications.integritySuccess'), 'success')
        } else {
          showNotification(i18n.t('notifications.integrityFailure'), 'error')
        }
      } catch {
        // База не поднялась — работать нельзя, показываем экран с ошибкой.
        setDbError(i18n.t('notifications.dbError'))
      } finally {
        setIsDbReady(true)
      }
    }
    initialize()
  }, [i18n])

  useEffect(() => {
    localStorage.setItem('kassa_language', language)
    i18n.changeLanguage(language)
  }, [i18n, language])

  useEffect(() => {
    localStorage.setItem('kassa_theme', theme)
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else if (theme === 'light') {
      root.classList.remove('dark')
    } else {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      if (mediaQuery.matches) {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
      const handler = (e: MediaQueryListEvent) => {
        if (theme === 'system') {
          if (e.matches) {
            root.classList.add('dark')
          } else {
            root.classList.remove('dark')
          }
        }
      }
      mediaQuery.addEventListener('change', handler)
      return () => mediaQuery.removeEventListener('change', handler)
    }
  }, [theme])

  // Сохраняем базу и обновляем копию в общедоступной папке при сворачивании.
  useEffect(() => {
    const handleHide = () => {
      void flushDatabase()
      void mirrorDatabase()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') handleHide()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handleHide)

    let appListener: { remove: () => Promise<void> } | null = null
    let mirrorInterval: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    if (isNativeApp()) {
      void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) handleHide()
      }).then((listener) => {
        if (cancelled) {
          void listener.remove()
        } else {
          appListener = listener
        }
      })
      mirrorInterval = setInterval(() => {
        void mirrorDatabase()
      }, 5 * 60 * 1000)
    }

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handleHide)
      if (appListener) void appListener.remove()
      if (mirrorInterval) clearInterval(mirrorInterval)
    }
  }, [])

  // Аппаратная кнопка «Назад»: возврат на главную, иначе сворачивание приложения.
  useEffect(() => {
    if (!isNativeApp()) return
    let listener: { remove: () => Promise<void> } | null = null
    let cancelled = false
    void CapacitorApp.addListener('backButton', () => {
      if (isAuthenticatedScreen) {
        void CapacitorApp.minimizeApp()
        return
      }
      if (currentScreen !== 'dashboard') {
        setCurrentScreen('dashboard')
        return
      }
      void CapacitorApp.minimizeApp()
    }).then((handle) => {
      if (cancelled) {
        void handle.remove()
      } else {
        listener = handle
      }
    })
    return () => {
      cancelled = true
      if (listener) void listener.remove()
    }
  }, [currentScreen, isAuthenticatedScreen])

  const handleLogin = useCallback(() => {
    setIsAuthenticatedScreen(false)
    showNotification(t('notifications.loginSuccess'), 'success')
  }, [t])

  const handleLogout = useCallback(() => {
    setIsAuthenticatedScreen(true)
    setCurrentScreen('dashboard')
    showNotification(t('auth.logoutSuccess'), 'success')
  }, [t])

  if (!isDbReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-300">{t('common.loading')}</div>
      </div>
    )
  }

  if (dbError) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-md text-center space-y-4">
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">{dbError}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('notifications.dbErrorHint')}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
            >
              {t('common.retry')}
            </button>
          </div>
        </div>
        <Notifications />
      </>
    )
  }

  if (isAuthenticatedScreen) {
    return (
      <>
        <LoginScreen onLogin={handleLogin} />
        <Notifications />
      </>
    )
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <LangContext.Provider value={{ language, setLanguage }}>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 flex pl-[var(--safe-left)] pr-[var(--safe-right)]">
          {/* Sidebar - sticky column in page flow, never overlaps content */}
          <aside className="sticky top-0 h-screen w-16 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col z-40 pt-[var(--safe-top)] pb-[var(--safe-bottom)]">
            <nav className="flex-1 p-1 space-y-0.5 overflow-y-auto pt-3">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentScreen(item.id)}
                  className={`w-full flex items-center justify-center p-3 rounded-lg transition-colors ${
                    currentScreen === item.id
                      ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                  title={t(item.label)}
                >
                  <item.icon className="w-7 h-7" />
                </button>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-auto">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 transition-colors"
                  title={t('common.logout')}
                >
                  <LogoutIcon className="w-7 h-7" />
                </button>
              </div>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0 min-h-screen pb-[var(--safe-bottom)]">
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 pb-4 pt-[calc(1rem+var(--safe-top))] sticky top-0 z-30">
              <div className="w-full max-w-[1500px] mx-auto flex items-center justify-between gap-4">
                {/* Centered page title */}
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 text-center flex-1">
                  {t(NAV_ITEMS.find((n) => n.id === currentScreen)?.label || 'common.home')}
                </h2>
                {/* Cashier info with right margin */}
                <div className="flex items-center gap-2 mr-2 sm:mr-6 shrink-0">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t('common.cashier')}
                  </span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    admin
                  </span>
                </div>
              </div>
            </header>
            <div className="px-4 sm:px-6 lg:px-8 py-6 w-full max-w-[1500px] mx-auto">
              {currentScreen === 'dashboard' && <DashboardScreen />}
              {currentScreen === 'pos' && <POScreen />}
              {currentScreen === 'products' && <ProductsScreen />}
              {currentScreen === 'warehouse' && <WarehouseScreen />}
              {currentScreen === 'clients' && <ClientsScreen />}
              {currentScreen === 'certificates' && <CertificatesScreen />}
              {currentScreen === 'reports' && <ReportsScreen />}
              {currentScreen === 'settings' && <SettingsScreen />}
            </div>
          </main>
        </div>

        {/* Notifications */}
        <Notifications />
      </LangContext.Provider>
    </ThemeContext.Provider>
  )
}

function Notifications() {
  const [notifications, setNotifications] = useState(getNotifications())

  useEffect(() => {
    return subscribeToNotifications(setNotifications)
  }, [])

  return (
    <div className="fixed bottom-[calc(1rem+var(--safe-bottom))] right-4 space-y-2 z-50">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`px-6 py-3 rounded-lg shadow-lg text-white transition-all duration-300 transform translate-y-0 opacity-100 ${
            notification.type === 'success'
              ? 'bg-green-500'
              : notification.type === 'error'
              ? 'bg-red-500'
              : notification.type === 'warning'
              ? 'bg-yellow-500'
              : 'bg-blue-500'
          }`}
          onClick={() => dismissNotification(notification.id)}
        >
          {notification.message}
        </div>
      ))}
    </div>
  )
}

export default App