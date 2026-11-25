import type { Dm, DmLastMessage, Presence } from '../types'

/** What the DM list reads of a `message.created` / `message.updated` (the messaging feature's message, as the socket gives it). */
export interface HeardMessage {
    id: string
    channelId: string
    type: 'regular' | 'system'
    systemEvent: string | null
    author: { id: string } | null
    content: string
    mentionUsers: ReadonlyArray<{ id: string; username: string | null; displayName: string | null }>
    attachments: ReadonlyArray<{ width: number | null }>
    createdAt: string
}

// Ids are UUIDv7: a later message has a greater id, compared as text (as the backend does).
const isNewer = (id: string, than: string | undefined) => than === undefined || id > than

/** The DM open with no message yet: at the top while open, however long ago it was made (S-DM-01 › Thứ tự). */
const isOpenEmpty = (dm: Dm, openId: string | undefined) => dm.lastMessage === null && dm.id === openId

/** When a DM was last active: its last message, else its making (a DM with none yet). */
const activeAt = (dm: Dm) => dm.lastMessage?.createdAt ?? dm.createdAt

/**
 * The column's rows (S-DM-01, Q5): the latest active first, by the newest
 * message sent or received (a call's system message too), ties by id. A DM
 * with no message yet shows only while open (`openId`), at the top: left
 * without a word, it goes (D-249 L7-f; the backend keeps it, D-244).
 */
export function shownDms(dms: readonly Dm[], openId: string | undefined): Dm[] {
    return dms
        .filter((dm) => dm.lastMessage !== null || dm.id === openId)
        .sort((a, b) => {
            const first = Number(isOpenEmpty(b, openId)) - Number(isOpenEmpty(a, openId))
            if (first !== 0) return first
            const at = activeAt(b).localeCompare(activeAt(a))
            return at !== 0 ? at : b.id.localeCompare(a.id)
        })
}

/** The DM held in its place, or added. */
export function withDm(dms: readonly Dm[], dm: Dm): Dm[] {
    return dms.some((held) => held.id === dm.id) ? dms.map((held) => (held.id === dm.id ? dm : held)) : [...dms, dm]
}

export const withoutDm = (dms: readonly Dm[], dmId: string): Dm[] => dms.filter((dm) => dm.id !== dmId)

/** My DM with someone, if my list holds it. */
export const dmWith = (dms: readonly Dm[] | undefined, userId: string): Dm | undefined =>
    dms?.find((dm) => dm.user.id === userId)

/** A message as a DM's last one (DmLastMessage): the files counted, the images among them. */
export function lastMessageOf(message: HeardMessage): DmLastMessage {
    return {
        id: message.id,
        type: message.type,
        systemEvent: message.systemEvent,
        authorId: message.author?.id ?? null,
        content: message.content,
        mentionUsers: message.mentionUsers.map(({ id, username, displayName }) => ({ id, username, displayName })),
        files: {
            count: message.attachments.length,
            images: message.attachments.filter((file) => file.width !== null).length
        },
        createdAt: message.createdAt
    }
}

/**
 * A message heard in one of my DMs (`message.created`): its new last
 * message, which puts it first. The same list when the DM is not held (the
 * read states then bring it back, D-244) or the message is no newer.
 */
export function withMessage(dms: readonly Dm[], message: HeardMessage): readonly Dm[] {
    const held = dms.find((dm) => dm.id === message.channelId)
    if (!held || !isNewer(message.id, held.lastMessage?.id)) return dms
    return withDm(dms, { ...held, lastMessage: lastMessageOf(message) })
}

/** An edit of a DM's last message (`message.updated`): its words, as now. */
export function withEdited(dms: readonly Dm[], message: HeardMessage): readonly Dm[] {
    const held = dms.find((dm) => dm.id === message.channelId)
    if (held?.lastMessage?.id !== message.id) return dms
    return withDm(dms, { ...held, lastMessage: lastMessageOf(message) })
}

/** Whether a message deleted was the last one of a DM held: which one is last now is the server's to say. */
export const isLastOf = (dms: readonly Dm[] | undefined, channelId: string, messageId: string): boolean =>
    dms?.some((dm) => dm.id === channelId && dm.lastMessage?.id === messageId) ?? false

/** `presence.updated`: the dot of the one I talk with, where I see it (`presence` not null). */
export function withDmPresence(dms: readonly Dm[], userId: string, status: Presence): readonly Dm[] {
    if (!dms.some((dm) => dm.user.id === userId && dm.presence !== null)) return dms
    return dms.map((dm) => (dm.user.id === userId && dm.presence !== null ? { ...dm, presence: status } : dm))
}

/** What the second line says of the last message (C-30), in the screen's words. */
export interface PreviewWords {
    /** "Bạn: {text}" (mine). */
    mine: (text: string) => string
    image: string
    file: string
    /** A call's system message (its result comes with L7b). */
    call: string
}

/**
 * A DMRow's second line without a study activity (C-30): the last message on
 * one line, "Bạn: …" when mine; files alone "Đã gửi một ảnh" / "Đã gửi một
 * tệp"; a call. `plain` gives the words with mentions by name.
 */
export function previewOf(
    last: DmLastMessage | null,
    me: string | undefined,
    plain: (last: DmLastMessage) => string,
    words: PreviewWords
): string {
    if (!last) return ''
    if (last.type === 'system') return words.call
    const said = plain(last).replace(/\s+/g, ' ').trim()
    const { count, images } = last.files
    const text = said || (count === 0 ? '' : count === images ? words.image : words.file)
    return last.authorId !== null && last.authorId === me ? words.mine(text) : text
}

/**
 * The rows in the order held while the pointer is over the column (Q5): a
 * DM with a new message does not jump under the pointer; one closed goes,
 * one new comes last. The column orders them again once the pointer leaves.
 */
export function heldDms(heldIds: readonly string[], rows: readonly Dm[]): Dm[] {
    const place = new Map(heldIds.map((id, index) => [id, index]))
    const known = rows.filter((dm) => place.has(dm.id)).sort((a, b) => place.get(a.id)! - place.get(b.id)!)
    return [...known, ...rows.filter((dm) => !place.has(dm.id))]
}
