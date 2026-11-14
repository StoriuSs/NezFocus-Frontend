import type {
    BareMessage,
    CachedPage,
    ChannelMessages,
    Message,
    MessagePage,
    OutgoingMessage,
    OutgoingState,
    Reaction,
    RepliedMessage
} from '../types'

/*
 * Changes to a channel's history in the cache (ARCHITECTURE 10.2), as pure
 * functions: the hooks call them inside setQueryData. A message not saved yet
 * sits on the last page, after the saved ones, until the saved copy comes
 * back (the send's answer or `message.created`, whichever first) with its
 * nonce. Ids are UUIDv7, so comparing them compares times.
 */

const changeLast = (data: ChannelMessages, change: (page: CachedPage) => CachedPage): ChannelMessages => ({
    ...data,
    pages: data.pages.map((page, index) => (index === data.pages.length - 1 ? change(page) : page))
})

const withoutNonce = (page: CachedPage, nonce: string | undefined): CachedPage =>
    nonce && page.outgoing?.some((item) => item.nonce === nonce)
        ? { ...page, outgoing: page.outgoing.filter((item) => item.nonce !== nonce) }
        : page

/** A message typed here goes on its way. */
export function addOutgoing(data: ChannelMessages, message: OutgoingMessage): ChannelMessages {
    return changeLast(data, (page) => ({ ...page, outgoing: [...(page.outgoing ?? []), message] }))
}

/** Where one message on its way is now. */
export function setOutgoingState(
    data: ChannelMessages,
    nonce: string,
    state: OutgoingState,
    retryAt?: number
): ChannelMessages {
    return changeLast(data, (page) => ({
        ...page,
        outgoing: page.outgoing?.map((item) => (item.nonce === nonce ? { ...item, state, retryAt } : item))
    }))
}

/** "Discard": a message that failed leaves the list. */
export function dropOutgoing(data: ChannelMessages, nonce: string): ChannelMessages {
    return changeLast(data, (page) => withoutNonce(page, nonce))
}

/**
 * A saved message: the answer to a send, or `message.created`. Taken in once,
 * however many times it comes, in its place by id; the copy on its way with
 * the same nonce leaves. A history that stops short of the newest messages
 * (opened around a link) gets no new message at its end: that would hide the
 * ones in between.
 */
export function addSaved(data: ChannelMessages, bare: BareMessage, nonce?: string): ChannelMessages {
    const known = data.pages.some((page) => page.items.some((item) => item.id === bare.id))
    // Nobody has reacted to a message just saved.
    const message: Message = { ...bare, reactions: [] }
    return changeLast(data, (page) => {
        const left = withoutNonce(page, nonce)
        if (known || page.hasMoreAfter) return left
        const at = left.items.findIndex((item) => item.id > message.id)
        const items =
            at === -1 ? [...left.items, message] : [...left.items.slice(0, at), message, ...left.items.slice(at)]
        return { ...left, items }
    })
}

/** The newest saved message: catching up starts after it. */
export function lastSavedId(data: ChannelMessages): string | undefined {
    for (const page of [...data.pages].reverse()) {
        const newest = page.items.at(-1)
        if (newest) return newest.id
    }
    return undefined
}

/**
 * What was missed while the socket was down (`after` = the newest saved one),
 * added once each, in id order: a message heard on the socket while this
 * was read is newer, and stays after them.
 */
export function addNewer(data: ChannelMessages, missed: MessagePage): ChannelMessages {
    const known = new Set(data.pages.flatMap((page) => page.items.map((item) => item.id)))
    return changeLast(data, (page) => ({
        ...page,
        items: [...page.items, ...missed.items.filter((item) => !known.has(item.id))].sort((a, b) =>
            a.id < b.id ? -1 : a.id > b.id ? 1 : 0
        ),
        hasMoreAfter: missed.hasMoreAfter
    }))
}

/** Too much missed to fill in: the newest page alone, older ones read again on scrolling up. */
export function startOver(data: ChannelMessages, latest: MessagePage): ChannelMessages {
    const outgoing = data.pages.at(-1)?.outgoing
    return { pages: [{ ...latest, ...(outgoing?.length ? { outgoing } : {}) }], pageParams: [null] }
}

/**
 * A link opened at message `id` that the history does not hold (D-48): the
 * history becomes the page around it, older pages read on scrolling up and
 * newer ones on scrolling down (it stops short of the newest). The messages
 * on their way stay, after it.
 */
export function openAround(data: ChannelMessages | undefined, around: MessagePage, id: string): ChannelMessages {
    const outgoing = data?.pages.at(-1)?.outgoing
    return { pages: [{ ...around, ...(outgoing?.length ? { outgoing } : {}) }], pageParams: [{ around: id }] }
}

/** Whether the history stops before the newest messages (opened at an older one): newer ones are read on scrolling down. */
export const stopsShort = (data: ChannelMessages): boolean => !!data.pages.at(-1)?.hasMoreAfter

/**
 * Whether message `id` was deleted, read from the history: missing where the
 * history holds every message (between its oldest and newest, or past them
 * where nothing more is left to read). One outside what it holds is elsewhere
 * in the channel (the history moved to a link, or back to the newest), not
 * gone. Pages are one unbroken run of messages, so this holds for them all.
 */
export function isGoneFrom(data: ChannelMessages, id: string): boolean {
    const items = data.pages.flatMap((page) => page.items)
    if (items.some((item) => item.id === id)) return false
    const oldest = items[0]?.id
    const newest = items.at(-1)?.id
    const fromStart = !data.pages[0]?.hasMoreBefore
    const toEnd = !data.pages.at(-1)?.hasMoreAfter
    return (fromStart || (oldest !== undefined && id >= oldest)) && (toEnd || (newest !== undefined && id <= newest))
}

/** A message quoted in a reply line, as it now is; null when no line quotes it. */
type Quote = (replyTo: RepliedMessage) => RepliedMessage

/**
 * Every page with `change` applied to its saved messages and to the reply
 * lines quoting message `id`, saved or on their way. The same object back
 * when nothing changed, so a list not holding them does not draw again.
 */
function changeEverywhere(
    data: ChannelMessages,
    id: string,
    items: (items: Message[]) => Message[],
    quote: Quote
): ChannelMessages {
    let changed = false
    const requote = <T extends { replyTo?: RepliedMessage | null }>(message: T): T => {
        if (message.replyTo?.id !== id) return message
        const replyTo = quote(message.replyTo)
        if (replyTo === message.replyTo) return message
        changed = true
        return { ...message, replyTo }
    }
    const pages = data.pages.map((page) => {
        const kept = items(page.items)
        if (kept !== page.items) changed = true
        return {
            ...page,
            items: kept.map(requote),
            ...(page.outgoing ? { outgoing: page.outgoing.map(requote) } : {})
        }
    })
    return changed ? { ...data, pages } : data
}

/** Whether `edit` is older than what is held: events of two edits may cross. */
export const olderThan = (edit: { editedAt: string | null }, held: { editedAt: string | null }) =>
    !!held.editedAt && (!edit.editedAt || edit.editedAt < held.editedAt)

/**
 * `message.updated`, or the answer to one's own edit: the message in its
 * place, and the reply lines quoting it (they show its text as it now is).
 * Its reactions and its pin stay as held: an edit does not carry the first
 * and does not change the second, which only their own events change.
 * An edit older than the one held is late and changes nothing; neither does
 * one of a message already deleted here (`message.deleted` came first), so a
 * reply line that says "deleted" stays so.
 */
export function replaceSaved(data: ChannelMessages, message: BareMessage): ChannelMessages {
    const held = data.pages.flatMap((page) => page.items).find((item) => item.id === message.id)
    if (held && olderThan(message, held)) return data
    return changeEverywhere(
        data,
        message.id,
        (items) =>
            held
                ? items.map((item) =>
                      item.id === message.id ? { ...message, reactions: held.reactions, pinned: held.pinned } : item
                  )
                : items,
        // The reply lines too, with the mentions' names as they now are (D-171).
        (replyTo) =>
            replyTo.deleted
                ? replyTo
                : {
                      ...replyTo,
                      author: message.author,
                      content: message.content,
                      mentionUsers: message.mentionUsers,
                      mentionRoles: message.mentionRoles,
                      deleted: false
                  }
    )
}

/**
 * `message.deleted`, or one's own delete: the message leaves the list (the
 * history no longer shows it), and the reply lines quoting it say "the
 * original message was deleted" (REQ-MSG-05).
 */
export function removeSaved(data: ChannelMessages, id: string): ChannelMessages {
    return changeEverywhere(
        data,
        id,
        (items) => (items.some((item) => item.id === id) ? items.filter((item) => item.id !== id) : items),
        () => ({ id, author: null, content: '', deleted: true, mentionUsers: [], mentionRoles: [] })
    )
}

/**
 * Message `id` changed by `change`, the same object back when it gives the
 * same message back or the history does not hold it, so nothing draws again.
 */
function changeMessage(data: ChannelMessages, id: string, change: (message: Message) => Message): ChannelMessages {
    let changed = false
    const pages = data.pages.map((page) => {
        if (!page.items.some((item) => item.id === id)) return page
        const items = page.items.map((item) => {
            if (item.id !== id) return item
            const next = change(item)
            if (next !== item) changed = true
            return next
        })
        return { ...page, items }
    })
    return changed ? { ...data, pages } : data
}

/**
 * One more person gave `emoji` (`reaction.added`, or one's own click before
 * the answer): a new emoji goes at the end of the row, as the server orders
 * them. `mine` when that person is the one reading. One's own emoji given
 * already changes nothing: one's click shows at once, and its event coming
 * back is not counted twice; a page read meanwhile that dropped the click
 * is set right by that event.
 */
export function addReaction(data: ChannelMessages, messageId: string, emoji: string, mine: boolean): ChannelMessages {
    return changeMessage(data, messageId, (message) => {
        const chip = message.reactions.find((item) => item.emoji === emoji)
        if (!chip) return { ...message, reactions: [...message.reactions, { emoji, count: 1, me: mine }] }
        if (mine && chip.me) return message
        const more: Reaction = { emoji, count: chip.count + 1, me: chip.me || mine }
        return { ...message, reactions: message.reactions.map((item) => (item === chip ? more : item)) }
    })
}

/**
 * One person took `emoji` back (`reaction.removed`, or one's own click): the
 * chip goes once nobody is left on it. One's own emoji not given changes
 * nothing, as for `addReaction`.
 */
export function removeReaction(
    data: ChannelMessages,
    messageId: string,
    emoji: string,
    mine: boolean
): ChannelMessages {
    return changeMessage(data, messageId, (message) => {
        const chip = message.reactions.find((item) => item.emoji === emoji)
        if (!chip || (mine && !chip.me)) return message
        const reactions =
            chip.count <= 1
                ? message.reactions.filter((item) => item !== chip)
                : message.reactions.map((item) =>
                      item === chip ? { emoji, count: chip.count - 1, me: mine ? false : chip.me } : item
                  )
        return { ...message, reactions }
    })
}

/** `pins.updated`, or one's own pin or unpin: whether the message is in the channel's pins (REQ-MSG-07). */
export function setPinned(data: ChannelMessages, messageId: string, pinned: boolean): ChannelMessages {
    return changeMessage(data, messageId, (message) => (message.pinned === pinned ? message : { ...message, pinned }))
}
