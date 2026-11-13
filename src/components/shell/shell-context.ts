import { createContext } from 'react'

/** The connection Banner a page shows under its Header (C-16, S-SHELL-01). */
export type ConnectionNotice = 'reconnecting' | 'offline'

/**
 * What a page inside the AppShell needs from it: the ☰ button of its header
 * opens the navigation (the list column below 1024; the rail too below 768).
 * Its body starts with the connection Banner when there is one (C-16).
 */
export interface ShellContextValue {
    navOpen: boolean
    toggleNav: () => void
    /** The socket lost for 3 s, or no network (S-SHELL-01); null: none. */
    connection: ConnectionNotice | null
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
    column: 'study' | 'server' | 'settings' | 'serverSettings'
}
