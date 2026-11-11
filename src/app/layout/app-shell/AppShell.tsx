import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageLoader } from '@/components/PageLoader'
// Straight from its file, not the users index: the index is in the first download
// (the auth store imports it), and whatever it exports goes there too.
import { useAccountSettings } from '@/features/users/hooks/useAccountSettings'
import { useCreateServerDialog } from '@/features/servers/create-server.store'
import { useChannelDialogs } from '@/features/servers/channel-dialogs.store'
import { useInviteDialogs } from '@/features/servers/invite-dialogs.store'
import { useMembershipDialogs } from '@/features/servers/membership-dialogs.store'
import { useServerGoneWatch } from '@/features/servers/hooks/useServerGoneWatch'
import { serverOwnership } from '@/features/servers/api/serverOwnership'
import { connectServerOwnership } from '@/features/auth'
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

// Loaded the first time it opens: the cropper and its words stay out of the shell's download.
const CreateServerDialog = lazy(() => import('@/features/servers/components/CreateServerDialog'))
// The channel list's dialogs (S-SRV-05, S-SET-05), the same way.
const ChannelDialogs = lazy(() => import('@/features/servers/components/dialogs/ChannelDialogs'))
const InviteDialog = lazy(() => import('@/features/servers/components/invites/InviteDialog'))
const JoinInviteDialog = lazy(() => import('@/features/servers/components/invites/JoinInviteDialog'))
// Leave, hand over, delete (S-SRV-04, S-SET-07); the password step inside loads on its own.
const MembershipDialogs = lazy(() => import('@/features/servers/components/membership/MembershipDialogs'))

// Deleting the account (auth) asks the servers feature which servers block it
// (S-ME-03 `delete-blocked-owner`). Connected here, not in main.tsx: every page
// that deletes is inside this shell, and the servers code stays out of the first download.
connectServerOwnership(serverOwnership)

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
    const creatingServer = useCreateServerDialog((state) => state.open)
    const channelDialog = useChannelDialogs((state) => state.open)
    const inviting = useInviteDialogs((state) => state.invite !== null)
    const joiningByInvite = useInviteDialogs((state) => state.join !== null)
    const membershipDialog = useMembershipDialogs((state) => state.open !== null)
    // The account's theme and language, here and in this browser's other tabs (REQ-AUTH-08).
    useAccountSettings()
    // A server one is no longer in leaves the rail with a Toast (D-143).
    useServerGoneWatch()

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
                            'max-lg:fixed max-lg:inset-y-0 max-lg:left-rail max-lg:z-40 max-lg:flex max-lg:shadow-sheet-left'
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
            {creatingServer ? (
                <Suspense fallback={null}>
                    <CreateServerDialog />
                </Suspense>
            ) : null}
            {channelDialog ? (
                <Suspense fallback={null}>
                    <ChannelDialogs />
                </Suspense>
            ) : null}
            {inviting ? (
                <Suspense fallback={null}>
                    <InviteDialog />
                </Suspense>
            ) : null}
            {joiningByInvite ? (
                <Suspense fallback={null}>
                    <JoinInviteDialog />
                </Suspense>
            ) : null}
            {membershipDialog ? (
                <Suspense fallback={null}>
                    <MembershipDialogs />
                </Suspense>
            ) : null}
        </ShellContext.Provider>
    )
}
