import i18n from '@/i18n'
import en from './locales/en/servers.json'
import vi from './locales/vi/servers.json'

/**
 * The words of the server dialogs (S-SRV-01 →), in their own namespace,
 * `servers`, added when those dialogs load, as `settings` is
 * (src/i18n/settings.ts). The rail and channel list use `common`.
 */
export const serversResources = { en, vi } as const

i18n.addResourceBundle('en', 'servers', en, true, true)
i18n.addResourceBundle('vi', 'servers', vi, true, true)
