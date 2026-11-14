import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { reportError } from '@/lib/error-tracking'
import { keepState, markRead } from '../lib/read-state-cache'
import type { ReadState } from '../types'
import { messageKeys } from './keys'
import { ackChannel } from './readStates.api'

/** After a mark fails, none is sent for this long: a list that keeps telling what it sees does not retry at once, over and over. */
const PAUSE_AFTER_FAILURE_MS = 5000

interface Mark {
    messageId: string
    /** Nothing after it is unread: the newest message the chat holds. */
    all: boolean
    /** "Mark as read": no message sent, the backend takes the channel's newest. */
    newest?: boolean
}

/**
 * Marking a channel read (D-46, D-173): the mark moves here at once (and the
 * counts clear when it reached the newest message), the backend's counts
 * replace them when it answers. One mark is sent at a time; what is seen
 * meanwhile goes after it, only the newest of it ("send once for the newest
 * message seen"). A message at or before the mark sends nothing.
 *
 * A mark that fails goes back (unless another tab moved it on meanwhile) and
 * the list is read again, without a word: reading is no action of the
 * reader's; a message seen 5 seconds later tries again. A failure that is
 * no answer of the API is a bug, and is reported.
 */
export function useAckChannel(channelId: string) {
    const client = useQueryClient()
    const flying = useRef(false)
    const next = useRef<Mark | null>(null)
    /** The mark shown before the backend said so, and the state it replaced. */
    const shown = useRef<{ messageId: string; before: ReadState } | null>(null)
    const pausedUntil = useRef(0)

    // Sends the marks one after another, the newest waiting each time; stops when none is left.
    const sendAll = useCallback(async () => {
        const key = messageKeys.readStates()
        for (let mark = next.current; mark; mark = next.current) {
            next.current = null
            try {
                const state = await ackChannel(channelId, mark.newest ? null : mark.messageId)
                client.setQueryData<ReadState[]>(key, (states) => keepState(states, state))
                if (!next.current) shown.current = null
            } catch (error) {
                if (!axios.isAxiosError(error)) reportError(error)
                pausedUntil.current = Date.now() + PAUSE_AFTER_FAILURE_MS
                const back = shown.current
                client.setQueryData<ReadState[]>(key, (states) =>
                    states?.map((state) =>
                        back && state.channelId === channelId && state.lastReadId === back.messageId
                            ? back.before
                            : state
                    )
                )
                next.current = null
                shown.current = null
                void client.invalidateQueries({ queryKey: key })
            }
        }
        flying.current = false
    }, [client, channelId])

    return useCallback(
        (messageId: string, { all, newest = false }: { all: boolean; newest?: boolean }) => {
            const key = messageKeys.readStates()
            const held = client.getQueryData<ReadState[]>(key)?.find((state) => state.channelId === channelId)
            // "Mark as read" is the reader's own doing: never paused.
            if (!held || (!newest && Date.now() < pausedUntil.current)) return
            const forward = messageId > held.lastReadId
            if (!forward && !(newest && (held.unreadCount > 0 || held.mentionCount > 0))) return
            shown.current = { messageId: forward ? messageId : held.lastReadId, before: shown.current?.before ?? held }
            client.setQueryData<ReadState[]>(key, (states) =>
                forward
                    ? markRead(states, channelId, messageId, all)
                    : states?.map((state) =>
                          state.channelId === channelId ? { ...state, unreadCount: 0, mentionCount: 0 } : state
                      )
            )
            next.current = { messageId, all, newest: newest || next.current?.newest }
            if (flying.current) return
            flying.current = true
            void sendAll()
        },
        [client, channelId, sendAll]
    )
}
