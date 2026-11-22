export type NotificationType = 'success' | 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  type: NotificationType
  message: string
}

type Listener = (list: Notification[]) => void

let notifications: Notification[] = []
let nextId = 0
const listeners = new Set<Listener>()

function notify(): void {
  // Отдаём копию массива, чтобы React гарантированно обновился
  const snapshot = [...notifications]
  listeners.forEach((listener) => listener(snapshot))
}

export function subscribeToNotifications(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function showNotification(message: string, type: NotificationType = 'info'): string {
  const id = String(++nextId)
  notifications = [...notifications, { id, type, message }]

  setTimeout(() => {
    dismissNotification(id)
  }, 5000)

  notify()
  return id
}

export function dismissNotification(id: string): void {
  notifications = notifications.filter((n) => n.id !== id)
  notify()
}

export function getNotifications(): Notification[] {
  return [...notifications]
}

export function clearNotifications(): void {
  notifications = []
  notify()
}
