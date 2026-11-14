import { useEffect, useMemo, type RefObject } from 'react'
import type { ChatRow } from '../lib/chat-rows'
import { isOutgoing } from '../types'
import { canSeePage } from './useCanSee'

/**
 * The newest saved message in view: the last one whose bottom edge is inside
 * the list's visible part. One taller than the list counts once its end is
 * in view; none when every message is above it. The rows are in order, top
 * to bottom: the last one ending above the list's bottom is found by halves,
 * a few measures however long the history.
 */
function newestInView(list: HTMLElement, saved: Map<string, string>): string | undefined {
    const box = list.getBoundingClientRect()
    const elements = list.querySelectorAll<HTMLElement>('[data-row-key]')
    let low = 0
    let high = elements.length - 1
    let found = -1
    while (low <= high) {
        const middle = (low + high) >> 1
        if (elements[middle]!.getBoundingClientRect().bottom <= box.bottom + 1) {
            found = middle
            low = middle + 1
        } else high = middle - 1
    }
    for (let index = found; index >= 0; index--) {
        const element = elements[index]!
        const id = saved.get(element.dataset.rowKey ?? '')
        if (id) return element.getBoundingClientRect().bottom >= box.top ? id : undefined
    }
    return undefined
}

/**
 * Tell which message the reader has seen (D-46): the newest one in view,
 * each time the list scrolls (once a frame), its messages change, or the
 * reader comes back. `onSeen` is left out while they cannot see the page, or
 * nothing in the list is unread, and nothing is measured then.
 */
export function useSeenMessages(
    list: RefObject<HTMLDivElement | null>,
    rows: ChatRow[],
    onSeen: ((messageId: string) => void) | undefined
): void {
    // Row key → message id, for the saved messages only (one on its way is no one's to read).
    const saved = useMemo(
        () =>
            new Map(
                rows.flatMap((row) =>
                    row.kind === 'message' && !isOutgoing(row.message) ? [[row.key, row.message.id] as const] : []
                )
            ),
        [rows]
    )
    useEffect(() => {
        const element = list.current
        if (!element || !onSeen) return
        let frame = 0
        const check = () => {
            frame = 0
            // A list scrolled by the wheel in a window without focus shows, but is not read (D-46).
            if (!canSeePage()) return
            const seen = newestInView(element, saved)
            if (seen) onSeen(seen)
        }
        const onScroll = () => {
            if (!frame) frame = requestAnimationFrame(check)
        }
        check()
        element.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            element.removeEventListener('scroll', onScroll)
            cancelAnimationFrame(frame)
        }
    }, [list, saved, onSeen])
}
