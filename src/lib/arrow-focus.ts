import type { KeyboardEvent } from 'react'

/**
 * Up and down arrows from one stop of a list to the next (no wrap), the
 * stops being the elements `selector` finds inside `list`: the messages
 * column's rows (09 S-DM-01), the Friends page's rows (C-30). Called from the
 * stop's own `onKeyDown`, so lists keep no key handler of their own; other
 * keys, and a stop that is not in the list, do nothing.
 */
export function moveFocusInList(event: KeyboardEvent<HTMLElement>, list: Element | null, selector: string): void {
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || !list) return
    const stops = [...list.querySelectorAll<HTMLElement>(selector)]
    const at = stops.indexOf(event.currentTarget)
    if (at < 0) return
    event.preventDefault()
    stops[event.key === 'ArrowDown' ? Math.min(at + 1, stops.length - 1) : Math.max(at - 1, 0)]?.focus()
}
