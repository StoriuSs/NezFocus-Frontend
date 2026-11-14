import type { TFunction } from 'i18next'
import '@/i18n/messaging'

/*
 * The emoji picker's data (C-12, SRS 1.71): `emojibase-data` in the
 * person's language, read with `import()` the first time the picker opens,
 * so its 90 kB stay out of the chat's chunk.
 */

/** An entry of emojibase's `data.json`, the fields read here. */
export interface RawEmoji {
    emoji: string
    label: string
    group?: number
    order?: number
    version: number
    tags?: string[]
}

/** emojibase's groups, by number; 2 (`component`) holds the skin tone pieces, not emoji to pick. */
const GROUPS = [
    'smileys-emotion',
    'people-body',
    'component',
    'animals-nature',
    'food-drink',
    'travel-places',
    'activities',
    'objects',
    'symbols',
    'flags'
] as const
export type EmojiGroupKey = Exclude<(typeof GROUPS)[number], 'component'>

/**
 * Newer emoji are left out: Windows 11 draws Emoji 15.0, and 15.1 or 16
 * shows as boxes or two pictures side by side (owner's call, 14/11/2026).
 * One someone else typed still shows on a message where the device can.
 */
const NEWEST_VERSION = 15

export interface EmojiEntry {
    /** In the server's one standard form (`normaliseEmoji`). */
    emoji: string
    label: string
    /** Name and tags, without accents, for the search. */
    words: string[]
}

export interface EmojiGroup {
    key: EmojiGroupKey
    emojis: EmojiEntry[]
}

/** Lower case, without accents, đ as d: "Đề Cương" → "de cuong" (C-12 › Luật: search without accents). */
export function fold(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase()
}

let rgiEmoji: RegExp | null | undefined
/** One standard emoji, as the server reads it (`\p{RGI_Emoji}`); null where the browser cannot tell. */
function rgi(): RegExp | null {
    if (rgiEmoji === undefined) {
        try {
            rgiEmoji = new RegExp('^\\p{RGI_Emoji}$', 'v')
        } catch {
            rgiEmoji = null
        }
    }
    return rgiEmoji
}

/**
 * The same form without the `v` flag (Safari before 17, Firefox before 116):
 * U+FE0F dropped after a character drawn as an emoji anyway, which is what
 * the standard form lacks ("👍️" is "👍", "❤️" stays). Checked against the
 * standard check for all 7,632 emoji and skins of emojibase-data 16.0.3; it
 * does not tell an emoji from other text, which the server still does.
 */
export function normaliseLoosely(text: string): string {
    return text.replace(/(\p{Emoji_Presentation})\u{FE0F}/gu, '$1')
}

/**
 * The one form the server keeps for an emoji (backend `normaliseEmoji`):
 * itself when standard, else without the U+FE0F emojibase writes after
 * some ("👍️" is "👍"). Null for anything that is not one emoji. A browser
 * without the `v` flag uses `normaliseLoosely`, so a chip and a pick of the
 * same emoji still match.
 */
export function normaliseEmoji(text: string): string | null {
    const standard = rgi()
    if (!standard) return text ? normaliseLoosely(text) : null
    if (standard.test(text)) return text
    const bare = text.replace(/\u{FE0F}/gu, '')
    return bare !== text && standard.test(bare) ? bare : null
}

/** The picker's groups in emojibase's order, as the picker shows them. */
export function buildGroups(data: RawEmoji[]): EmojiGroup[] {
    const groups = new Map<EmojiGroupKey, EmojiEntry[]>()
    const kept = data
        .filter((item) => item.group !== undefined && GROUPS[item.group] !== 'component')
        .filter((item) => item.version <= NEWEST_VERSION)
        .sort((a, b) => a.group! - b.group! || (a.order ?? 0) - (b.order ?? 0))
    for (const item of kept) {
        const emoji = normaliseEmoji(item.emoji)
        if (!emoji) continue
        const key = GROUPS[item.group!] as EmojiGroupKey
        const words = [item.label, ...(item.tags ?? [])].flatMap((text) => fold(text).split(/\s+/)).filter(Boolean)
        const entries = groups.get(key) ?? []
        entries.push({ emoji, label: item.label, words })
        groups.set(key, entries)
    }
    return [...groups].map(([key, emojis]) => ({ key, emojis }))
}

/** Emoji whose name or tags have a word starting with each word of `query`, in the picker's order. */
export function searchEmoji(groups: EmojiGroup[], query: string): EmojiEntry[] {
    const wanted = fold(query).split(/\s+/).filter(Boolean)
    if (!wanted.length) return []
    return groups.flatMap((group) =>
        group.emojis.filter((entry) => wanted.every((part) => entry.words.some((word) => word.startsWith(part))))
    )
}

/** A block of the picker's grid: its heading and its emoji. */
export interface PickerSection {
    key: string
    title: string
    emojis: { emoji: string; label: string }[]
}

/**
 * What the picker's grid shows: the matches of a search under "Results"
 * (none: nothing, the picker says so), else "Recently used" (named from the
 * data once read) and every group.
 */
export function pickerSections(
    groups: EmojiGroup[] | undefined,
    query: string,
    recent: string[],
    t: TFunction<'messaging'>
): PickerSection[] {
    if (query.trim()) {
        const found = groups ? searchEmoji(groups, query) : []
        return found.length ? [{ key: 'results', title: t('emoji.results'), emojis: found }] : []
    }
    const labels = new Map(groups?.flatMap((group) => group.emojis.map((item) => [item.emoji, item.label] as const)))
    return [
        {
            key: 'recent',
            title: t('emoji.recent'),
            emojis: recent.map((emoji) => ({ emoji, label: labels.get(emoji) ?? emoji }))
        },
        ...(groups ?? []).map((group) => ({
            key: group.key,
            title: t(`emoji.groups.${group.key}`),
            emojis: group.emojis
        }))
    ]
}

/** The picker's emoji in Vietnamese or English, read the first time it opens. */
export async function loadEmoji(language: string): Promise<EmojiGroup[]> {
    const data = language.startsWith('vi')
        ? await import('emojibase-data/vi/data.json')
        : await import('emojibase-data/en/data.json')
    return buildGroups(data.default as RawEmoji[])
}
