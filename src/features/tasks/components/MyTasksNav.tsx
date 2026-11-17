import type { KeyboardEvent, ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ListChecks } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import '../tasks.css'
import { cn } from '@/lib/utils'
import { useMyTasks } from '../api/useMyTasks'
import { countsByServer } from '../lib/my-tasks'
import type { TaskServer } from '../types'

/**
 * The To-do page's column (S-TASK-04, C-27 SettingsNav `count`): "Việc cần
 * làm", "Tất cả việc" and the count of tasks not done, then "THEO SERVER":
 * each server with tasks not done, in the rail's order, its picture, name
 * and count. Choosing one filters the page (`/tasks?server=`, not
 * remembered, 05 Q2), keeping the words searched for. One Tab stop, the row
 * chosen; ↑ ↓ move between them. While loading, only "Tất cả việc".
 * `path`: the page's, the servers feature's route (D-197).
 */
export function MyTasksNav({ servers, path }: { servers: TaskServer[] | undefined; path: string }) {
    const { t } = useTranslation('tasks')
    const [params] = useSearchParams()
    const chosen = params.get('server')
    const list = useMyTasks(null, '').data
    const counts = list ? countsByServer(list.items) : undefined
    const shown = (servers ?? []).filter((server) => (counts?.byServer.get(server.id) ?? 0) > 0 || server.id === chosen)
    const to = (serverId: string | null) => {
        const next = new URLSearchParams()
        if (serverId) next.set('server', serverId)
        const q = params.get('q')
        if (q) next.set('q', q)
        const search = next.toString()
        return search ? `${path}?${search}` : path
    }

    return (
        <>
            <div className='flex h-12 shrink-0 items-center gap-1 border-b px-4'>
                <h2 className='min-w-0 flex-1 truncate text-headline text-text-primary'>{t('page.title')}</h2>
            </div>
            <nav aria-label={t('page.nav')} className='flex flex-col gap-0.5 p-2'>
                <Row to={to(null)} active={!chosen} icon={<ListChecks aria-hidden='true' />} count={counts?.all}>
                    {t('page.all')}
                </Row>
                {shown.length > 0 ? (
                    <h3 className='px-2 pb-1 pt-3 text-label font-semibold uppercase text-text-tertiary'>
                        {t('page.byServer')}
                    </h3>
                ) : null}
                {shown.map((server) => (
                    <Row
                        key={server.id}
                        to={to(server.id)}
                        active={chosen === server.id}
                        icon={server.icon}
                        count={counts?.byServer.get(server.id) ?? 0}
                    >
                        {server.name}
                    </Row>
                ))}
            </nav>
        </>
    )
}

/** ↑ ↓ from one row of the column to the next. */
function arrows(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const all = [...(event.currentTarget.closest('nav')?.querySelectorAll<HTMLElement>('a') ?? [])]
    const next = all[all.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)]
    if (!next) return
    event.preventDefault()
    next.focus()
}

/**
 * A row of the column: chosen, it is two steps up (`surface-3`,
 * `text-primary` 600, `aria-current="page"`); hover one (`surface-2`). Its
 * count on the right, read with its name.
 */
function Row({
    to,
    active,
    icon,
    count,
    children
}: {
    to: string
    active: boolean
    icon: ReactNode
    count: number | undefined
    children: string
}) {
    const { t } = useTranslation('tasks')
    return (
        <Link
            to={to}
            aria-current={active ? 'page' : undefined}
            tabIndex={active ? 0 : -1}
            onKeyDown={arrows}
            aria-label={count === undefined ? children : t('page.count', { name: children, count })}
            className={cn(
                'flex h-8 items-center gap-2 rounded-button px-2 text-body-sm transition-colors duration-micro [&_svg]:size-4 [&_svg]:shrink-0',
                active
                    ? 'bg-surface-3 font-semibold text-text-primary'
                    : 'font-medium text-text-secondary hover:bg-surface-2'
            )}
        >
            <span className={cn('flex shrink-0', active ? 'text-text-primary' : 'text-text-tertiary')}>{icon}</span>
            <span className='min-w-0 flex-1 truncate'>{children}</span>
            {count === undefined ? null : <span className='text-label text-text-tertiary'>{count}</span>}
        </Link>
    )
}

export default MyTasksNav
