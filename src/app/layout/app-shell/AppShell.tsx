import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageLoader } from '@/components/PageLoader'
// Straight from its file, not the users index: the index is in the first download
// (the auth store imports it), and whatever it exports goes there too.
import { useAccountSettings } from '@/features/users/hooks/useAccountSettings'
import { cn } from '@/lib/utils'
import { ListColumn } from './ListColumn'
import { Rail } from './Rail'
import {
    SHELL_LIST_ID,
    SHELL_NAV_BUTTON_ID,
    SHELL_RAIL_ID,
    ShellContext,
    type ShellContextValue
} from '@/components/shell/shell-context'

/**
 * The frame of every page after sign-in (02 S-SHELL-01): rail 72, list
 * column 240, the content area, and the right panel a page may add.
 *
 * Widths (DESIGN.md › Layout):
 * - from 1024 everything is in place;
 * - 768–1023: the list column is a sheet from the left, opened by ☰;
 * - below 768: the rail joins it in that sheet, the content is one column.
 * The sheet lies over the content with a shadow and no scrim; a click
 * outside, Esc, or opening a page closes it, and Esc gives focus back to ☰.
 *
 * Tab order follows reading order: rail → list → content → right panel.
 */
export default function AppShell() {
    const { pathname } = useLocation()
    const { reset: resetQueryErrors } = useQueryErrorResetBoundary()
    const [navOpen, setNavOpen] = useState(false)
    // The account's theme and language, here and in this browser's other tabs (REQ-AUTH-08).
    useAccountSettings()

    const toggleNav = useCallback(() => setNavOpen((open) => !open), [])
    const shell = useMemo<ShellContextValue>(() => ({ navOpen, toggleNav }), [navOpen, toggleNav])

    // Opening a page closes the sheet (state adjusted while rendering, not in an effect).
    const [openedAt, setOpenedAt] = useState(pathname)
    if (openedAt !== pathname) {
        setOpenedAt(pathname)
        setNavOpen(false)
    }

    useEffect(() => {
        if (!navOpen) return
        // Into the sheet, as a dialog would: its first link.
        document
            .getElementById(SHELL_LIST_ID)
            ?.querySelector<HTMLElement>('a[href], button:not([aria-disabled="true"])')
            ?.focus()
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            setNavOpen(false)
            document.getElementById(SHELL_NAV_BUTTON_ID)?.focus()
        }
        // A click outside the sheet (rail and list) closes it; ☰ toggles it itself.
        const onPointer = (event: PointerEvent) => {
            const target = event.target as Element
            if (target.closest(`#${SHELL_LIST_ID}, #${SHELL_RAIL_ID}`) || target.closest(`#${SHELL_NAV_BUTTON_ID}`))
                return
            setNavOpen(false)
        }
        document.addEventListener('keydown', onKey)
        document.addEventListener('pointerdown', onPointer)
        return () => {
            document.removeEventListener('keydown', onKey)
            document.removeEventListener('pointerdown', onPointer)
        }
    }, [navOpen])

    return (
        <ShellContext.Provider value={shell}>
            <div className='flex h-dvh overflow-hidden bg-bg'>
                <Rail
                    id={SHELL_RAIL_ID}
                    className={cn(
                        'hidden md:flex',
                        navOpen && 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:flex'
                    )}
                />
                <ListColumn
                    id={SHELL_LIST_ID}
                    className={cn(
                        'hidden lg:flex',
                        navOpen &&
                            'max-lg:fixed max-lg:inset-y-0 max-lg:left-[72px] max-lg:z-40 max-lg:flex max-lg:shadow-sheet-left'
                    )}
                />
                <main className='flex min-w-0 flex-1'>
                    <ErrorBoundary key={pathname} onReset={resetQueryErrors}>
                        <Suspense fallback={<PageLoader className='min-h-0 flex-1' />}>
                            <Outlet />
                        </Suspense>
                    </ErrorBoundary>
                </main>
            </div>
        </ShellContext.Provider>
    )
}
