import { useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import '../tasks.css'
import { ShellContext } from '@/components/shell/shell-context'
import { ShellPage } from '@/components/shell/ShellPage'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { settingsCache, useProfile } from '@/features/users'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { folded } from '@/lib/utils'
import { useMyDoneTasks, useMyTasks } from '../api/useMyTasks'
import { useHeldTasks } from '../held-tasks.store'
import { useDayWords } from '../hooks/useDayWords'
import { useRowFocus } from '../hooks/useRowFocus'
import { useStatusChange } from '../hooks/useStatusChange'
import { useTaskLink } from '../hooks/useTaskLink'
import { dueLine } from '../lib/due-text'
import { DUE_GROUPS, myRows } from '../lib/my-tasks'
import { mayChangeStatus, mayEdit } from '../lib/people'
import { boardRows, type BoardRow } from '../lib/task-board'
import type { Task, TaskBoardPlace, TaskCandidate, TaskServer } from '../types'
import { DeleteTaskDialog } from './DeleteTaskDialog'
import type { PlaceOf } from './TaskDetail'
import { TaskDialog } from './TaskDialog'
import { TaskRow } from './TaskRow'

/** An EmptyState under the search field, its words on the rows' left edge (`all-done`, `search-empty`). */
const LEFT = 'items-start px-2 py-6 text-left'

/** Skeleton rows while the list loads (S-TASK-04 `loading`). */
const LOADING_ROWS = 6

/**
 * "Việc cần làm" (S-TASK-04, REQ-TASK-05): one's tasks from every server, or
 * from the one chosen in the column (`?server=`), in the groups the server
 * put them in (Quá hạn, Hôm nay, 7 ngày tới, Sau đó, Không hạn, D-186), then
 * ĐÃ XONG folded each time the page opens, 50 at a time. The search field
 * (`?q=`, titles without accents, 300 ms after typing, D-97) shows its
 * results by status instead, as the Task Board does. A row opens the detail
 * on this page (`?task=`); its box marks it done with "Hoàn tác" while the
 * row stands still (useStatusChange). No task is made here (TASK-05).
 *
 * The servers feature hands the servers in the rail's order and what one
 * may do in each channel (`placeOf`, D-197).
 */
export function MyTasks({ servers, placeOf }: { servers: TaskServer[] | undefined; placeOf: PlaceOf }) {
    const { t, i18n } = useTranslation('tasks')
    const [params, setParams] = useSearchParams()
    const serverId = params.get('server')
    const server = servers?.find((candidate) => candidate.id === serverId)
    const urlQuery = params.get('q') ?? ''
    const [query, setQuery] = useState(urlQuery)
    // The words changed in the address from elsewhere (the rail's "Việc cần làm", a link): the field follows.
    const [seenQuery, setSeenQuery] = useState(urlQuery)
    if (urlQuery !== seenQuery) {
        setSeenQuery(urlQuery)
        if (urlQuery.trim() !== query.trim()) setQuery(urlQuery)
    }
    const typed = useDebouncedValue(query.trim(), 300)
    const search = folded(urlQuery.trim())
    const [doneOpen, setDoneOpen] = useState(false)
    const [editing, setEditing] = useState<{ task: Task; place: TaskBoardPlace } | null>(null)
    const [deleting, setDeleting] = useState<Task | null>(null)
    const [activeId, setActiveId] = useState<string | null>(null)
    const list = useRef<HTMLDivElement>(null)
    const searchInput = useRef<HTMLInputElement>(null)

    // The words go on the URL once typing stops (`/tasks?q=…`), on this history entry;
    // not while the field still waits out words the address just gave it.
    useEffect(() => {
        if (typed !== query.trim() || typed === urlQuery.trim()) return
        setParams(
            (before) => {
                const next = new URLSearchParams(before)
                if (typed) next.set('q', typed)
                else next.delete('q')
                return next
            },
            { replace: true }
        )
    }, [typed, query, urlQuery, setParams])
    // A server one is no longer in, or none such: back to every server's tasks (05 › Edge case).
    useEffect(() => {
        if (!serverId || !servers || server) return
        setParams(
            (before) => {
                const next = new URLSearchParams(before)
                next.delete('server')
                return next
            },
            { replace: true }
        )
    }, [serverId, servers, server, setParams])

    // Until the servers are read, the one in the address: never every server's tasks first.
    const filter = servers ? (server?.id ?? null) : serverId
    const open = useMyTasks(filter, search)
    const showDone = search !== '' || doneOpen
    const done = useMyDoneTasks(filter, search, showDone && open.isSuccess)
    const holds = useHeldTasks((state) => state.holds)
    const change = useStatusChange()
    const link = useTaskLink()
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

    // Only one's own tasks of the server shown stand still here: a Toast of a
    // Task Board elsewhere may be about another's.
    const donePages = done.data?.pages
    const meId = profile?.id
    // Worked out on each render: one's tasks are few (the open ones all come at once, D-186).
    const items = open.data?.items ?? []
    const doneItems = donePages?.flatMap((page) => page.items) ?? []
    const ours = new Map(
        [...holds].filter(
            ([, { task }]) =>
                (filter === null || task.serverId === filter) &&
                (task.assignees.some((person) => person.id === meId) ||
                    (task.creator.id === meId && task.assignees.length === 0))
        )
    )
    const count = open.data?.doneCount ?? 0
    const rows = myRows(items, doneItems, count, ours)
    const statusRows = boardRows(items, doneItems, count, ours)

    const searchKey = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && query) {
            event.preventDefault()
            setQuery('')
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

    // The groups shown, by due date, or by status while searching (S-TASK-04 `search`).
    const sections: Array<{ key: string; label: string; rows: BoardRow[] }> =
        search === ''
            ? DUE_GROUPS.map((group) => ({
                  key: group,
                  label: t(`page.group.${group}`, { count: rows.groups[group].length }),
                  rows: rows.groups[group]
              }))
            : [
                  {
                      key: 'doing',
                      label: t('board.group.doing', { count: statusRows.doing.length }),
                      rows: statusRows.doing
                  },
                  {
                      key: 'todo',
                      label: t('board.group.todo', { count: statusRows.todo.length }),
                      rows: statusRows.todo
                  }
              ]
    const doneRows = search === '' ? rows.done : statusRows.done
    const doneCount = search === '' ? rows.doneCount : statusRows.doneCount
    const openCount = sections.reduce((sum, section) => sum + section.rows.length, 0)

    const shownRows = [...sections.flatMap((section) => section.rows), ...(showDone ? doneRows : [])]
    // One Tab stop for the list (S-TASK-04 › Bàn phím): the row last focused, else the first.
    const tabRow = shownRows.some((row) => row.task.id === activeId) ? activeId : (shownRows[0]?.task.id ?? null)
    const order = shownRows.map((row) => row.task.id).join(' ')
    const placing = [
        ...sections.flatMap((section) => section.rows.map((row) => `${section.key}:${row.task.id}`)),
        ...doneRows.map((row) => `done:${row.task.id}`)
    ].join(' ')
    const focus = useRowFocus(list, order, placing)
    const deletingOrder = useRef<string[]>([])

    const rowOf = ({ task, status }: BoardRow) => {
        const place = placeOf(task.serverId, task.channelId)
        const where = place
            ? server
                ? t('page.whereChannel', { channel: place.channelName })
                : t('page.where', { server: place.serverName, channel: place.channelName })
            : undefined
        return (
            <TaskRow
                key={task.id}
                task={task}
                status={status}
                due={dueLine({ ...task, status }, now, timeZone, i18n.language, words)}
                where={where}
                me={me?.id}
                powers={{
                    status: !!place && mayChangeStatus(task, me?.id, place),
                    edit: !!place && mayEdit(task, me?.id, place)
                }}
                offline={offline}
                touch={touch}
                active={tabRow === task.id}
                onFocus={() => setActiveId(task.id)}
                onKeyDown={rowKey}
                onOpen={() => {
                    focus.opening(task.id)
                    link.open(task.id)
                }}
                onToggle={() => change(task, status === 'done' ? 'todo' : 'done')}
                onSetStatus={(next) => change(task, next)}
                onEdit={() => place && setEditing({ task, place })}
                onCopyLink={() => place && link.copy(place.linkTo(task.id))}
                onDelete={() => {
                    deletingOrder.current = order.split(' ')
                    setDeleting(task)
                }}
            />
        )
    }

    const searchField = (
        <div className='pb-4'>
            <div className='relative w-80'>
                <Search
                    className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                    aria-hidden='true'
                />
                <Input
                    ref={searchInput}
                    type='search'
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={searchKey}
                    aria-label={t('board.searchPlaceholder')}
                    placeholder={t('board.searchPlaceholder')}
                    disabled={offline}
                    className='pl-8 pr-10'
                />
                {query ? (
                    <IconButton
                        label={t('page.clearSearch')}
                        onClick={() => {
                            setQuery('')
                            searchInput.current?.focus()
                        }}
                        className='absolute right-1 top-1/2 size-7 -translate-y-1/2 [&_svg]:size-4'
                    >
                        <X aria-hidden='true' />
                    </IconButton>
                ) : null}
            </div>
        </div>
    )
    const doneGroup =
        doneCount > 0 ? (
            <section className='mt-4'>
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
                        {search === ''
                            ? t('page.group.done', { count: doneCount })
                            : t('board.group.done', { count: doneCount })}
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
        ) : null

    const empty =
        !open.isPending && !open.isError && search === '' && openCount === 0 && doneCount === 0 && urlQuery === ''
    let body: ReactNode
    if (open.isPending) {
        body = (
            <div aria-busy='true'>
                <p role='status' className='sr-only'>
                    {t('board.loading')}
                </p>
                {Array.from({ length: LOADING_ROWS }, (_, index) => (
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
            <div className='flex flex-col items-start gap-3 px-2 py-6'>
                <p className='text-body-sm text-text-secondary'>{t('board.loadError')}</p>
                <Button variant='text' size='sm' onClick={() => void open.refetch()}>
                    {t('board.retry')}
                </Button>
            </div>
        )
    } else if (empty) {
        // Nothing at all: across the content area, not in the 720 block, at about 40% of its
        // height (C-17 › a page with nothing else on it). Inline: no class of its own for 2 : 3.
        body = (
            <div className='flex flex-1 flex-col items-center'>
                <div style={{ flexGrow: 2 }} />
                <EmptyState size='inline' title={t('page.empty.title')}>
                    {t('page.empty.body')}
                </EmptyState>
                <div style={{ flexGrow: 3 }} />
            </div>
        )
    } else {
        body = (
            <>
                {searchField}
                <div ref={list} onFocus={focus.focusIn} onBlur={focus.focusOut}>
                    {search !== '' && openCount === 0 && doneCount === 0 ? (
                        <EmptyState
                            size='inline'
                            className={LEFT}
                            title={t('board.noMatch.title', { query: urlQuery.trim() })}
                        >
                            {server ? t('page.noMatchIn', { server: server.name }) : t('board.noMatch.body')}
                        </EmptyState>
                    ) : search === '' && openCount === 0 ? (
                        <EmptyState size='inline' className={LEFT} title={t('page.allDone.title')}>
                            {t('page.allDone.body')}
                        </EmptyState>
                    ) : null}
                    {sections.map((section) => (
                        <Group key={section.key} label={section.label} rows={section.rows}>
                            {section.rows.map(rowOf)}
                        </Group>
                    ))}
                    {doneGroup}
                </div>
            </>
        )
    }

    return (
        <ShellPage title={server ? t('page.titleIn', { server: server.name }) : t('page.title')}>
            <div className='flex min-h-full flex-col p-6 lg:p-8'>
                {empty ? body : <div className='flex w-full max-w-settings flex-1 flex-col'>{body}</div>}
            </div>
            {editing ? (
                <TaskDialog
                    place={editing.place}
                    task={editing.task}
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
                    onDeleted={() => focus.focusAfter(deleting.id, deletingOrder.current)}
                />
            ) : null}
        </ShellPage>
    )
}

/** One group: its title ("QUÁ HẠN — 1") and its rows; a group with none is not shown. */
function Group({ label, rows, children }: { label: string; rows: readonly BoardRow[]; children: ReactNode }) {
    if (rows.length === 0) return null
    return (
        <section className='mt-4 first:mt-0'>
            <h3 className='px-2 py-1 text-label font-semibold uppercase text-text-tertiary'>{label}</h3>
            <ul className='flex flex-col'>{children}</ul>
        </section>
    )
}

export default MyTasks
