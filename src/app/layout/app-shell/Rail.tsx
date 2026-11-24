import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, GraduationCap, ListChecks, MessageCircle, Plus, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CountBadge } from '@/components/ui/count-badge'
import { Popover, PopoverAnchor, PopoverTrigger } from '@/components/ui/popover'
import { WithTooltip } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
    channelPath,
    ServerIcon,
    ServerMenuItems,
    serverSettingsPath,
    SERVERS_PATHS,
    useCreateServerDialog,
    useInboxPlaces,
    useServers,
    type Server
} from '@/features/servers'
import { useServerReadState } from '@/features/messaging'
import { InboxPanel, useInboxStore, useUnreadNotificationCount } from '@/features/notifications'
import { friendsPath, isMessagesPath } from '@/features/social'
import { useDueTaskCount } from '@/features/tasks'
import { cn } from '@/lib/utils'
import { MeMenu } from './MeMenu'

/** The 4-wide bar at the rail's left edge: 40 high for where you are, 8 for unread. */
function Indicator({ kind }: { kind?: 'selected' | 'unread' }) {
    if (!kind) return null
    return (
        <span
            aria-hidden='true'
            data-unread={kind === 'unread' || undefined}
            className={cn(
                'absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-text-primary',
                kind === 'selected' ? 'h-10' : 'h-2'
            )}
        />
    )
}

const SQUIRCLE =
    'relative flex size-12 items-center justify-center rounded-server bg-surface-2 transition-colors duration-micro hover:bg-surface-3'

/**
 * A server: its icon or initials; where you are (its channels or its
 * settings, 04 › Khung) has the long bar, a server with unread messages the
 * short one, and the mentions of the reader still unread are a badge at the
 * picture's corner, wherever you are (REQ-MSG-09, C-05). Right-click or
 * Shift+F10 opens the server menu (C-05, S-SRV-04) 8 to the right of the
 * picture ("Leave server" is always in it).
 */
function ServerItem({ server }: { server: Server }) {
    const { t } = useTranslation()
    const channelIds = useMemo(() => server.channels.map((channel) => channel.id), [server.channels])
    const { unread, mentions } = useServerReadState(server.id, channelIds)
    const state =
        mentions > 0 ? t('shell.unread.mentions', { count: mentions }) : unread ? t('shell.unread.messages') : null
    const { pathname } = useLocation()
    const isActive = pathname.startsWith(channelPath(server.id)) || pathname.startsWith(serverSettingsPath(server.id))
    const [menuOpen, setMenuOpen] = useState(false)
    const link = useRef<HTMLAnchorElement>(null)

    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : unread ? 'unread' : undefined} />
            <WithTooltip label={server.name} side='right'>
                <Link
                    ref={link}
                    to={channelPath(server.id)}
                    aria-label={state ? t('shell.unread.label', { name: server.name, state }) : server.name}
                    aria-current={isActive ? 'page' : undefined}
                    aria-haspopup='menu'
                    className={cn(SQUIRCLE, 'overflow-hidden')}
                    onContextMenu={(event) => {
                        event.preventDefault()
                        setMenuOpen(true)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
                            event.preventDefault()
                            setMenuOpen(true)
                        }
                    }}
                >
                    <ServerIcon name={server.name} iconUrl={server.iconUrl} className='size-full' />
                </Link>
            </WithTooltip>
            {/* On the picture's lower right corner, cut out of it by a ring of the rail's colour (C-03). */}
            <CountBadge count={mentions} cutout='ring-bg' className='pointer-events-none absolute bottom-0 right-4' />
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                {/* Where the menu hangs: the picture's right edge. Never clicked itself. */}
                <DropdownMenuTrigger
                    tabIndex={-1}
                    aria-hidden='true'
                    className='pointer-events-none absolute right-3 top-0 h-12 w-0'
                />
                <DropdownMenuContent
                    side='right'
                    align='start'
                    sideOffset={8}
                    className='w-56'
                    onCloseAutoFocus={(event) => {
                        event.preventDefault()
                        link.current?.focus()
                    }}
                >
                    <ServerMenuItems server={server} />
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    )
}

/** ＋: "Create or join a server" (S-SRV-01). */
function AddServerItem() {
    const { t } = useTranslation()
    const show = useCreateServerDialog((state) => state.show)
    const name = t('shell.rail.addServer')
    return (
        <li className='flex w-full justify-center'>
            <WithTooltip label={name} side='right'>
                <button
                    type='button'
                    aria-label={name}
                    onClick={() => show()}
                    className={cn(SQUIRCLE, 'text-text-secondary hover:text-text-primary')}
                >
                    <Plus className='size-[22px]' aria-hidden='true' />
                </button>
            </WithTooltip>
        </li>
    )
}

/**
 * 💬 (C-05 `dm`): the messages area, a squircle on `surface-2` like a
 * server, lit while one of its pages is open. It opens the Friends page,
 * whose tab is the page's choice (09 Q6; the last DM opened comes with the
 * DMs, D-248). The Badge of DMs unread comes with them too.
 */
function MessagesItem() {
    const { t } = useTranslation()
    const isActive = isMessagesPath(useLocation().pathname)
    const name = t('shell.rail.dm')
    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : undefined} />
            <WithTooltip label={name} side='right'>
                <Link
                    to={friendsPath()}
                    aria-label={name}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(SQUIRCLE, isActive ? 'bg-surface-3 text-text-primary' : 'text-text-primary')}
                >
                    <MessageCircle className='size-[22px]' aria-hidden='true' />
                </Link>
            </WithTooltip>
        </li>
    )
}

function PageItem({
    to,
    icon: Icon,
    name,
    label = name,
    badge
}: {
    to: string
    icon: LucideIcon
    name: string
    /** What a screen reader says: the name, and what the badge counts. */
    label?: string
    badge?: ReactNode
}) {
    const isActive = useLocation().pathname.startsWith(to)
    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : undefined} />
            <WithTooltip label={name} side='right'>
                <Link
                    to={to}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                        'flex size-12 items-center justify-center rounded-server transition-colors duration-micro hover:bg-surface-1',
                        isActive ? 'text-text-primary' : 'text-text-secondary'
                    )}
                >
                    <Icon className='size-[22px]' aria-hidden='true' />
                </Link>
            </WithTooltip>
            {badge}
        </li>
    )
}

/**
 * "Việc cần làm" (S-TASK-04): its badge counts one's tasks overdue or due
 * today (C-05, 05 › luật dữ liệu 3), at the icon's corner as a server's
 * mentions are; none at 0.
 */
function TasksItem() {
    const { t } = useTranslation()
    const due = useDueTaskCount()
    const name = t('shell.rail.tasks')
    return (
        <PageItem
            to={SERVERS_PATHS.tasks}
            icon={ListChecks}
            name={name}
            label={due > 0 ? t('shell.rail.tasksDue', { name, count: due }) : name}
            badge={
                <CountBadge count={due} cutout='ring-bg' className='pointer-events-none absolute bottom-0 right-4' />
            }
        />
    )
}

/**
 * "Thông báo" (S-NOTI-01): opens the inbox, a Popover beside the rail from
 * the rail's edge, 8 away (06 › Quy ước); while open the item is `open`
 * (C-05: `surface-2`, the icon `text-primary`, no bar, `aria-expanded`). Its
 * badge counts the unread items (06 › Quy ước › Số), as "Việc" does. Esc, a
 * click outside or on it again closes it, focus back here.
 */
function NotificationsItem() {
    const { t } = useTranslation()
    const unread = useUnreadNotificationCount()
    const places = useInboxPlaces()
    // A store, as the Toast of 11 S-MOD-02 › H1 opens it too ("Xem").
    const open = useInboxStore((state) => state.open)
    const setOpen = useInboxStore((state) => state.setOpen)
    // Closed with the rail (signed out, the session ended): the next sign-in in this tab starts closed.
    useEffect(() => () => setOpen(false), [setOpen])
    const name = t('shell.rail.notifications')
    return (
        <Popover open={open} onOpenChange={setOpen}>
            {/* The popover hangs from the rail's edge, not the icon's. */}
            <PopoverAnchor asChild>
                <li className='relative flex w-full justify-center'>
                    <WithTooltip label={name} side='right'>
                        <PopoverTrigger asChild>
                            <button
                                type='button'
                                aria-label={
                                    unread > 0 ? t('shell.rail.notificationsUnread', { name, count: unread }) : name
                                }
                                className={cn(
                                    'flex size-12 items-center justify-center rounded-server transition-colors duration-micro',
                                    open ? 'bg-surface-2 text-text-primary' : 'text-text-secondary hover:bg-surface-1'
                                )}
                            >
                                <Bell className='size-[22px]' aria-hidden='true' />
                            </button>
                        </PopoverTrigger>
                    </WithTooltip>
                    <CountBadge
                        count={unread}
                        cutout='ring-bg'
                        className='pointer-events-none absolute bottom-0 right-4'
                    />
                </li>
            </PopoverAnchor>
            {open ? (
                <Suspense fallback={null}>
                    <InboxPanel places={places} onClose={() => setOpen(false)} />
                </Suspense>
            ) : null}
        </Popover>
    )
}

function Group({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
    return (
        <nav aria-label={label} className={className}>
            <ul className='flex flex-col items-center gap-2'>{children}</ul>
        </nav>
    )
}

/**
 * Rail (C-05): 72 wide on `bg`. Direct messages, your servers (scrolling),
 * the add button; at the bottom Study, To-do, Notifications and your own
 * avatar, which opens your menu (S-ME-01).
 *
 * Servers come in the order they were joined (GET /servers).
 */
export function Rail({ id, className }: { id?: string; className?: string }) {
    const { t } = useTranslation()
    const servers = useServers()

    return (
        <div id={id} className={cn('w-rail shrink-0 flex-col items-center gap-2 bg-bg py-3', className)}>
            <Group label={t('shell.rail.servers')} className='min-h-0 w-full flex-1 overflow-y-auto py-1'>
                <MessagesItem />
                <li aria-hidden='true' className='h-0.5 w-8 shrink-0 rounded-full bg-border' />
                {servers.isPending
                    ? [0, 1, 2].map((index) => (
                          <li key={index} aria-hidden='true' className='flex w-full justify-center'>
                              <span className='size-12 animate-pulse rounded-server bg-surface-2 motion-reduce:animate-none' />
                          </li>
                      ))
                    : servers.data?.map((server) => <ServerItem key={server.id} server={server} />)}
                <AddServerItem />
            </Group>
            <Group label={t('shell.rail.pages')} className='w-full'>
                <PageItem to='/study' icon={GraduationCap} name={t('shell.rail.study')} />
                <TasksItem />
                <NotificationsItem />
            </Group>
            <MeMenu />
        </div>
    )
}
