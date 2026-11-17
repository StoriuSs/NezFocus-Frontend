import {
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FocusEvent,
    type KeyboardEvent,
    type ReactNode,
    type RefObject
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import '../tasks.css'
import { RightPanel, type PanelState } from '@/components/shell/RightPanel'
import { ShellContext } from '@/components/shell/shell-context'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { settingsCache, useProfile } from '@/features/users'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { folded } from '@/lib/utils'
import { useDoneTasks, useOpenTasks } from '../api/useTaskBoard'
import { useHeldTasks } from '../held-tasks.store'
import { useStatusChange } from '../hooks/useStatusChange'
import { useDayWords } from '../hooks/useDayWords'
import { boardRows, type BoardRow } from '../lib/task-board'
import { dueLine } from '../lib/due-text'
import { mayChangeStatus, mayEdit } from '../lib/people'
import { taskFailure } from '../lib/task-errors'
import type { Task, TaskBoardPlace, TaskCandidate } from '../types'
import { DeleteTaskDialog } from './DeleteTaskDialog'
import { TaskDialog } from './TaskDialog'
import { TaskRow } from './TaskRow'

/**
 * The Task Board of a text channel (S-TASK-01), in the right panel (C-08):
 * "Thêm việc" with CREATE_TASKS, then ĐANG LÀM and CẦN LÀM (due first, none
 * last, 05 Q4), and XONG folded each time the panel opens, 50 at a time.
 * `search` in its header swaps the title for a search field (titles, accents
 * ignored, 300 ms after typing, D-97): its results in the same groups, XONG
 * open. Others' changes come live (`task.*`); a row just marked stands
 * still while its Toast shows (useStatusChange). The board turned off
 * meanwhile: `board-off`, until the panel is closed.
 */
export function TaskBoard({
    panel,
    buttonRef,
    place,
    enabled
}: {
    panel: PanelState
    buttonRef: RefObject<HTMLButtonElement | null>
    place: TaskBoardPlace
    /** The channel's board is on (its `task_board_enabled`, live with the server). */
    enabled: boolean
}) {
    const { t, i18n } = useTranslation('tasks')
    const [searching, setSearching] = useState(false)
    const [query, setQuery] = useState('')
    const search = folded(useDebouncedValue(query.trim(), 300))
    const [doneOpen, setDoneOpen] = useState(false)
    const [editing, setEditing] = useState<Task | 'new' | null>(null)
    const [deleting, setDeleting] = useState<Task | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const list = useRef<HTMLDivElement>(null)
    const searchField = useRef<HTMLInputElement>(null)
    // The field opened: focus in it (S-TASK-01 › Tìm việc).
    useEffect(() => {
        if (searching) searchField.current?.focus()
    }, [searching])

    const open = useOpenTasks(place.channelId, search, enabled)
    const off = !enabled || (open.isError && taskFailure(open.error).kind === 'board-off')
    const showDone = search !== '' || doneOpen
    const done = useDoneTasks(place.channelId, search, enabled && !off && showDone && open.isSuccess)
    const holds = useHeldTasks((state) => state.holds)
    const change = useStatusChange()
    const now = useMinuteClock()
    const timeZone = useQuery(settingsCache).data?.timezone
    const words = useDayWords()
    const profile = useProfile().data
    const me: TaskCandidate | undefined = profile && {
        id: profile.id,
        username: profile.username ?? null,
        displayName: profile.displayName ?? null,
        avatarUrl: profile.avatarUrl ?? null
    }
    const offline = useContext(ShellContext)?.connection === 'offline'
    const touch = useMediaQuery('(hover: none)')

    const donePages = done.data?.pages
    const rows = useMemo(() => {
        const items = open.data?.items ?? []
        const doneItems = donePages?.flatMap((page) => page.items) ?? []
        const listed = new Set([...items, ...doneItems].map((task) => task.id))
        const mine = new Map(
            [...holds].filter(
                ([id, hold]) => hold.task.channelId === place.channelId && (search === '' || listed.has(id))
            )
        )
        return boardRows(items, doneItems, open.data?.doneCount ?? 0, mine)
    }, [open.data, donePages, holds, place.channelId, search])

    const closeSearch = () => {
        setSearching(false)
        setQuery('')
    }
    const searchKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            // The first Esc clears the words, the second closes the field (S-TASK-01 › Tìm việc).
            event.preventDefault()
            event.stopPropagation()
            if (query) setQuery('')
            else closeSearch()
        } else if (event.key === 'ArrowDown') {
            const first = list.current?.querySelector<HTMLElement>('[data-task-row]')
            if (!first) return
            event.preventDefault()
            first.focus()
        }
    }
    // ↑ ↓ between the rows, across the groups.
    const rowKey = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        const all = [...(list.current?.querySelectorAll<HTMLElement>('[data-task-row]') ?? [])]
        const next = all[all.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)]
        if (!next) return
        event.preventDefault()
        next.focus()
    }

    const heading = searching ? (
        <div className='relative flex-1'>
            <Search
                className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                aria-hidden='true'
            />
            <Input
                ref={searchField}
                type='search'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={searchKey}
                aria-label={t('board.searchPlaceholder')}
                placeholder={t('board.searchPlaceholder')}
                disabled={offline}
                className='h-8 pl-8'
            />
        </div>
    ) : undefined
    const actions = off ? null : searching ? (
        <WithTooltip label={t('board.closeSearch')} side='bottom'>
            <IconButton label={t('board.closeSearch')} onClick={closeSearch}>
                <X />
            </IconButton>
        </WithTooltip>
    ) : open.data && (open.data.items.length > 0 || (open.data.doneCount ?? 0) > 0) ? (
        <WithTooltip label={t('board.search')} side='bottom'>
            <IconButton label={t('board.search')} onClick={() => setSearching(true)}>
                <Search />
            </IconButton>
        </WithTooltip>
    ) : null

    const shownRows = [...rows.doing, ...rows.todo, ...(search !== '' || doneOpen ? rows.done : [])]
    // One Tab stop for the list (S-TASK-01 › Bàn phím): the row last focused, else the first.
    const tabRow = shownRows.some((row) => row.task.id === activeId) ? activeId : (shownRows[0]?.task.id ?? null)
    const order = shownRows.map((row) => row.task.id).join(' ')
    // Which group each row is in too: a row moving to another is drawn again.
    const placing = [
        ...rows.doing.map((row) => `d${row.task.id}`),
        ...rows.todo.map((row) => `t${row.task.id}`),
        ...rows.done.map((row) => `x${row.task.id}`)
    ].join(' ')

    // The row with the keyboard focus keeps it when it moves to another group,
    // and the next one takes it when it goes (S-TASK-01 › Tương tác): a row
    // drawn again in another list loses the focus to the page.
    const focusedRow = useRef<string | null>(null)
    const shownOrder = useRef<string[]>([])
    const deletingOrder = useRef<string[]>([])
    const focusIn = (event: FocusEvent<HTMLDivElement>) => {
        const id = (event.target as HTMLElement).dataset.taskRow
        focusedRow.current = id ?? null
    }
    const focusOut = (event: FocusEvent<HTMLDivElement>) => {
        if (event.relatedTarget) {
            if (!list.current?.contains(event.relatedTarget as Node)) focusedRow.current = null
            return
        }
        // To nowhere: a click on the page, or the row taken out of it (kept then).
        const left = event.target
        setTimeout(() => {
            if (left.isConnected) focusedRow.current = null
        }, 0)
    }
    const focusAfter = (id: string, before: readonly string[]) => {
        const now = shownOrder.current
        const next = now.includes(id)
            ? id
            : (before.slice(before.indexOf(id) + 1).find((one) => now.includes(one)) ?? now.at(-1))
        if (!next) return
        list.current?.querySelector<HTMLElement>(`[data-task-row="${next}"]`)?.focus()
    }
    useLayoutEffect(() => {
        const before = shownOrder.current
        shownOrder.current = order ? order.split(' ') : []
        const id = focusedRow.current
        // Lost: on the page, or still on the row taken out (some browsers keep it there).
        const active = document.activeElement
        if (!id || (active && active !== document.body && active.isConnected)) return
        focusAfter(id, before)
        // `placing` changes when a row only moves to another group, `order` does not.
    }, [order, placing])
    const rowOf = ({ task, status }: BoardRow) => (
        <TaskRow
            key={task.id}
            task={task}
            status={status}
            due={dueLine({ ...task, status }, now, timeZone, i18n.language, words)}
            me={me?.id}
            powers={{ status: mayChangeStatus(task, me?.id, place), edit: mayEdit(task, me?.id, place) }}
            offline={offline}
            touch={touch}
            active={tabRow === task.id}
            onFocus={() => setActiveId(task.id)}
            onKeyDown={rowKey}
            onToggle={() => change(task, status === 'done' ? 'todo' : 'done')}
            onSetStatus={(next) => change(task, next)}
            onEdit={() => setEditing(task)}
            onDelete={() => {
                deletingOrder.current = order.split(' ')
                setDeleting(task)
            }}
        />
    )

    let body
    if (off) {
        body = (
            <div className='flex min-h-full items-center justify-center px-2 py-8'>
                <EmptyState
                    size='inline'
                    title={t('board.off.title')}
                    actions={
                        place.manageChannel ? (
                            <Button variant='outline' size='sm' onClick={place.openSettings}>
                                {t('board.off.action')}
                            </Button>
                        ) : undefined
                    }
                >
                    {t('board.off.body')}
                </EmptyState>
            </div>
        )
    } else if (open.isPending) {
        body = (
            <div aria-busy='true'>
                <p role='status' className='sr-only'>
                    {t('board.loading')}
                </p>
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} className='flex gap-2 p-2'>
                        <Skeleton className='size-5 rounded-full' />
                        <div className='flex flex-1 flex-col gap-1.5'>
                            <Skeleton className='h-3 w-full' />
                            <Skeleton className='h-3 w-24' />
                        </div>
                    </div>
                ))}
            </div>
        )
    } else if (open.isError) {
        body = (
            <div className='flex flex-col items-center gap-3 px-2 py-8 text-center'>
                <p className='text-body-sm text-text-secondary'>{t('board.loadError')}</p>
                <Button variant='text' size='sm' onClick={() => void open.refetch()}>
                    {t('board.retry')}
                </Button>
            </div>
        )
    } else if (search === '' && rows.doing.length + rows.todo.length === 0 && rows.doneCount === 0) {
        body = (
            <div className='flex justify-center px-2 pt-8'>
                <EmptyState
                    size='inline'
                    title={t('board.empty.title')}
                    actions={
                        place.create && !place.timedOut ? (
                            <Offline offline={offline} label={t('board.offline')}>
                                <Button size='sm' disabled={offline} onClick={() => setEditing('new')}>
                                    {t('board.empty.action')}
                                </Button>
                            </Offline>
                        ) : undefined
                    }
                >
                    {place.create && !place.timedOut ? t('board.empty.body') : t('board.empty.readOnly')}
                </EmptyState>
            </div>
        )
    } else if (search !== '' && rows.doing.length + rows.todo.length === 0 && rows.doneCount === 0) {
        body = (
            <div className='flex justify-center px-2 pt-8'>
                <EmptyState size='inline' title={t('board.noMatch.title', { query: query.trim() })}>
                    {t('board.noMatch.body')}
                </EmptyState>
            </div>
        )
    } else {
        const doneRows = showDone ? rows.done : []
        body = (
            <div ref={list} onFocus={focusIn} onBlur={focusOut} className='flex flex-col gap-1'>
                {place.create && !place.timedOut && !searching ? (
                    <Offline offline={offline} label={t('board.offline')}>
                        <Button
                            variant='outline'
                            size='sm'
                            className='mb-2 w-full'
                            disabled={offline}
                            onClick={() => setEditing('new')}
                        >
                            <Plus aria-hidden='true' />
                            {t('board.add')}
                        </Button>
                    </Offline>
                ) : null}
                <Group label={t('board.group.doing', { count: rows.doing.length })} rows={rows.doing}>
                    {rows.doing.map(rowOf)}
                </Group>
                <Group label={t('board.group.todo', { count: rows.todo.length })} rows={rows.todo}>
                    {rows.todo.map(rowOf)}
                </Group>
                {rows.doneCount > 0 ? (
                    <section className='mt-2'>
                        <h3>
                            <Button
                                variant='ghost'
                                size='sm'
                                aria-expanded={showDone}
                                disabled={search !== ''}
                                onClick={() => setDoneOpen((was) => !was)}
                                className='h-7 gap-1 px-1 text-label font-semibold uppercase text-text-tertiary disabled:text-text-tertiary'
                            >
                                {showDone ? <ChevronDown aria-hidden='true' /> : <ChevronRight aria-hidden='true' />}
                                {t('board.group.done', { count: rows.doneCount })}
                            </Button>
                        </h3>
                        {showDone ? <ul className='mt-1 flex flex-col'>{doneRows.map(rowOf)}</ul> : null}
                        {showDone && done.hasNextPage ? (
                            <Button
                                variant='text'
                                size='sm'
                                className='mt-1'
                                disabled={done.isFetchingNextPage}
                                onClick={() => void done.fetchNextPage()}
                            >
                                {t('board.more')}
                            </Button>
                        ) : null}
                    </section>
                ) : null}
            </div>
        )
    }

    return (
        <RightPanel state={panel} buttonRef={buttonRef} title={t('board.title')} heading={heading} actions={actions}>
            {body}
            {editing ? (
                <TaskDialog
                    place={place}
                    task={editing === 'new' ? undefined : editing}
                    me={me}
                    now={now}
                    timeZone={timeZone}
                    words={words}
                    onClose={() => setEditing(null)}
                />
            ) : null}
            {deleting ? (
                <DeleteTaskDialog
                    task={deleting}
                    onClose={() => setDeleting(null)}
                    onDeleted={() => focusAfter(deleting.id, deletingOrder.current)}
                />
            ) : null}
        </RightPanel>
    )
}

/**
 * Offline, a control that saves is off with "Cần kết nối mạng" in a Tooltip
 * (05 Q10): a disabled button hears no pointer, so the Tooltip is on a box
 * around it.
 */
function Offline({ offline, label, children }: { offline: boolean; label: string; children: ReactNode }) {
    if (!offline) return children
    return (
        <WithTooltip label={label}>
            <span className='flex'>{children}</span>
        </WithTooltip>
    )
}

/** One group: its title ("ĐANG LÀM — 1") and its rows; a group with none is not shown. */
function Group({ label, rows, children }: { label: string; rows: readonly BoardRow[]; children: ReactNode }) {
    if (rows.length === 0) return null
    return (
        <section className='mt-2 first:mt-0'>
            <h3 className='px-2 py-1 text-label font-semibold uppercase text-text-tertiary'>{label}</h3>
            <ul className='flex flex-col'>{children}</ul>
        </section>
    )
}

export default TaskBoard
