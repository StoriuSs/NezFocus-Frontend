import type { UserSettings } from '../types'

/**
 * Tells this browser's other tabs about saved settings, so a theme or
 * language chosen in one tab shows at once in the others (10-settings ›
 * S-ME-04 › Tương tác), and their time zone lock is right.
 *
 * The channel opens on first use, never at import: this module is reachable
 * from the first download. Without BroadcastChannel (some embedded browsers)
 * the other tabs catch up when they load the settings again.
 */
const CHANNEL = 'settings'

let channel: BroadcastChannel | null = null
function open(): BroadcastChannel | null {
    if (channel || typeof BroadcastChannel === 'undefined') return channel
    channel = new BroadcastChannel(CHANNEL)
    return channel
}

export function tellOtherTabs(settings: UserSettings): void {
    open()?.postMessage(settings)
}

/** Listen to the other tabs. Returns the function that stops listening. */
export function onOtherTabSettings(listener: (settings: UserSettings) => void): () => void {
    const current = open()
    if (!current) return () => undefined
    const handler = (event: MessageEvent<UserSettings>) => listener(event.data)
    current.addEventListener('message', handler)
    return () => current.removeEventListener('message', handler)
}
