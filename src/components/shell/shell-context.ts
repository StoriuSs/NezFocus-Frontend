import { createContext } from 'react'

/**
 * What a page inside the AppShell needs from it: the ☰ button of its header
 * opens the navigation (the list column below 1024; the rail too below 768).
 */
export interface ShellContextValue {
    navOpen: boolean
    toggleNav: () => void
}

/** Null outside the AppShell (a page rendered alone, as in its tests): no ☰ then. */
export const ShellContext = createContext<ShellContextValue | null>(null)

/** The id of the list column, for the ☰ button's aria-controls. */
export const SHELL_LIST_ID = 'shell-list'
/** The ☰ button, to give focus back to when the navigation closes. */
export const SHELL_NAV_BUTTON_ID = 'shell-nav-button'
export const SHELL_RAIL_ID = 'shell-rail'

/** What a route tells the AppShell, in its `handle`: which list column to show. */
export interface ShellHandle {
    column: 'study' | 'server' | 'settings'
}
