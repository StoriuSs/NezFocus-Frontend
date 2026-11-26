import { useState, type KeyboardEvent } from 'react'

/** How the keyboard goes through the seats: which one holds the Tab stop, and its ← →. */
export interface SeatFocus {
    tabbable: (userId: string) => boolean
    onKeyDown: (userId: string) => (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * The seats are one keyboard stop (07 › Tương tác: "ghế (một nhóm, ← → đi
 * giữa ghế)"): the seat last moved to holds it, the first while none was or
 * once its person left; ← → move along `ids`, the order shown (clockwise
 * from 12 o'clock around a ring). Each seat is found by its `data-seat`.
 */
export function useSeatFocus(ids: readonly string[]): SeatFocus {
    const [current, setCurrent] = useState<string | null>(null)
    const held = current !== null && ids.includes(current) ? current : ids[0]
    return {
        tabbable: (userId) => userId === held,
        onKeyDown: (userId) => (event) => {
            const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
            const next = ids[ids.indexOf(userId) + step]
            if (!step || next === undefined) return
            event.preventDefault()
            setCurrent(next)
            event.currentTarget.ownerDocument
                .querySelector<HTMLElement>(`[data-seat="${CSS.escape(next)}"] button`)
                ?.focus()
        }
    }
}
