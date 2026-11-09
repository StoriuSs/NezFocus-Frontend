import type { LayoutMove, Server, ServerChannel } from '../types'

/*
 * What the channel list's dialogs and drag and drop work out on the client
 * (REQ-SRV-02, D-84, D-149), to answer before a request: the name a text
 * channel will be stored as ("Sẽ lưu là …"), a clash in the target group, the
 * places a channel may be dropped at, and the list right after a drop. The
 * backend checks every rule again; these mirror
 * NezFocus-Backend/src/modules/servers/domain/channel-name.rules.ts.
 */

export const CHANNEL_NAME_MAX_LENGTH = 100

/** Channels and categories together, per server. */
export const MAX_CHANNELS_AND_CATEGORIES = 500

export type ChannelType = ServerChannel['type']

const NOT_KEPT = /[^\p{L}\p{M}\p{N}_-]/gu
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const INVISIBLE = /[\s\p{Default_Ignorable_Code_Point}]/gu
const CONTROL = /\p{Cc}/u

/** Characters as the API counts them: code points after composing. */
export const nameLength = (name: string) => [...name.normalize('NFC')].length

/** "Hỏi Đáp Chung" → "hỏi-đáp-chung"; may come out empty ("???"). */
export function normaliseTextChannelName(typed: string): string {
    return typed
        .normalize('NFC')
        .toLowerCase()
        .replace(/\s+/gu, '-')
        .replace(NOT_KEPT, '')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .normalize('NFC')
}

/** What a channel or room called `typed` is stored as; categories keep it like rooms. */
export function storedName(type: ChannelType | 'category', typed: string): string {
    return type === 'text' ? normaliseTextChannelName(typed) : typed.normalize('NFC').trim()
}

export type NameProblem = 'length' | 'noLetterOrDigit'

/** Why the name cannot be used, or null. */
export function nameProblem(type: ChannelType | 'category', typed: string): NameProblem | null {
    const name = storedName(type, typed)
    const length = [...name].length
    if (length === 0 || length > CHANNEL_NAME_MAX_LENGTH) return 'length'
    if (type === 'text') return LETTER_OR_DIGIT.test(name) ? null : 'noLetterOrDigit'
    return !CONTROL.test(name) && name.replace(INVISIBLE, '').length > 0 ? null : 'length'
}

/** Two names clash when equal in any case, but not with other accents (D-84). */
export const nameKey = (name: string) => name.normalize('NFC').toLowerCase()

/** The channel of that kind in that group already called `name`, if any (`exceptId`: itself). */
export function clashingChannel(
    server: Pick<Server, 'channels'>,
    categoryId: string | null,
    type: ChannelType,
    name: string,
    exceptId?: string
): ServerChannel | undefined {
    const key = nameKey(name)
    return server.channels.find(
        (c) => c.id !== exceptId && (c.categoryId ?? null) === categoryId && c.type === type && nameKey(c.name) === key
    )
}

const byPosition = <T extends { position: number; id: string }>(a: T, b: T) =>
    a.position - b.position || a.id.localeCompare(b.id)

/** The channels of a group (a category, or none) as listed. */
export const groupChannels = (server: Pick<Server, 'channels'>, categoryId: string | null) =>
    server.channels.filter((c) => (c.categoryId ?? null) === categoryId).sort(byPosition)

/** A place to drop a channel: right after `afterId` in a group, first when null. */
export interface ChannelSlot {
    categoryId: string | null
    afterId: string | null
}

/** Every place `channelId` could go, in list order: outside any category first, then each category. */
export function channelSlots(server: Pick<Server, 'channels' | 'categories'>, channelId: string): ChannelSlot[] {
    const groups = [null, ...[...server.categories].sort(byPosition).map((c) => c.id)]
    return groups.flatMap((categoryId) => {
        const others = groupChannels(server, categoryId).filter((c) => c.id !== channelId)
        return [null, ...others.map((c) => c.id)].map((afterId) => ({ categoryId, afterId }))
    })
}

/** Where a channel is now, as a slot. */
export function slotOf(server: Pick<Server, 'channels'>, channel: ServerChannel): ChannelSlot {
    const categoryId = channel.categoryId ?? null
    const group = groupChannels(server, categoryId)
    const index = group.findIndex((c) => c.id === channel.id)
    return { categoryId, afterId: index > 0 ? (group[index - 1]?.id ?? null) : null }
}

export const sameSlot = (a: ChannelSlot, b: ChannelSlot) => a.categoryId === b.categoryId && a.afterId === b.afterId

/** The clash a channel dropped there would make (D-84). Within its own group there is none: names there are already unique. */
export function dropClash(server: Pick<Server, 'channels'>, channel: ServerChannel, slot: ChannelSlot) {
    return clashingChannel(server, slot.categoryId, channel.type, channel.name, channel.id)
}

/** `list` with `item` right after `afterId` (first when null), numbered from 0. */
function placeAfter<T extends { id: string; position: number }>(list: T[], item: T, afterId: string | null): T[] {
    const rest = list.filter((entry) => entry.id !== item.id)
    const index = afterId === null ? 0 : rest.findIndex((entry) => entry.id === afterId) + 1
    return [...rest.slice(0, index), item, ...rest.slice(index)].map((entry, position) => ({ ...entry, position }))
}

/** The server as it looks right after a drop, before the API answers (S-SRV-06: the list changes at once). */
export function applyMove(server: Server, move: LayoutMove): Server {
    if (move.kind === 'category') {
        const category = server.categories.find((c) => c.id === move.id)
        if (!category) return server
        return { ...server, categories: placeAfter([...server.categories].sort(byPosition), category, move.afterId) }
    }
    const channel = server.channels.find((c) => c.id === move.id)
    if (!channel) return server
    const moved = { ...channel, categoryId: move.categoryId }
    const placed = placeAfter(groupChannels(server, move.categoryId), moved, move.afterId)
    const ids = new Set(placed.map((c) => c.id))
    return { ...server, channels: [...server.channels.filter((c) => !ids.has(c.id)), ...placed] }
}
