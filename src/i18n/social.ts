import i18n from '@/i18n'
import en from './locales/en/social.json'
import vi from './locales/vi/social.json'

/**
 * The words of the Friends page and the Add friend dialog (09 S-DM-02), in
 * their own namespace, `social`, added when the page first opens, as
 * `notifications` is (src/i18n/notifications.ts).
 */
export const socialResources = { en, vi } as const

i18n.addResourceBundle('en', 'social', en, true, true)
i18n.addResourceBundle('vi', 'social', vi, true, true)
