import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/api-error'
import { useAckChannel } from '../api/useAckChannel'
import { stopsShort } from '../lib/message-cache'
import { firstFrom, firstUnread, newestSaved, reachesBackTo, unreadAfter, unreadFrom } from '../lib/unread-marker'
import type { ChannelMessages, ChatMessage, ReadState } from '../types'

/** Where "New" is: the first unread message, how many it stood for when placed, and its time. */
interface Divider {
    messageId: string
    unread: number
    at: string
}

/**
 * Unread messages in the open channel (REQ-MSG-09, D-46, C-10):
 *
 * - On opening, the mark as it then was places "New" at the first unread
 *   message, and the list opens there (unless a link opened it); a history
 *   that does not reach back to the mark, or stops short of it (left at an
 *   older message), reads the page around it first. Nothing is marked read
 *   before that is done.
 * - Later, with no "New" yet, a message that comes while the reader cannot
 *   see the page gets it (a tab left in the background, 02 › Edge cases),
 *   when the history still reaches back to the mark (not started over).
 * - Its message deleted, "New" stands above the next one (MessageList).
 * - "New" stays until the channel is left (this hook lives as long as the
 *   chat of one channel); the new messages bar shows while the channel still
 *   has unread messages: how many came from "New" on (at least as many as
 *   were unread when it was placed, the backend's count stopping at 100),
 *   and since when.
 * - `seen`: the newest message in view, read once the reader can see it
 *   (the list tells it then only); up to the newest the history holds, the
 *   channel is all read. `markAllRead`: up to the channel's newest.
 */
export function useUnreadMarker({
    channelId,
    state,
    history,
    messages,
    me,
    canSee,
    linked,
    jump
}: {
    channelId: string
    state: ReadState | undefined
    history: ChannelMessages | undefined
    messages: readonly ChatMessage[]
    me: string | undefined
    canSee: boolean
    /** Opened at a message link: the list goes there, not to "New". */
    linked: boolean
    jump: { showFirstUnread: (messageId: string) => void; openAt: (id: string) => Promise<void> }
}) {
    const ack = useAckChannel(channelId)
    const { showFirstUnread, openAt } = jump
    // How far the reader had read on opening: the first state known.
    const [opening, setOpening] = useState(state)
    useEffect(() => {
        if (!opening && state) setOpening(state)
    }, [opening, state])

    const [divider, setDivider] = useState<Divider | null>(null)
    /** The opening's unread messages have their place (or there were none). */
    const [placed, setPlaced] = useState(false)
    const readAround = useRef(false)

    useEffect(() => {
        if (placed || !opening || !history) return
        if (opening.unreadCount === 0) return setPlaced(true)
        const reaches = reachesBackTo(history, opening.lastReadId)
        const first = reaches ? firstUnread(messages, opening.lastReadId, me) : undefined
        if (first) {
            setDivider({ messageId: first.id, unread: opening.unreadCount, at: first.createdAt })
            if (!linked) showFirstUnread(first.id)
        }
        if (first || linked || readAround.current || (reaches && !stopsShort(history))) return setPlaced(true)
        readAround.current = true
        openAt(opening.lastReadId).catch(() => setPlaced(true))
    }, [placed, opening, history, messages, me, linked, showFirstUnread, openAt])

    // Come while the reader could not see the page: "New" there.
    useEffect(() => {
        if (!placed || divider || canSee || !state || !history || !reachesBackTo(history, state.lastReadId)) return
        const first = firstUnread(messages, state.lastReadId, me)
        if (first) setDivider({ messageId: first.id, unread: 0, at: first.createdAt })
    }, [placed, divider, canSee, state, history, messages, me])

    const newest = newestSaved(messages)?.id
    const toNewest = !!history && !stopsShort(history)
    const seen = useCallback(
        (messageId: string) => {
            if (placed) ack(messageId, { all: toNewest && messageId === newest })
        },
        [placed, ack, toNewest, newest]
    )

    const markAllRead = useCallback(() => {
        if (state) ack(newest ?? state.lastReadId, { all: true, newest: true })
    }, [ack, newest, state])

    // Back to "New" from the bar: the message under it, read around it first when no longer held.
    const [goingBack, setGoingBack] = useState(false)
    const toDivider = useCallback(async () => {
        if (!divider) return
        const under = firstFrom(messages, divider.messageId)
        if (under) return showFirstUnread(under.id)
        setGoingBack(true)
        try {
            await openAt(divider.messageId)
        } catch (error) {
            setGoingBack(false)
            toast.error(getApiErrorMessage(error))
        }
    }, [divider, messages, openAt, showFirstUnread])
    useEffect(() => {
        const under = goingBack && divider ? firstFrom(messages, divider.messageId) : undefined
        if (!under) return
        setGoingBack(false)
        showFirstUnread(under.id)
    }, [goingBack, divider, messages, showFirstUnread])

    const bar =
        divider && state && state.unreadCount > 0
            ? { count: Math.max(divider.unread, unreadFrom(messages, divider.messageId, me)), since: divider.at }
            : null

    /** Messages from others after the mark the list holds: none, and nothing in it is left to read. */
    const unreadHeld = state ? unreadAfter(messages, state.lastReadId, me) : 0

    return { dividerAt: divider?.messageId, bar, unreadHeld, seen, markAllRead, toDivider }
}
