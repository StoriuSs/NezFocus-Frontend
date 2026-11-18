import i18n from '@/i18n'
import en from './locales/en/voice.json'
import vi from './locales/vi/voice.json'

/**
 * The words of voice rooms (07: the preview page, the room, the dock), in
 * their own namespace, `voice`, added when a room's page or the dock loads,
 * as `tasks` is (src/i18n/tasks.ts).
 */
export const voiceResources = { en, vi } as const

i18n.addResourceBundle('en', 'voice', en, true, true)
i18n.addResourceBundle('vi', 'voice', vi, true, true)
