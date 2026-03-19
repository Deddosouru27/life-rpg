import type { Quest } from './types'

export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return Promise.resolve('denied')
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission)
  return Notification.requestPermission()
}

const scheduledTimers: Record<string, ReturnType<typeof setTimeout>> = {}

export function scheduleQuestNotifications(quests: Quest[]): void {
  Object.values(scheduledTimers).forEach(t => clearTimeout(t))
  Object.keys(scheduledTimers).forEach(k => delete scheduledTimers[k])

  const now = Date.now()
  const today = new Date()

  quests.forEach(quest => {
    if (quest.status !== 'active' || !quest.dueTime || !quest.reminderMinutes) return

    const [h, m] = quest.dueTime.split(':').map(Number)
    const dueDate = new Date(today)
    dueDate.setHours(h, m, 0, 0)

    const notifyAt = dueDate.getTime() - quest.reminderMinutes * 60 * 1000
    const delay = notifyAt - now

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      scheduledTimers[quest.id] = setTimeout(() => {
        if (Notification.permission === 'granted') {
          new Notification(`⚔️ Квест ждёт: ${quest.title}`, {
            body: quest.description || `До выполнения: ${quest.reminderMinutes} мин.`,
            icon: '/vite.svg',
          })
        }
      }, delay)
    }
  })
}
