import { useState, type KeyboardEvent, type MouseEvent } from 'react'

/** Where a moderator's menu hangs: at the pointer after a right click (inside its list item), else under ⋯ (null). */
export type MenuPoint = { x: number; y: number } | null

export interface RoomMenu {
    open: boolean
    at: MenuPoint
    setOpen: (open: boolean) => void
    /** Opens it at `at` (null: under ⋯). */
    show: (at: MenuPoint) => void
    /** A right click on the person: the menu where the pointer is, as a message's or a task's (C-12). */
    onContextMenu: (event: MouseEvent<HTMLElement>) => void
    /** Shift+F10 or the Menu key on the person: under ⋯. True when it opened. */
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => boolean
}

/**
 * The state of a moderator's menu on someone in a room (D-208), shared by
 * the person (a tile, a row: right click, Shift+F10) and the menu itself
 * (`ModeratorMenu`). `usable` false (no item for this person): nothing opens,
 * and a right click leaves the browser's own menu.
 */
export function useRoomMenu(usable: boolean): RoomMenu {
    const [open, setOpen] = useState(false)
    const [at, setAt] = useState<MenuPoint>(null)
    const show = (point: MenuPoint) => {
        setAt(point)
        setOpen(true)
    }
    return {
        open: open && usable,
        at,
        setOpen,
        show,
        onContextMenu: (event) => {
            // A right click in a popover the row opened (portalled, a profile's) is the browser's.
            if (!usable || !event.currentTarget.contains(event.target as Node)) return
            event.preventDefault()
            const box = (event.currentTarget.closest('li') ?? event.currentTarget).getBoundingClientRect()
            show({ x: event.clientX - box.left, y: event.clientY - box.top })
        },
        onKeyDown: (event) => {
            if (!usable || !(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return false
            event.preventDefault()
            show(null)
            return true
        }
    }
}
