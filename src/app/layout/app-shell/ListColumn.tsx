import { useState, type ReactNode } from 'react'
import { NavLink, useLocation, useMatches } from 'react-router-dom'
import {
    Bell,
    ChevronDown,
    ChevronRight,
    Hash,
    IdCard,
    LampDesk,
    LayoutGrid,
    Palette,
    Shield,
    Timer,
    UserRoundCog,
    type LucideIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CountBadge } from '@/components/ui/count-badge'
import { WithTooltip } from '@/components/ui/tooltip'
import { AUTH_PATHS } from '@/features/auth'
import { USERS_PATHS } from '@/features/users'
import { cn } from '@/lib/utils'
import { findServer, type MockCategory, type MockServer } from './mock-data'

/** The column's 48-high title row, level with the page Header's bottom rule. */
function ColumnTitle({ children }: { children: ReactNode }) {
    return (
        <div className='flex h-12 shrink-0 items-center gap-1 border-b px-4'>
            <h2 className='min-w-0 flex-1 truncate text-headline text-text-primary'>{children}</h2>
        </div>
    )
}

const ROW =
    'flex h-8 items-center gap-2 px-2 text-body-sm transition-colors duration-micro [&_svg]:size-4 [&_svg]:shrink-0'

/**
 * A row that opens a page: hover lifts it one step (`surface-2`), the open
 * one two (`surface-3`, `text-primary` 600, `aria-current="page"`).
 */
function RowLink({
    to,
    end,
    icon: Icon,
    children,
    bold,
    trailing,
    rounded = 'rounded-input',
    label
}: {
    to: string
    end?: boolean
    icon: LucideIcon
    children: ReactNode
    /** Unread (C-06): the name in `text-primary` 600. */
    bold?: boolean
    trailing?: ReactNode
    rounded?: string
    label?: string
}) {
    return (
        <NavLink
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
                cn(
                    ROW,
                    rounded,
                    isActive
                        ? 'bg-surface-3 font-semibold text-text-primary'
                        : cn(
                              'hover:bg-surface-2',
                              bold ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'
                          )
                )
            }
        >
            {({ isActive }) => (
                <>
                    <Icon className={isActive ? 'text-text-primary' : 'text-text-tertiary'} aria-hidden='true' />
                    <span className='min-w-0 flex-1 truncate'>{children}</span>
                    {trailing}
                </>
            )}
        </NavLink>
    )
}

/** A row for a page of a later milestone: says so on hover and focus. */
function SoonRow({
    icon: Icon,
    name,
    rounded = 'rounded-input'
}: {
    icon: LucideIcon
    name: string
    rounded?: string
}) {
    const { t } = useTranslation()
    return (
        <WithTooltip label={t('shell.comingSoon', { name })} side='right'>
            <button
                type='button'
                aria-disabled='true'
                aria-label={t('shell.comingSoon', { name })}
                className={cn(ROW, rounded, 'w-full font-medium text-text-tertiary')}
            >
                <Icon aria-hidden='true' />
                <span className='truncate'>{name}</span>
            </button>
        </WithTooltip>
    )
}

/** The Study page's column (08 S-STUDY-01): Overview, and Study alone (M5). */
function StudyColumn() {
    const { t } = useTranslation()
    return (
        <>
            <ColumnTitle>{t('shell.study.title')}</ColumnTitle>
            <nav aria-label={t('shell.study.title')} className='flex flex-col gap-0.5 p-2'>
                <RowLink to='/study' end icon={LayoutGrid}>
                    {t('shell.study.overview')}
                </RowLink>
                <SoonRow icon={Timer} name={t('shell.study.solo')} />
            </nav>
        </>
    )
}

/** SettingsNav (C-27): the five settings pages. */
function SettingsColumn() {
    const { t } = useTranslation()
    return (
        <>
            <ColumnTitle>{t('shell.settings.title')}</ColumnTitle>
            <nav aria-label={t('shell.settings.title')} className='flex flex-col gap-0.5 p-2'>
                <RowLink to={AUTH_PATHS.settings} icon={UserRoundCog} rounded='rounded-button'>
                    {t('shell.settings.account')}
                </RowLink>
                <RowLink to={USERS_PATHS.profile} icon={IdCard} rounded='rounded-button'>
                    {t('shell.settings.profile')}
                </RowLink>
                <RowLink to={USERS_PATHS.appearance} icon={Palette} rounded='rounded-button'>
                    {t('shell.settings.appearance')}
                </RowLink>
                <RowLink to={USERS_PATHS.notifications} icon={Bell} rounded='rounded-button'>
                    {t('shell.settings.notifications')}
                </RowLink>
                <RowLink to={USERS_PATHS.privacy} icon={Shield} rounded='rounded-button'>
                    {t('shell.settings.privacy')}
                </RowLink>
            </nav>
        </>
    )
}

/**
 * A category (CategoryRow, C-06): its title folds and unfolds the channels
 * under it. Folded, it still shows the open channel and channels that mention
 * you (C-06). The rows are left out rather than hidden with `hidden`: the
 * row's `flex` class would override that attribute and keep them on screen.
 */
function Category({ server, category }: { server: MockServer; category: MockCategory }) {
    const { t } = useTranslation()
    const { pathname } = useLocation()
    const [open, setOpen] = useState(true)
    const listId = `category-${server.id}-${category.id}`
    const Chevron = open ? ChevronDown : ChevronRight
    const pathOf = (channelId: string) => `/channels/${server.id}/${channelId}`
    const visible = open
        ? category.channels
        : category.channels.filter((channel) => pathname === pathOf(channel.id) || Boolean(channel.mentions))

    return (
        <li>
            <button
                type='button'
                aria-expanded={open}
                aria-controls={listId}
                onClick={() => setOpen(!open)}
                className='flex h-7 w-full items-center gap-1 rounded-input px-1 text-label font-semibold text-text-tertiary hover:text-text-secondary'
            >
                <Chevron className='size-3' aria-hidden='true' />
                {category.name}
            </button>
            <ul id={listId} className='flex flex-col gap-0.5'>
                {visible.map((channel) => (
                    <li key={channel.id}>
                        <RowLink
                            to={pathOf(channel.id)}
                            icon={channel.kind === 'study-room' ? LampDesk : Hash}
                            bold={channel.unread || Boolean(channel.mentions)}
                            label={
                                channel.mentions
                                    ? t('shell.channels.mentions', { name: channel.name, count: channel.mentions })
                                    : channel.unread
                                      ? t('shell.channels.unread', { name: channel.name })
                                      : undefined
                            }
                            trailing={<CountBadge count={channel.mentions ?? 0} />}
                        >
                            {channel.name}
                        </RowLink>
                    </li>
                ))}
            </ul>
        </li>
    )
}

/**
 * A server's channels (C-06), from mock data in M0. The server's name heads
 * the column; its menu (03 S-SRV-04) arrives with servers in M1.
 */
function ServerColumn({ serverId }: { serverId: string | undefined }) {
    const { t } = useTranslation()
    const server = findServer(serverId)
    if (!server) return null
    return (
        <>
            <ColumnTitle>{server.name}</ColumnTitle>
            <nav
                aria-label={t('shell.channels.label', { name: server.name })}
                className='min-h-0 flex-1 overflow-y-auto p-2'
            >
                <ul className='flex flex-col gap-3'>
                    {server.categories.map((category) => (
                        <Category key={category.id} server={server} category={category} />
                    ))}
                </ul>
            </nav>
        </>
    )
}

/**
 * The 240-wide list column (`surface-1`) next to the rail. Which list it
 * shows is the route's choice, in its `handle` (ShellHandle).
 */
export function ListColumn({ className, id }: { className?: string; id?: string }) {
    const matches = useMatches()
    const deepest = matches[matches.length - 1]
    const column = matches
        .map((match) => (match.handle as { column?: string } | undefined)?.column)
        .filter(Boolean)
        .pop()

    return (
        <div id={id} className={cn('w-60 shrink-0 flex-col border-r bg-surface-1', className)}>
            {column === 'study' && <StudyColumn />}
            {column === 'settings' && <SettingsColumn />}
            {column === 'server' && <ServerColumn serverId={deepest?.params.serverId} />}
        </div>
    )
}
