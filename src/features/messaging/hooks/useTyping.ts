import { useCallback, useEffect, useRef, useState } from 'react'
import { onRealtimeEvent, sendRealtimeSignal } from '@/features/realtime'

/** How long someone shows as typing after they last said so (REQ-MSG-06). */
export const TYPING_SHOWN_MS = 10_000
/** How often a tab says it is typing at most (REQ-MSG-06); the API holds it to the same. */
export const TYPING_EVERY_MS = 8_000

interface Typist {
    id: string
    name: string
    until: number
}

type Person = { id: string; username: string | null; displayName: string | null }

/**
 * The names of those typing in the channel now (REQ-MSG-06), the first to
 * start first: each shows for 10 seconds after their last `typing.started`,
 * and goes as soon as their message comes. Never the reader.
 */
export function useTyping(channelId: string, me: string | undefined): string[] {
    const [typists, setTypists] = useState<Typist[]>([])

    useEffect(() => {
        setTypists([])
        const stops = [
            onRealtimeEvent('typing.started', (data) => {
                const { channelId: where, user } = data as { channelId: string; user: Person }
                if (where !== channelId || user.id === me) return
                const typist = {
                    id: user.id,
                    name: user.displayName ?? user.username ?? '',
                    until: Date.now() + TYPING_SHOWN_MS
                }
                setTypists((now) =>
                    now.some((one) => one.id === user.id)
                        ? now.map((one) => (one.id === user.id ? typist : one))
                        : [...now, typist]
                )
            }),
            onRealtimeEvent('message.created', (data) => {
                const { message } = data as { message: { channelId: string; author: Person | null } }
                if (message.channelId !== channelId || !message.author) return
                const author = message.author.id
                setTypists((now) =>
                    now.some((one) => one.id === author) ? now.filter((one) => one.id !== author) : now
                )
            })
        ]
        return () => stops.forEach((stop) => stop())
    }, [channelId, me])

    // One timer, for the first to stop showing.
    useEffect(() => {
        if (typists.length === 0) return
        const next = Math.min(...typists.map((one) => one.until))
        const timer = setTimeout(
            () => setTypists((now) => now.filter((one) => one.until > Date.now())),
            Math.max(0, next - Date.now())
        )
        return () => clearTimeout(timer)
    }, [typists])

    return typists.map((one) => one.name)
}

/**
 * Tell the channel one is typing (REQ-MSG-06): given the box's text each
 * time it changes, says so over the socket at most once in 8 seconds while
 * it holds more than spaces. Emptied (sent, or cleared), the next keystroke
 * says it at once (the API takes twice in 8 seconds for that). Nothing while
 * invisible.
 */
export function useReportTyping(channelId: string, invisible = false): (text: string) => void {
    const told = useRef(0)
    return useCallback(
        (text: string) => {
            // Typing would show someone invisible is there (D-176).
            if (invisible) return
            if (!text.trim()) {
                told.current = 0
                return
            }
            const now = Date.now()
            if (now - told.current < TYPING_EVERY_MS) return
            told.current = now
            sendRealtimeSignal('typing.start', { channelId })
        },
        [channelId, invisible]
    )
}
