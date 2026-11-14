import { safeLocalStorage } from '@/lib/safe-storage'

/** How many emoji "Recently used" keeps (SRS 1.71). */
export const RECENT_MAX = 16

/** Shown until the person has picked any (frame `eLFUv`; owner's call, 14/11/2026). */
export const DEFAULT_RECENT = ['👍', '🎉', '😂', '❤️', '🙏', '🔥', '✅', '😴']

const key = (userId: string) => `emoji-recent:${userId}`

/**
 * The emoji this person picked last in this browser, newest first (SRS
 * 1.71): the picker's "Recently used". The frame's eight until they have
 * picked any; a list that cannot be read counts as none.
 */
export function readRecent(userId: string | undefined): string[] {
    if (!userId) return DEFAULT_RECENT
    try {
        const stored: unknown = JSON.parse(safeLocalStorage.get(key(userId)) ?? '[]')
        const emoji = Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string') : []
        return emoji.length ? emoji.slice(0, RECENT_MAX) : DEFAULT_RECENT
    } catch {
        return DEFAULT_RECENT
    }
}

/** An emoji picked: first in the list, once, the oldest dropped past 16. */
export function rememberEmoji(userId: string | undefined, emoji: string): void {
    if (!userId) return
    const kept = readRecent(userId) === DEFAULT_RECENT ? [] : readRecent(userId)
    const next = [emoji, ...kept.filter((item) => item !== emoji)].slice(0, RECENT_MAX)
    safeLocalStorage.set(key(userId), JSON.stringify(next))
}
