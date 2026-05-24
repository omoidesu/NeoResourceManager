import { ref } from 'vue'

export type NotificationCenterType = 'success' | 'error' | 'info' | 'warning'

export type NotificationCenterItem = {
  id: string
  type: NotificationCenterType
  title: string
  content: string
  createdAt: number
  aggregateKey?: string
  aggregateCount?: number
}

export type OngoingCenterItem = {
  id: string
  title: string
  content: string
  progress?: number
  progressText?: string
  kind?: 'default' | 'audio-player'
  meta?: Record<string, any>
  createdAt: number
  onClick?: () => void
}

const notifications = ref<NotificationCenterItem[]>([])
const ongoingItems = ref<OngoingCenterItem[]>([])

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

export function useNotificationCenterStore() {
  return {
    notifications,
    ongoingItems
  }
}

export function pushNotificationCenterItem(item: Omit<NotificationCenterItem, 'id' | 'createdAt'>) {
  const aggregateKey = String(item.aggregateKey ?? '').trim()
  if (aggregateKey) {
    const existingIndex = notifications.value.findIndex((current) => String(current.aggregateKey ?? '').trim() === aggregateKey)
    if (existingIndex >= 0) {
      const existing = notifications.value[existingIndex]
      const nextItem: NotificationCenterItem = {
        ...existing,
        ...item,
        id: existing.id,
        createdAt: Date.now()
      }
      notifications.value = notifications.value.map((current, index) => index === existingIndex ? nextItem : current)
      return existing.id
    }
  }

  const nextItem: NotificationCenterItem = {
    id: createId(),
    createdAt: Date.now(),
    ...item
  }

  notifications.value = [nextItem, ...notifications.value]
  return nextItem.id
}

export function upsertOngoingCenterItem(item: Omit<OngoingCenterItem, 'createdAt'>) {
  const existingIndex = ongoingItems.value.findIndex((current) => current.id === item.id)
  const nextItem: OngoingCenterItem = {
    createdAt: existingIndex >= 0 ? ongoingItems.value[existingIndex].createdAt : Date.now(),
    ...item
  }

  if (existingIndex >= 0) {
    ongoingItems.value = ongoingItems.value.map((current, index) => index === existingIndex ? nextItem : current)
    return
  }

  ongoingItems.value = [nextItem, ...ongoingItems.value]
}

export function removeOngoingCenterItem(id: string) {
  ongoingItems.value = ongoingItems.value.filter((item) => item.id !== id)
}

export function removeNotificationCenterItem(id: string) {
  notifications.value = notifications.value.filter((item) => item.id !== id)
}

export function clearNotificationCenterItems() {
  notifications.value = []
}
