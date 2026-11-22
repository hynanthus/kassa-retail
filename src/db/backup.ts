import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { bytesToBase64 } from './bytes'
import { exportDatabase, flushDatabase } from './database'

/**
 * Работа с файлами базы на устройстве (только нативная платформа).
 *
 * Рабочая база живёт в приватной папке приложения (см. storage.ts).
 * Дополнительно свежая копия автоматически пишется в общедоступную папку,
 * чтобы файл можно было забрать через проводник/файловый менеджер:
 *   1) Documents/Kassa/kassa_current.sqlite — если система разрешает запись;
 *   2) Android/data/<appId>/files/Kassa/... — запасной вариант (виден по USB).
 */

const PUBLIC_FOLDER = 'Kassa'
const PUBLIC_FILE = 'kassa_current.sqlite'
const PRIVATE_BACKUP_FOLDER = 'kassa/backups'
const MAX_PRIVATE_BACKUPS = 5
/** Совпадает с appId в capacitor.config.ts. */
const APP_ID = 'kz.kassa.retail'

export type CopyLocation = 'documents' | 'external'

export interface PublicCopyResult {
  location: CopyLocation
  /** Путь для показа пользователю, например Documents/Kassa/kassa_current.sqlite */
  displayPath: string
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform()
}

async function writeToDirectory(
  directory: Directory,
  path: string,
  base64: string
): Promise<string | null> {
  try {
    await Filesystem.writeFile({ path, directory, data: base64, recursive: true })
    return path
  } catch (error) {
    console.warn(`Failed to write ${path} to ${directory}`, error)
    return null
  }
}

/** Записывает копию базы в общедоступную папку. */
export async function writePublicCopy(
  bytes: Uint8Array,
  fileName: string = PUBLIC_FILE
): Promise<PublicCopyResult | null> {
  if (!isNativeApp()) return null
  const base64 = bytesToBase64(bytes)
  const relativePath = `${PUBLIC_FOLDER}/${fileName}`

  const documents = await writeToDirectory(Directory.Documents, relativePath, base64)
  if (documents) {
    return { location: 'documents', displayPath: `Documents/${relativePath}` }
  }

  const external = await writeToDirectory(Directory.External, relativePath, base64)
  if (external) {
    return {
      location: 'external',
      displayPath: `Android/data/${APP_ID}/files/${relativePath}`,
    }
  }

  return null
}

let lastMirrorAt = 0
let mirrorInFlight: Promise<PublicCopyResult | null> | null = null

/**
 * Фоновая копия базы в общедоступную папку. Вызывается при сворачивании
 * приложения и по таймеру; не чаще одного раза в минуту, если не force.
 */
export function mirrorDatabase(force = false): Promise<PublicCopyResult | null> {
  if (!isNativeApp()) return Promise.resolve(null)
  const now = Date.now()
  if (!force && now - lastMirrorAt < 60_000) return Promise.resolve(null)
  if (mirrorInFlight) return mirrorInFlight

  lastMirrorAt = now
  mirrorInFlight = (async () => {
    try {
      await flushDatabase()
      return await writePublicCopy(exportDatabase())
    } catch (error) {
      console.warn('Failed to mirror database', error)
      return null
    } finally {
      mirrorInFlight = null
    }
  })()
  return mirrorInFlight
}

/**
 * Экспорт базы по кнопке «Выгрузить базу»:
 * сначала пробуем сохранить в Documents, иначе отдаём файл через «Поделиться».
 * Возвращает описание места сохранения для уведомления.
 */
export async function exportDatabaseFile(bytes: Uint8Array, fileName: string): Promise<string> {
  if (!isNativeApp()) {
    throw new Error('Native export is not available on this platform')
  }

  const base64 = bytesToBase64(bytes)
  const relativePath = `${PUBLIC_FOLDER}/${fileName}`
  const documents = await writeToDirectory(Directory.Documents, relativePath, base64)
  if (documents) {
    return `Documents/${relativePath}`
  }

  // Резервный вариант: файл во временной папке + системное «Поделиться».
  await Filesystem.writeFile({
    path: fileName,
    directory: Directory.Cache,
    data: base64,
  })
  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
  await Share.share({ title: fileName, files: [uri], dialogTitle: fileName })
  return fileName
}

/**
 * Приватная резервная копия перед загрузкой чужой базы.
 * Хранится в папке приложения, последние MAX_PRIVATE_BACKUPS штук.
 */
export async function savePrivateBackup(bytes: Uint8Array, fileName: string): Promise<void> {
  if (!isNativeApp()) return
  try {
    await Filesystem.mkdir({
      path: PRIVATE_BACKUP_FOLDER,
      directory: Directory.Data,
      recursive: true,
    })
    await Filesystem.writeFile({
      path: `${PRIVATE_BACKUP_FOLDER}/${fileName}`,
      directory: Directory.Data,
      data: bytesToBase64(bytes),
    })

    const listing = await Filesystem.readdir({
      path: PRIVATE_BACKUP_FOLDER,
      directory: Directory.Data,
    })
    const names = listing.files
      .map((file) => file.name)
      .filter((name) => name.endsWith('.sqlite'))
      .sort()

    while (names.length > MAX_PRIVATE_BACKUPS) {
      const oldest = names.shift()
      if (!oldest) break
      try {
        await Filesystem.deleteFile({
          path: `${PRIVATE_BACKUP_FOLDER}/${oldest}`,
          directory: Directory.Data,
        })
      } catch {
        // Не критично: старую копию удалим в следующий раз.
      }
    }
  } catch (error) {
    console.warn('Failed to save private backup', error)
  }
}
