import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { base64ToBytes, blobToBase64, bytesToBase64 } from './bytes'

/**
 * Хранилище базы данных.
 *
 * - Веб: IndexedDB (снимает лимит localStorage ~5 МБ, хранит байты без base64).
 * - Android/iOS (Capacitor): файл kassa_database.sqlite в приватной папке
 *   приложения (Directory.Data) с атомарной заменой через временный файл.
 *
 * Старые данные из localStorage автоматически переносятся в IndexedDB
 * при первом запуске новой версии.
 */

export type StorageKind = 'web' | 'native'
export type StorageLocation = 'indexeddb' | 'localstorage' | 'file'

export interface DatabaseStorage {
  kind: StorageKind
  location: StorageLocation
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
}

/* ------------------------------------------------------------------ */
/* Веб: IndexedDB                                                      */
/* ------------------------------------------------------------------ */

const IDB_NAME = 'kassa'
const IDB_STORE = 'files'
const IDB_KEY = 'database.sqlite'
const LEGACY_LOCAL_STORAGE_KEY = 'kassa_database_v1'

let idbPromise: Promise<IDBDatabase> | null = null

function openIdb(): Promise<IDBDatabase> {
  if (!idbPromise) {
    idbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IDB_STORE)) {
          request.result.createObjectStore(IDB_STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    })
  }
  return idbPromise
}

async function idbRead(): Promise<Uint8Array | null> {
  const database = await openIdb()
  return new Promise((resolve, reject) => {
    const request = database
      .transaction(IDB_STORE, 'readonly')
      .objectStore(IDB_STORE)
      .get(IDB_KEY)
    request.onsuccess = () => {
      const value = request.result
      if (!value) return resolve(null)
      if (value instanceof Uint8Array) return resolve(value)
      if (value instanceof ArrayBuffer) return resolve(new Uint8Array(value))
      resolve(null)
    }
    request.onerror = () => reject(request.error)
  })
}

async function idbWrite(bytes: Uint8Array): Promise<void> {
  const database = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, 'readwrite')
    transaction.objectStore(IDB_STORE).put(bytes, IDB_KEY)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB write aborted'))
  })
}

/** Старое хранилище: base64-строка в localStorage. */
function createLocalStorageStorage(): DatabaseStorage {
  return {
    kind: 'web',
    location: 'localstorage',
    async load() {
      const stored = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY)
      return stored ? base64ToBytes(stored) : null
    },
    async save(bytes) {
      localStorage.setItem(LEGACY_LOCAL_STORAGE_KEY, bytesToBase64(bytes))
    },
  }
}

function createWebStorage(): DatabaseStorage {
  if (typeof indexedDB === 'undefined') {
    return createLocalStorageStorage()
  }

  return {
    kind: 'web',
    location: 'indexeddb',
    async load() {
      const stored = await idbRead()
      if (stored) return stored

      // Перенос базы из localStorage (версия до перехода на IndexedDB).
      const legacy = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY)
      if (!legacy) return null
      try {
        const bytes = base64ToBytes(legacy)
        await idbWrite(bytes)
        localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY)
        return bytes
      } catch (error) {
        console.warn('Failed to migrate database from localStorage', error)
        return null
      }
    },
    async save(bytes) {
      await idbWrite(bytes)
    },
  }
}

/* ------------------------------------------------------------------ */
/* Android/iOS: файл в приватной папке приложения                      */
/* ------------------------------------------------------------------ */

const NATIVE_FOLDER = 'kassa'
const NATIVE_FILE = `${NATIVE_FOLDER}/kassa_database.sqlite`
const NATIVE_TMP = `${NATIVE_FOLDER}/kassa_database.sqlite.tmp`
const NATIVE_BAK = `${NATIVE_FOLDER}/kassa_database.sqlite.bak`

async function ensureNativeFolder(): Promise<void> {
  try {
    await Filesystem.mkdir({ path: NATIVE_FOLDER, directory: Directory.Data, recursive: true })
  } catch {
    // Папка уже существует — это нормально.
  }
}

async function nativeRead(path: string): Promise<Uint8Array | null> {
  try {
    const result = await Filesystem.readFile({ path, directory: Directory.Data })
    if (typeof result.data === 'string') {
      return base64ToBytes(result.data)
    }
    return base64ToBytes(await blobToBase64(result.data))
  } catch {
    return null
  }
}

function createNativeStorage(): DatabaseStorage {
  return {
    kind: 'native',
    location: 'file',
    async load() {
      const main = await nativeRead(NATIVE_FILE)
      if (main) return main
      // Если приложение было закрыто между удалением и переименованием файла,
      // восстанавливаемся из резервной копии.
      return nativeRead(NATIVE_BAK)
    },
    async save(bytes) {
      await ensureNativeFolder()
      await Filesystem.writeFile({
        path: NATIVE_TMP,
        directory: Directory.Data,
        data: bytesToBase64(bytes),
      })
      try {
        await Filesystem.deleteFile({ path: NATIVE_BAK, directory: Directory.Data })
      } catch {
        // Резервной копии ещё нет.
      }
      try {
        await Filesystem.rename({ from: NATIVE_FILE, to: NATIVE_BAK, directory: Directory.Data })
      } catch {
        // Основного файла ещё нет (первый запуск).
      }
      await Filesystem.rename({ from: NATIVE_TMP, to: NATIVE_FILE, directory: Directory.Data })
      try {
        await Filesystem.deleteFile({ path: NATIVE_BAK, directory: Directory.Data })
      } catch {
        // Не критично.
      }
    },
  }
}

/* ------------------------------------------------------------------ */

let storage: DatabaseStorage | null = null

export function getStorage(): DatabaseStorage {
  if (!storage) {
    storage = Capacitor.isNativePlatform() ? createNativeStorage() : createWebStorage()
  }
  return storage
}
