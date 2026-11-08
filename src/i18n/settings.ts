import i18n from '@/i18n'
import en from './locales/en/settings.json'
import vi from './locales/vi/settings.json'

/**
 * The words of the settings pages (S-ME-04 → S-ME-06), in their own
 * namespace, `settings`. Importing this module adds them; only those pages
 * and their pieces import it, so the words come with their chunk instead of
 * the first download (code-splitting.md). Adding twice is harmless.
 */
export const settingsResources = { en, vi } as const

i18n.addResourceBundle('en', 'settings', en, true, true)
i18n.addResourceBundle('vi', 'settings', vi, true, true)
