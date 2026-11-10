import { useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, GraduationCap, ListChecks, MessageCircle, Plus, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { WithTooltip } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
    channelPath,
    hasServerMenu,
    ServerIcon,
    ServerMenuItems,
    serverSettingsPath,
    useCreateServerDialog,
    useServers,
    type Server
} from '@/features/servers'
import { cn } from '@/lib/utils'
import { MeMenu } from './MeMenu'

/** The 4-wide bar at the rail's left edge: 40 high for where you are, 8 for unread. */
function Indicator({ kind }: { kind?: 'selected' | 'unread' }) {
    if (!kind) return null
    return (
        <span
            aria-hidden='true'
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
 * settings, 04 › Khung) has the long bar. Unread arrives with messages (M2).
 * Right-click or Shift+F10 opens the server menu (C-05, S-SRV-04) 8 to the
 * right of the picture, when it has a row for them.
 */
function ServerItem({ server }: { server: Server }) {
    const { pathname } = useLocation()
    const isActive = pathname.startsWith(channelPath(server.id)) || pathname.startsWith(serverSettingsPath(server.id))
    const [menuOpen, setMenuOpen] = useState(false)
    const link = useRef<HTMLAnchorElement>(null)
    const withMenu = hasServerMenu(server)

    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : undefined} />
            <WithTooltip label={server.name} side='right'>
                <Link
                    ref={link}
                    to={channelPath(server.id)}
                    aria-label={server.name}
                    aria-current={isActive ? 'page' : undefined}
                    aria-haspopup={withMenu ? 'menu' : undefined}
                    className={cn(SQUIRCLE, 'overflow-hidden')}
                    onContextMenu={(event) => {
                        if (!withMenu) return
                        event.preventDefault()
                        setMenuOpen(true)
                    }}
                    onKeyDown={(event) => {
                        if (withMenu && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
                            event.preventDefault()
                            setMenuOpen(true)
                        }
                    }}
                >
                    <ServerIcon name={server.name} iconUrl={server.iconUrl} className='size-full' />
                </Link>
            </WithTooltip>
            {withMenu ? (
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
            ) : null}
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
 * A rail item whose page is not built yet: focusable, so its tooltip says so
 * to keyboard users too, but it does nothing (C-00: a disabled control always
 * says why).
 */
function SoonItem({ icon: Icon, name, squircle }: { icon: LucideIcon; name: string; squircle?: boolean }) {
    const { t } = useTranslation()
    const soon = t('shell.comingSoon', { name })
    return (
        <li className='flex w-full justify-center'>
            <WithTooltip label={soon} side='right'>
                <button
                    type='button'
                    aria-disabled='true'
                    aria-label={soon}
                    className={cn(
                        'flex items-center justify-center text-text-tertiary',
                        squircle ? cn(SQUIRCLE, 'hover:bg-surface-2') : 'size-12 rounded-server'
                    )}
                >
                    <Icon className='size-[22px]' aria-hidden='true' />
                </button>
            </WithTooltip>
        </li>
    )
}

function PageItem({ to, icon: Icon, name }: { to: string; icon: LucideIcon; name: string }) {
    const isActive = useLocation().pathname.startsWith(to)
    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : undefined} />
            <WithTooltip label={name} side='right'>
                <Link
                    to={to}
                    aria-label={name}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                        'flex size-12 items-center justify-center rounded-server transition-colors duration-micro hover:bg-surface-1',
                        isActive ? 'text-text-primary' : 'text-text-secondary'
                    )}
                >
                    <Icon className='size-[22px]' aria-hidden='true' />
                </Link>
            </WithTooltip>
        </li>
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
 * Servers come in the order they were joined (GET /servers). Direct
 * messages, To-do and Notifications are pages of later milestones and say so.
 */
export function Rail({ id, className }: { id?: string; className?: string }) {
    const { t } = useTranslation()
    const servers = useServers()

    return (
        <div id={id} className={cn('w-rail shrink-0 flex-col items-center gap-2 bg-bg py-3', className)}>
            <Group label={t('shell.rail.servers')} className='min-h-0 w-full flex-1 overflow-y-auto py-1'>
                <SoonItem icon={MessageCircle} name={t('shell.rail.dm')} squircle />
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
                <SoonItem icon={ListChecks} name={t('shell.rail.tasks')} />
                <SoonItem icon={Bell} name={t('shell.rail.notifications')} />
            </Group>
            <MeMenu />
        </div>
    )
}
