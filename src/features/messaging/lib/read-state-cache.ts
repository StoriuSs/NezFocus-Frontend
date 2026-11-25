import type { BareMessage, ReadState } from '../types'
import { isRelated } from './related'

/** The backend counts unread messages and mentions up to this (D-173); 100 shows as "99+". */
export const READ_COUNT_CAP = 100

/** What a socket event did to the read states: the states, and whether the list is to be read again. */
export interface Heard {
    states: ReadState[] | undefined
    refetch: boolean
}

// Message ids are UUIDv7: a later message has a greater id, compared as text (as the backend does).
const isAfter = (id: string, mark: string) => id > mark

const replace = (states: ReadState[], next: ReadState) =>
    states.map((held) => (held.channelId === next.channelId ? next : held))

/**
 * One channel's state from an answer or an event, kept only when its mark is
 * not behind the one held: two marks close together may be told back out of
 * order (D-173). A channel not held yet is added; nothing is held before the
 * list is first read.
 */
export function keepState(states: ReadState[] | undefined, incoming: ReadState): ReadState[] | undefined {
    if (!states) return states
    const held = states.find((state) => state.channelId === incoming.channelId)
    if (!held) return [...states, incoming]
    return isAfter(held.lastReadId, incoming.lastReadId) ? states : replace(states, incoming)
}

/**
 * The list read again (GET /me/read-states): channels as it says (one no
 * longer listed is gone: left, or no longer seen), except one whose held mark
 * is further on, marked meanwhile.
 */
export function keepList(states: ReadState[] | undefined, fresh: ReadState[]): ReadState[] {
    if (!states) return fresh
    const held = new Map(states.map((state) => [state.channelId, state]))
    return fresh.map((state) => {
        const mine = held.get(state.channelId)
        return mine && isAfter(mine.lastReadId, state.lastReadId) ? mine : state
    })
}

/** From the reader: theirs, or a system message about them; never unread (D-173). */
export const isFromReader = (message: BareMessage, me: string) =>
    message.author?.id === me || (message.type === 'system' && message.systemData?.userId === me)

const capped = (count: number) => Math.min(count + 1, READ_COUNT_CAP)

/**
 * A message heard on the socket (`message.created`): after the mark and not
 * from the reader (theirs, or a system message about them), its channel is
 * unread by one more; about the reader (D-39, D-172), mentioned by one more.
 * Whose roles a role mention reaches, whose a deleted message answered was,
 * and a channel with no state yet, are the server's to say: the list is read
 * again.
 */
export function hearMessage(states: ReadState[] | undefined, message: BareMessage, me: string | undefined): Heard {
    if (!states) return { states, refetch: false }
    const held = states.find((state) => state.channelId === message.channelId)
    if (!held) return { states, refetch: true }
    if (!me || !isAfter(message.id, held.lastReadId) || isFromReader(message, me)) return { states, refetch: false }
    const related = isRelated(message, { id: me, roleIds: [] })
    const next = {
        ...held,
        unreadCount: capped(held.unreadCount),
        mentionCount: related ? capped(held.mentionCount) : held.mentionCount
    }
    return {
        states: replace(states, next),
        refetch:
            !related &&
            message.type === 'regular' &&
            (message.mentionRoles.length > 0 || message.replyTo?.deleted === true)
    }
}

/**
 * A message edited (`message.updated`): one still unread may have gained or
 * lost a mention of the reader: the list is read again.
 */
export function hearEdited(states: ReadState[] | undefined, message: BareMessage, me: string | undefined): Heard {
    const held = states?.find((state) => state.channelId === message.channelId)
    const unread = !!held && !!me && isAfter(message.id, held.lastReadId) && !isFromReader(message, me)
    return { states, refetch: unread }
}

/**
 * A message deleted (`message.deleted`): one after the mark may have been
 * unread, and about the reader, which the event no longer says: the list is
 * read again.
 */
export function hearDeleted(states: ReadState[] | undefined, channelId: string, messageId: string): Heard {
    const held = states?.find((state) => state.channelId === channelId)
    return { states, refetch: !!held && isAfter(messageId, held.lastReadId) }
}

/**
 * Read here up to a message (D-46): the mark moves forward, never back; up
 * to the channel's newest message (`allRead`), nothing is left unread. Short
 * of it, the counts wait for the backend's answer.
 */
export function markRead(
    states: ReadState[] | undefined,
    channelId: string,
    messageId: string,
    allRead: boolean
): ReadState[] | undefined {
    const held = states?.find((state) => state.channelId === channelId)
    if (!states || !held || !isAfter(messageId, held.lastReadId)) return states
    return replace(states, {
        ...held,
        lastReadId: messageId,
        ...(allRead ? { unreadCount: 0, mentionCount: 0 } : {})
    })
}

// Only the channels still listed count (owner, 14/11/2026): one deleted, or of a server left, no longer does.
const listed = (state: ReadState, channelIds: readonly string[] | undefined) =>
    !channelIds || channelIds.includes(state.channelId)

/**
 * A server on the rail (C-05): unread when any of its channels is; its
 * badge, the mentions of all of them (02 › luật dữ liệu 1). `channelIds`:
 * the channels the server list shows now.
 */
export function serverState(
    states: ReadState[] | undefined,
    serverId: string,
    channelIds?: readonly string[]
): { unread: boolean; mentions: number } {
    let unread = false
    let mentions = 0
    for (const state of states ?? []) {
        if (state.serverId !== serverId || !listed(state, channelIds)) continue
        unread ||= state.unreadCount > 0
        mentions += state.mentionCount
    }
    return { unread, mentions }
}

/**
 * The DMs' share of the states (D-244: a DM's state has no server; a DM not
 * in one's list has none): how many DMs have unread messages, the rail's 💬
 * Badge, and how many messages, which the tab title adds (09 › luật 6).
 */
export function dmUnread(states: ReadState[] | undefined): { dms: number; messages: number } {
    let dms = 0
    let messages = 0
    for (const state of states ?? []) {
        if (state.serverId !== null || state.unreadCount === 0) continue
        dms += 1
        messages += state.unreadCount
    }
    return { dms, messages }
}

/** The channels of the DMs the states hold, as text (the same text, the same DMs). */
export const dmChannelIds = (states: ReadState[] | undefined): string =>
    (states ?? [])
        .filter((state) => state.serverId === null)
        .map((state) => state.channelId)
        .join(',')

/**
 * The servers' share of the tab title's number (REQ-MSG-09): every mention of
 * the reader still unread, in the channels listed; the AppShell adds the DMs'
 * unread messages (`dmUnread`).
 */
export function mentionTotal(states: ReadState[] | undefined, channelIds?: readonly string[]): number {
    return (states ?? []).reduce((total, state) => total + (listed(state, channelIds) ? state.mentionCount : 0), 0)
}
