import i18n from '@/i18n'
import en from './locales/en/messaging.json'
import vi from './locales/vi/messaging.json'

/**
 * The words of a channel's chat (S-CHAT-01), in their own namespace,
 * `messaging`, added when the chat loads, as `servers` is
 * (src/i18n/servers.ts). The connection Banner above it uses `common`.
 */
export const messagingResources = { en, vi } as const

i18n.addResourceBundle('en', 'messaging', en, true, true)
i18n.addResourceBundle('vi', 'messaging', vi, true, true)
