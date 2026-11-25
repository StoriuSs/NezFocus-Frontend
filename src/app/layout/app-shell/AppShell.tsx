import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useSearchParams } from 'react-router-dom'
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
import { useServerRemovals } from '@/features/servers/server-removals.store'
import { useHostLeave } from '@/features/study/host-leave.store'
import { useSoloYield } from '@/features/study/solo-yield.store'
import { useRemovedWhileAway } from '@/features/servers/hooks/useRemovedWhileAway'
import { useServerGoneWatch } from '@/features/servers/hooks/useServerGoneWatch'
import { serverOwnership } from '@/features/servers/api/serverOwnership'
import { connectServerOwnership } from '@/features/auth'
import { connectChatLinks, friendsPath, relationshipsQuery, useDms, useRelationships } from '@/features/social'
import { connectBlockList } from '@/features/users'
import { useConnectionBanner, useRealtimeConnection } from '@/features/realtime'
import { useDmUnread, useMentionTotal } from '@/features/messaging'
import {
    JoinedSessionCues,
    RoomDock,
    useChatLinks,
    useJoinedSession,
    useServers,
    useVoiceRooms
} from '@/features/servers'
import { SoloDockSlot, SoloWatch } from '@/features/study'
import { useTitleCount } from '@/hooks/useDocumentTitle'
import { useRefuseFileDrops } from '@/hooks/useRefuseFileDrops'
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
// Kicked or banned while open (11 S-MOD-02), loaded when the first one comes.
const RemovedDialog = lazy(() => import('@/features/servers/components/membership/RemovedDialog'))
// "Rời phòng?" of a session's Host (07 S-ROOM-04, D-44, D-50, D-77), loaded the first time asked.
const HostLeaveDialog = lazy(() => import('@/features/study/components/HostLeaveDialog'))
// "… và dừng học một mình?" before a room's session ends one's Solo (08 S-STUDY-02, D-103), the same way.
const SoloYieldDialog = lazy(() => import('@/features/study/components/SoloYieldDialog'))
// A task's detail on any page with `?task=` (05 Q6, S-TASK-02), loaded the first time one opens.
const TaskDetailRoute = lazy(() => import('@/features/servers/components/TaskDetailRoute'))

// Deleting the account (auth) asks the servers feature which servers block it
// (S-ME-03 `delete-blocked-owner`). Connected here, not in main.tsx: every page
// that deletes is inside this shell, and the servers code stays out of the first download.
connectServerOwnership(serverOwnership)
// The Privacy page's "Block list" row (users) counts the people blocked in the
// social feature's list (S-ME-05, D-131), which users cannot import.
connectBlockList({ query: relationshipsQuery, path: friendsPath('blocked') })
// A DM's chat (social) reads links and channel tokens from the servers one is in
// (D-249), which the social feature cannot import: servers answers, connected here.
connectChatLinks(useChatLinks)

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
 *
 * `?task=` on any page opens that task's detail over it (05 Q6); closing it
 * takes the parameter off.
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
    const removed = useServerRemovals((state) => state.queue.length > 0)
    const askingHost = useHostLeave((state) => state.asking !== null)
    const askingSoloYield = useSoloYield((state) => state.asking !== null)
    const joinedSessionId = useJoinedSession()?.id ?? null
    const [params, setParams] = useSearchParams()
    const openTask = params.get('task')
    const closeTask = useCallback(
        () =>
            setParams(
                (before) => {
                    const next = new URLSearchParams(before)
                    next.delete('task')
                    return next
                },
                { replace: true }
            ),
        [setParams]
    )
    // The account's theme and language, here and in this browser's other tabs (REQ-AUTH-08).
    useAccountSettings()
    // Friends, requests and blocks, read as the app opens and kept live (D-242): the Badge of
    // the "Friends" row and the Friends page from the cache (REQ-SOCIAL-02).
    useRelationships()
    // My DMs, read as the app opens and kept live (D-244): the messages column and the 💬 Badge.
    useDms()
    // The servers kept live by the socket; one no longer in leaves the rail, with a dialog or a Toast (D-178).
    useServerGoneWatch()
    // Put out of or banned from one while away: a Toast from the inbox's unread item, "Xem" opening it (H1, D-187).
    useRemovedWhileAway()
    // The tab's socket (SRS 5.2), opened after this first paint; and the Banner it shows when lost.
    useRealtimeConnection()
    // The voice room this tab is in: joined again on a reload, its state told again (07, D-206).
    useVoiceRooms()
    // A file dropped where nothing takes it does nothing, on every page: the browser
    // would open it in place of the app, and leave the room with it (M4 L6b-a).
    useRefuseFileDrops()
    const connection = useConnectionBanner()
    // The tab title starts with every mention still unread, whatever the page (REQ-MSG-09, X-01):
    // in the channels the server list shows (a server left, a channel deleted, no longer counts),
    // and every DM message unread (09 › luật 6).
    const servers = useServers().data
    const listed = useMemo(() => servers?.flatMap((server) => server.channels.map((channel) => channel.id)), [servers])
    useTitleCount(useMentionTotal(listed ?? []) + useDmUnread().messages)

    const toggleNav = useCallback(() => setNavOpen((open) => !open), [])
    const shell = useMemo<ShellContextValue>(
        () => ({ navOpen, toggleNav, connection }),
        [navOpen, toggleNav, connection]
    )

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
            <div className='flex h-dvh flex-col overflow-hidden bg-bg'>
                {/* The sheets below 1024 (☰, a right panel) fill this, not the window: they stop above the dock strip (M4 A3). */}
                <div className='relative flex min-h-0 flex-1'>
                    <Rail
                        id={SHELL_RAIL_ID}
                        className={cn(
                            'hidden md:flex',
                            navOpen &&
                                'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:flex max-md:animate-in max-md:slide-in-from-left max-md:duration-medium max-md:ease-out'
                        )}
                    />
                    <ListColumn
                        id={SHELL_LIST_ID}
                        className={cn(
                            'hidden lg:flex',
                            navOpen &&
                                'max-lg:absolute max-lg:inset-y-0 max-lg:left-rail max-lg:z-40 max-lg:flex max-lg:shadow-sheet-left max-lg:animate-in max-lg:slide-in-from-left max-lg:duration-medium max-lg:ease-out'
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
                {/* Below 1024 the list column is a sheet: the docks are strips across the window, a room's over a Solo's (C-09). */}
                <RoomDock shape='strip' />
                <SoloDockSlot shape='strip' />
            </div>
            {/* The tab's title, the phase sound and the streak toast of the session one is in, on every page (07 S-ROOM-05). */}
            <JoinedSessionCues />
            {/* One's Solo: its title, sound and streak toast while it runs, its toast as it ends (08 S-STUDY-02). */}
            <SoloWatch />
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
            {askingHost ? (
                <Suspense fallback={null}>
                    <HostLeaveDialog joinedSessionId={joinedSessionId} />
                </Suspense>
            ) : null}
            {askingSoloYield ? (
                <Suspense fallback={null}>
                    <SoloYieldDialog />
                </Suspense>
            ) : null}
            {removed ? (
                <Suspense fallback={null}>
                    <RemovedDialog />
                </Suspense>
            ) : null}
            {openTask ? (
                <Suspense fallback={null}>
                    <TaskDetailRoute key={openTask} taskId={openTask} onClose={closeTask} />
                </Suspense>
            ) : null}
        </ShellContext.Provider>
    )
}
