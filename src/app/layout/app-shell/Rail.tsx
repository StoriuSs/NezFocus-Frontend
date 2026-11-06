import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Bell, GraduationCap, ListChecks, MessageCircle, Plus, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CountBadge } from '@/components/ui/count-badge'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { MeMenu } from './MeMenu'
import { MOCK_SERVERS, type MockServer } from './mock-data'

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

function ServerItem({ server }: { server: MockServer }) {
    const { t } = useTranslation()
    const isActive = useLocation().pathname.startsWith(`/channels/${server.id}`)
    const label = server.mentions
        ? t('shell.rail.mentions', { name: server.name, count: server.mentions })
        : server.unread
          ? t('shell.rail.unread', { name: server.name })
          : server.name

    return (
        <li className='relative flex w-full justify-center'>
            <Indicator kind={isActive ? 'selected' : server.unread ? 'unread' : undefined} />
            <WithTooltip label={server.name} side='right'>
                <Link
                    to={`/channels/${server.id}`}
                    aria-label={label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(SQUIRCLE, 'text-label font-semibold text-text-primary')}
                >
                    {server.initials}
                    <CountBadge count={server.mentions ?? 0} cutout='ring-bg' className='absolute -bottom-1 -right-1' />
                </Link>
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
 * M0: the servers are mock data; direct messages, adding a server, To-do and
 * Notifications are pages of later milestones and say so.
 */
export function Rail({ id, className }: { id?: string; className?: string }) {
    const { t } = useTranslation()

    return (
        <div id={id} className={cn('w-[72px] shrink-0 flex-col items-center gap-2 bg-bg py-3', className)}>
            <Group label={t('shell.rail.servers')} className='min-h-0 w-full flex-1 overflow-y-auto py-1'>
                <SoonItem icon={MessageCircle} name={t('shell.rail.dm')} squircle />
                <li aria-hidden='true' className='h-0.5 w-8 shrink-0 rounded-full bg-border' />
                {MOCK_SERVERS.map((server) => (
                    <ServerItem key={server.id} server={server} />
                ))}
                <SoonItem icon={Plus} name={t('shell.rail.addServer')} squircle />
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
