import type { CachedPage, ChannelMessages, Message, MessagePage, OutgoingMessage, OutgoingState } from '../types'

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
export function addSaved(data: ChannelMessages, message: Message, nonce?: string): ChannelMessages {
    const known = data.pages.some((page) => page.items.some((item) => item.id === message.id))
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
