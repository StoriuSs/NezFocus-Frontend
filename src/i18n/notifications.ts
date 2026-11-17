import i18n from '@/i18n'
import en from './locales/en/notifications.json'
import vi from './locales/vi/notifications.json'

/**
 * The words of the inbox (06 S-NOTI-01, C-29), in their own namespace,
 * `notifications`, added when the inbox first opens, as `tasks` is
 * (src/i18n/tasks.ts).
 */
export const notificationsResources = { en, vi } as const

i18n.addResourceBundle('en', 'notifications', en, true, true)
i18n.addResourceBundle('vi', 'notifications', vi, true, true)
