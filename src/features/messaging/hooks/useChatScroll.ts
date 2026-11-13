import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { ChatRow } from '../lib/chat-rows'
import { isOutgoing } from '../types'

/** Within this many pixels of the end, the list counts as at the bottom. */
const AT_BOTTOM_PX = 48
/** Within this many pixels of the top, older messages are read. */
const LOAD_OLDER_PX = 300

/** The oldest message's key: a date line above it stays the same when older messages of its day arrive. */
const firstMessageKey = (rows: ChatRow[]) => rows.find((row) => row.kind === 'message')?.key

/** The ids of saved messages newer than `id`, others' or one's own, not the ones still on their way. */
const savedAfter = (rows: ChatRow[], id: string) =>
    rows.filter((row) => row.kind === 'message' && !isOutgoing(row.message) && row.message.id > id).length

/** The newest saved message's id: messages on their way are always drawn after it. */
function newestSavedId(rows: ChatRow[]): string | undefined {
    for (let index = rows.length - 1; index >= 0; index--) {
        const row = rows[index]
        if (row?.kind === 'message' && !isOutgoing(row.message)) return row.message.id
    }
    return undefined
}

/**
 * How the message list scrolls (C-10 › Cuộn):
 * - at the bottom, a new message scrolls into view, and the list keeps its
 *   bottom when it gets shorter (the composer grows);
 * - reading older messages, the list stays still and counts what others
 *   saved meanwhile ("3 new" ↓);
 * - one's own new message always goes to the bottom;
 * - near the top, older messages are read; the message being read stays
 *   where it was as they (and their skeletons) appear above it.
 */
export function useChatScroll(rows: ChatRow[], older: { has: boolean; loading: boolean; load: () => void }) {
    const list = useRef<HTMLDivElement>(null)
    const atBottom = useRef(true)
    const before = useRef<{ first?: string; last?: string; loading: boolean; height: number } | null>(null)
    const [away, setAway] = useState(false)
    // The newest saved message when the list left the bottom: what is newer came meanwhile.
    const [seen, setSeen] = useState<string>()
    const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

    const first = firstMessageKey(rows)
    const lastRow = rows.at(-1)
    const last = lastRow?.key
    const newest = newestSavedId(rows)

    useLayoutEffect(() => {
        const element = list.current
        if (!element) return
        const previous = before.current
        const mine = !!previous && last !== previous.last && lastRow?.kind === 'message' && isOutgoing(lastRow.message)
        const aboveChanged = !!previous && (first !== previous.first || older.loading !== previous.loading)
        if (previous && !atBottom.current && !mine && aboveChanged && last === previous.last) {
            element.scrollTop += element.scrollHeight - previous.height
        } else if (!previous || atBottom.current || mine) {
            element.scrollTop = element.scrollHeight
            atBottom.current = true
            setAway(false)
            setSeen(undefined)
        }
        before.current = { first, last, loading: older.loading, height: element.scrollHeight }
    }, [rows, first, last, lastRow, older.loading])

    // The list got shorter or taller (the composer grew, the window changed): at the bottom, stay there.
    useEffect(() => {
        const element = list.current
        if (!element || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(() => {
            if (atBottom.current) element.scrollTop = element.scrollHeight
        })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    const onScroll = useCallback(() => {
        const element = list.current
        if (!element) return
        const bottom = element.scrollHeight - element.scrollTop - element.clientHeight < AT_BOTTOM_PX
        atBottom.current = bottom
        setAway(!bottom)
        setSeen((current) => (bottom ? undefined : (current ?? newest)))
        if (element.scrollTop < LOAD_OLDER_PX && older.has && !older.loading) older.load()
    }, [newest, older])

    const newCount = away && seen ? savedAfter(rows, seen) : 0

    const toBottom = useCallback(() => {
        const element = list.current
        element?.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? 'auto' : 'smooth' })
    }, [reduceMotion])

    return { list, onScroll, away, newCount, toBottom }
}
