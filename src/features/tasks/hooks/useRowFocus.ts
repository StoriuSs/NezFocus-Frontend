import { useCallback, useEffect, useLayoutEffect, useRef, type FocusEvent, type RefObject } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * The keyboard focus of a list of task rows (`data-task-row`), kept as the
 * rows move (S-TASK-01 › Tương tác, S-TASK-04): the row with the focus keeps
 * it when it moves to another group (drawn again in another list, it would
 * lose it to the page), and the next one takes it when it goes. The detail
 * opened from a row and closed after its task went (deleted meanwhile, 05
 * Q11) gives it to the next row too, which Radix would give back to the row
 * gone.
 *
 * `order`: the ids of the rows shown, in order, joined by spaces; `placing`
 * changes when a row only moves to another group, which `order` may not.
 */
export function useRowFocus(list: RefObject<HTMLElement | null>, order: string, placing: string) {
    const focusedRow = useRef<string | null>(null)
    const shownOrder = useRef<string[]>([])

    const focusIn = (event: FocusEvent<HTMLElement>) => {
        const id = (event.target as HTMLElement).dataset.taskRow
        focusedRow.current = id ?? null
    }
    const focusOut = (event: FocusEvent<HTMLElement>) => {
        if (event.relatedTarget) {
            if (!list.current?.contains(event.relatedTarget as Node)) focusedRow.current = null
            return
        }
        // To nowhere: a click on the page, or the row taken out of it (kept then).
        const left = event.target
        setTimeout(() => {
            if (left.isConnected) focusedRow.current = null
        }, 0)
    }
    /** The focus to that row, or the first of those after it in `before` still shown, or the last. */
    const focusAfter = useCallback(
        (id: string, before: readonly string[]) => {
            const now = shownOrder.current
            const next = now.includes(id)
                ? id
                : (before.slice(before.indexOf(id) + 1).find((one) => now.includes(one)) ?? now.at(-1))
            if (!next) return
            list.current?.querySelector<HTMLElement>(`[data-task-row="${next}"]`)?.focus()
        },
        [list]
    )
    useLayoutEffect(() => {
        const before = shownOrder.current
        shownOrder.current = order ? order.split(' ') : []
        const id = focusedRow.current
        // Lost: on the page, or still on the row taken out (some browsers keep it there).
        const active = document.activeElement
        if (!id || (active && active !== document.body && active.isConnected)) return
        focusAfter(id, before)
        // `placing` changes when a row only moves to another group, `order` does not.
    }, [order, placing, focusAfter])

    const opened = useRef<{ id: string; order: readonly string[] } | null>(null)
    const openTask = useSearchParams()[0].get('task')
    useEffect(() => {
        const was = opened.current
        if (openTask !== null || !was) return
        opened.current = null
        if (shownOrder.current.includes(was.id)) return
        const timer = setTimeout(() => focusAfter(was.id, was.order), 0)
        return () => clearTimeout(timer)
    }, [openTask, focusAfter])

    return {
        focusIn,
        focusOut,
        focusAfter,
        /** The rows shown now, in order. */
        shown: () => shownOrder.current,
        /** A row's detail opens: remember where it was, for when it closes. */
        opening: (id: string) => {
            opened.current = { id, order: shownOrder.current }
        }
    }
}
