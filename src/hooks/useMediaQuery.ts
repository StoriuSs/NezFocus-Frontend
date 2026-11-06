import { useSyncExternalStore } from 'react'

/**
 * Whether `query` matches now, kept up to date as the window changes. For the
 * few places where the width changes behaviour, not only looks: the right
 * panel is a column from 1280 up and a sheet over the content below that
 * (DESIGN.md › Layout). Layout alone stays in CSS breakpoints.
 */
export function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const list = window.matchMedia(query)
            list.addEventListener('change', onChange)
            return () => list.removeEventListener('change', onChange)
        },
        () => window.matchMedia(query).matches,
        () => false
    )
}

/** DESIGN.md › Layout: the right panel docks as a column from here up. */
export const PANEL_DOCKS = '(min-width: 1280px)'
