import i18n from '@/i18n'
import en from './locales/en/tasks.json'
import vi from './locales/vi/tasks.json'

/**
 * The words of tasks (05: the Task Board, its form and pickers), in their
 * own namespace, `tasks`, added when the board loads, as `messaging` is
 * (src/i18n/messaging.ts).
 */
export const tasksResources = { en, vi } as const

i18n.addResourceBundle('en', 'tasks', en, true, true)
i18n.addResourceBundle('vi', 'tasks', vi, true, true)
