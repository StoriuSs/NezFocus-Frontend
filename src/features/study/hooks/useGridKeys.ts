import { useRef, useState, type KeyboardEvent } from 'react'

const STEPS: Record<string, (columns: number) => number> = {
    ArrowRight: () => 1,
    ArrowLeft: () => -1,
    ArrowDown: (columns) => columns,
    ArrowUp: (columns) => -columns
}

/**
 * A grid of days with one Tab stop (C-46, `role="grid"`): the arrows move
 * within it, a row being `columns` cells; cells that cannot take focus (days
 * ahead, days outside the month) are stepped over. `focusable` says which
 * can; the stop starts on `start` (today, or the first that can).
 */
export function useGridKeys(focusable: boolean[], columns: number, start: number) {
    const first = focusable[start] ? start : focusable.indexOf(true)
    const [active, setActive] = useState(first)
    const cells = useRef<(HTMLElement | null)[]>([])
    const current = focusable[active] ? active : first

    const onKeyDown = (event: KeyboardEvent, index: number) => {
        const step = STEPS[event.key]?.(columns)
        if (step === undefined) return
        event.preventDefault()
        let next = index + step
        while (next >= 0 && next < focusable.length && !focusable[next]) next += step
        if (next < 0 || next >= focusable.length) return
        setActive(next)
        cells.current[next]?.focus()
    }

    return {
        /** The props of cell `index`: its ref, Tab stop, keys and focus. */
        cellProps: (index: number) => ({
            ref: (element: HTMLElement | null) => {
                cells.current[index] = element
            },
            tabIndex: focusable[index] ? (index === current ? 0 : -1) : undefined,
            onKeyDown: focusable[index] ? (event: KeyboardEvent) => onKeyDown(event, index) : undefined,
            onFocus: focusable[index] ? () => setActive(index) : undefined
        })
    }
}
