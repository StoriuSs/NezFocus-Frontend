import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlarmClockOff, Calendar, CalendarOff, MoreHorizontal, Pencil, Trash2, UserPlus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/tasks'
import '../tasks.css'
import { ShellContext } from '@/components/shell/shell-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { settingsCache, useProfile } from '@/features/users'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { cn } from '@/lib/utils'
import { onTaskDeleted } from '../api/rememberTask'
import { useTask, useTaskHistory } from '../api/useTask'
import { useAssignTask, useSetTaskStatus, useUnassignTask } from '../api/useTaskWrites'
import { useDayWords } from '../hooks/useDayWords'
import { dueText } from '../lib/due-text'
import { historyLine, historyTime, type HistoryClock } from '../lib/history-text'
import { mayChangeStatus, mayEdit, meFirst, nameOf } from '../lib/people'
import { taskFailure } from '../lib/task-errors'
import type { Task, TaskBoardPlace, TaskCandidate, TaskStatus } from '../types'
import { AssigneePicker } from './AssigneePicker'
import { DeleteTaskDialog } from './DeleteTaskDialog'
import { Offline } from './Offline'
import { PersonRow } from './PersonRow'
import { TaskDialog } from './TaskDialog'

const STATUSES: readonly TaskStatus[] = ['todo', 'doing', 'done']
/** People shown before "Xem tất cả n người" (05 › Edge case `long-detail`). */
const PEOPLE_SHOWN = 5
/** History lines shown before "Xem toàn bộ lịch sử (n)". */
const LINES_SHOWN = 3

/**
 * Where the task's channel is, from the servers feature: its names, what one
 * may do there, whom it may be given to. `undefined` while the servers are
 * read; `null` when one is not in that server or channel any more.
 */
export type PlaceOf = (serverId: string, channelId: string) => TaskBoardPlace | null | undefined

/**
 * "Chi tiết việc" (S-TASK-02), a dialog over whatever page has `?task=`:
 * the channel line (to the channel, its board open), the title, the status
 * saved at once (SegmentedControl, or words without the right), the due date,
 * the creator, the people on it ("Thêm người", "Rút khỏi việc này", x for
 * the creator or MANAGE_TASKS, "Tôi làm"), the description and the history.
 * ⋯ has "Sửa" (S-TASK-03 `edit` in its place, back here after) and "Xóa
 * việc" (`delete-confirm`). What one may not do is not shown (05 Q5).
 *
 * Opened from a row, the board's copy shows at once; from a link, a
 * Skeleton. A task one may no longer view (deleted, its channel out of
 * view, its board off) closes it with "Việc này không còn khả dụng" (05 Q6);
 * deleted while open, "Việc này vừa bị xóa"; taken off it by someone, the
 * dialog becomes a viewer's with "{Tên} đã gỡ bạn khỏi việc này" (05 Q11).
 */
export function TaskDetail({
    taskId,
    placeOf,
    onClose,
    onOpenChannel
}: {
    taskId: string
    placeOf: PlaceOf
    onClose: () => void
    /** The channel line: its channel, with the Task Board open. */
    onOpenChannel: (task: Task) => void
}) {
    const { t } = useTranslation('tasks')
    const query = useTask(taskId)
    const task = query.data
    const place = task ? placeOf(task.serverId, task.channelId) : undefined
    const [editing, setEditing] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const deletingHere = useRef(false)
    const closed = useRef(false)
    // What had the focus when it opened (a task's row, an inbox row), read before any effect:
    // the detail moves the focus onto its status control in its own effect, which runs before
    // the dialog's, so the dialog would remember that control and drop the focus on close.
    const [opener] = useState(() => document.activeElement)
    // "Sửa" swaps this dialog for the form: the focus stays with the form.
    const toEditing = useRef(false)

    const failure = query.isError ? taskFailure(query.error) : null
    const gone = place === null || failure?.kind === 'gone' || failure?.kind === 'board-off'
    // Once: the Toast is keyed by the task, so a form closing for the same reason says it once too.
    useEffect(() => {
        if (!gone || closed.current) return
        closed.current = true
        toast(t('toast.gone'), { id: `task-gone-${taskId}` })
        onClose()
    }, [gone, t, taskId, onClose])
    useEffect(
        () =>
            onTaskDeleted((deleted) => {
                if (deleted !== taskId || deletingHere.current || closed.current) return
                closed.current = true
                toast(t('toast.deletedMeanwhile'), { id: `task-gone-${taskId}` })
                onClose()
            }),
        [t, taskId, onClose]
    )

    if (gone) return null
    if (task && place && editing) {
        return <Editing task={task} place={place} onClose={() => setEditing(false)} />
    }
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                hideCloseButton
                className='flex max-h-[calc(100dvh-80px)] flex-col gap-0 p-0 sm:max-w-[600px]'
                onOpenAutoFocus={(event) => {
                    // The detail puts it on its status control, or x, once it shows (05 Q12).
                    event.preventDefault()
                    ;(event.currentTarget as HTMLElement).focus()
                }}
                onCloseAutoFocus={(event) => {
                    // Back where it was (S-TASK-02 › Focus): that element, or the task's row if
                    // its row was drawn again meanwhile (moved to another group).
                    event.preventDefault()
                    if (toEditing.current) {
                        toEditing.current = false
                        return
                    }
                    const back =
                        opener instanceof HTMLElement && opener.isConnected
                            ? opener
                            : document.querySelector<HTMLElement>(`[data-task-row="${taskId}"]`)
                    back?.focus()
                }}
            >
                {task && place ? (
                    <Detail
                        task={task}
                        place={place}
                        onOpenChannel={() => onOpenChannel(task)}
                        onEdit={() => {
                            toEditing.current = true
                            setEditing(true)
                        }}
                        onDelete={() => setDeleting(true)}
                    />
                ) : query.isError && !gone ? (
                    <div className='flex flex-col items-center gap-3 px-6 py-10 text-center'>
                        <DialogTitle className='text-body-sm font-normal text-text-secondary'>
                            {t('detail.loadError')}
                        </DialogTitle>
                        <Button variant='text' size='sm' onClick={() => void query.refetch()}>
                            {t('detail.retry')}
                        </Button>
                    </div>
                ) : (
                    <Loading />
                )}
            </DialogContent>
            {deleting && task ? (
                <DeleteTaskDialog
                    task={task}
                    onClose={() => setDeleting(false)}
                    onDeleted={onClose}
                    onDeleting={() => (deletingHere.current = true)}
                />
            ) : null}
        </Dialog>
    )
}

/** Opened from a link or the inbox: the title and three rows (S-TASK-02 › loading). */
function Loading() {
    const { t } = useTranslation('tasks')
    return (
        <div className='flex flex-col gap-4 px-6 py-6' aria-busy='true'>
            <DialogTitle className='sr-only'>{t('detail.loading')}</DialogTitle>
            <Skeleton className='h-6 w-2/3' />
            {[0, 1, 2].map((index) => (
                <div key={index} className='flex items-center gap-3'>
                    <Skeleton className='h-3 w-24' />
                    <Skeleton className='h-3 flex-1' />
                </div>
            ))}
        </div>
    )
}

/** "Sửa" from ⋯: the form in the dialog's place; saved or cancelled, back to the detail (S-TASK-03 › Đi tới). */
function Editing({ task, place, onClose }: { task: Task; place: TaskBoardPlace; onClose: () => void }) {
    const now = useMinuteClock()
    const timeZone = useQuery(settingsCache).data?.timezone
    const words = useDayWords()
    const me = useMe()
    return (
        <TaskDialog place={place} task={task} me={me} now={now} timeZone={timeZone} words={words} onClose={onClose} />
    )
}

/** The signed-in person as the pickers name them. */
function useMe(): TaskCandidate | undefined {
    const profile = useProfile().data
    return useMemo(
        () =>
            profile && {
                id: profile.id,
                username: profile.username ?? null,
                displayName: profile.displayName ?? null,
                avatarUrl: profile.avatarUrl ?? null
            },
        [profile]
    )
}

function Detail({
    task,
    place,
    onOpenChannel,
    onEdit,
    onDelete
}: {
    task: Task
    place: TaskBoardPlace
    onOpenChannel: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const { t, i18n } = useTranslation('tasks')
    const me = useMe()
    const myId = me?.id
    const now = useMinuteClock()
    const timeZone = useQuery(settingsCache).data?.timezone
    const words = useDayWords()
    const offline = useContext(ShellContext)?.connection === 'offline'
    const history = useTaskHistory(task.id, true)
    // Who is online: the members who view the channel, as the picker reads them (C-03).
    const viewers = useQuery(place.candidates(''))
    const presence = useMemo(
        () => new Map((viewers.data ?? []).map((person) => [person.id, person.presence] as const)),
        [viewers.data]
    )
    const setStatus = useSetTaskStatus()
    const assign = useAssignTask()
    const unassign = useUnassignTask()
    const [shownStatus, setShownStatus] = useState<TaskStatus | null>(null)
    const [allPeople, setAllPeople] = useState(false)
    const [allLines, setAllLines] = useState(false)
    const [picking, setPicking] = useState<string[]>([])
    const [seen, setSeen] = useState<ReadonlyMap<string, TaskCandidate>>(new Map())
    const statusLabel = useId()
    const top = useRef<HTMLDivElement>(null)
    // Shown (at once, after a Skeleton, or back from "Sửa"): focus on the status control, else x (05 Q12).
    useEffect(() => {
        const root = top.current
        const target =
            root?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]:not(:disabled)') ??
            root?.querySelector<HTMLElement>('[data-detail-close]')
        target?.focus()
    }, [])

    const onIt = task.assignees.some((person) => person.id === myId)
    const changesStatus = mayChangeStatus(task, myId, place)
    const edits = mayEdit(task, myId, place)
    const claims = !onIt && !place.timedOut && myId !== undefined
    const status = shownStatus ?? task.status

    // Taken off by someone else while open (05 Q11): said with who did it, from the line it wrote.
    const [wasOn, setWasOn] = useState(onIt)
    const [leaving, setLeaving] = useState(false)
    const [removedBy, setRemovedBy] = useState<'waiting' | null>(null)
    if (wasOn !== onIt) {
        setWasOn(onIt)
        setLeaving(false)
        if (wasOn && !onIt && !leaving) setRemovedBy('waiting')
    }
    const lines = history.data?.items
    useEffect(() => {
        if (removedBy !== 'waiting' || !lines) return
        const line = lines[0]
        if (line?.kind !== 'assignee_removed' || line.subject?.id !== myId || !line.actor) return
        setRemovedBy(null)
        toast(t('toast.removedYou', { name: nameOf(line.actor, t('people.deleted')) }))
    }, [removedBy, lines, myId, t])

    const changeStatus = (next: TaskStatus) => {
        setShownStatus(next)
        setStatus.mutate(
            { taskId: task.id, status: next },
            {
                onSettled: () => setShownStatus(null),
                onError: (error) => {
                    if (getApiErrorType(error) === 'MAX_OPEN_TASKS_REACHED') toast.error(t('toast.full'))
                    else notifyMutationError(error)
                }
            }
        )
    }
    const people = meFirst(task.assignees, myId)
    const shownPeople = allPeople ? people : people.slice(0, PEOPLE_SHOWN)
    const known = useMemo(() => {
        const all = new Map<string, TaskCandidate>(seen)
        for (const person of task.assignees) all.set(person.id, person)
        if (me) all.set(me.id, me)
        return all
    }, [seen, task.assignees, me])
    // Without MANAGE_TASKS or being its creator, those on it stay; one may still take oneself off.
    const locked = useMemo(
        () => new Set(edits ? [] : task.assignees.map((person) => person.id).filter((id) => id !== myId)),
        [edits, task.assignees, myId]
    )
    const savePicked = (picked: string[]) => {
        const before = task.assignees.map((person) => person.id)
        const add = picked.filter((id) => !before.includes(id))
        const remove = before.filter((id) => !picked.includes(id) && !locked.has(id))
        if (add.length > 0) assign.mutate({ taskId: task.id, userIds: add })
        for (const userId of remove) {
            if (userId === myId) setLeaving(true)
            unassign.mutate({ taskId: task.id, userId })
        }
    }

    const clock: HistoryClock = { now, timeZone, language: i18n.language }
    const due = task.dueAt ? new Date(task.dueAt) : null
    const overdue = due !== null && task.status !== 'done' && due.getTime() < now.getTime()
    const DueIcon = !due ? CalendarOff : overdue ? AlarmClockOff : Calendar
    const shownLines = allLines ? (lines ?? []) : (lines ?? []).slice(0, LINES_SHOWN)
    const total = history.data?.total ?? 0
    const offlineHint = t('board.offline')

    return (
        <>
            <div ref={top} className='flex flex-col gap-3 px-6 pb-4 pt-5'>
                <div className='flex items-center gap-1'>
                    <WithTooltip label={t('detail.openChannel')}>
                        <button
                            type='button'
                            onClick={onOpenChannel}
                            className='min-w-0 truncate rounded-button text-left text-label text-text-secondary hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
                        >
                            # {place.channelName} · {place.serverName}
                        </button>
                    </WithTooltip>
                    <span className='flex-1' />
                    {edits ? (
                        <Offline offline={offline} label={offlineHint}>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <IconButton
                                        label={t('detail.more')}
                                        disabled={offline}
                                        className='data-[state=open]:bg-surface-3'
                                    >
                                        <MoreHorizontal />
                                    </IconButton>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end' className='w-[200px]'>
                                    <DropdownMenuItem onSelect={onEdit}>
                                        <Pencil aria-hidden='true' />
                                        {t('menu.edit')}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={onDelete} className='text-danger focus:text-danger'>
                                        <Trash2 aria-hidden='true' />
                                        {t('menu.delete')}
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </Offline>
                    ) : null}
                    <DialogClose asChild>
                        <IconButton label={t('detail.close')} data-detail-close=''>
                            <X />
                        </IconButton>
                    </DialogClose>
                </div>
                <DialogTitle className='break-words text-title-2 font-semibold text-text-primary'>
                    {task.title}
                </DialogTitle>
                <DialogDescription className='sr-only'>
                    # {place.channelName} · {place.serverName}
                </DialogDescription>
                {changesStatus ? (
                    <div>
                        <span id={statusLabel} className='sr-only'>
                            {t('detail.status')}
                        </span>
                        <Offline offline={offline} label={offlineHint}>
                            <SegmentedControl
                                aria-labelledby={statusLabel}
                                value={status}
                                onValueChange={changeStatus}
                                disabled={offline}
                                segments={STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))}
                            />
                        </Offline>
                    </div>
                ) : null}
            </div>

            <div className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-6'>
                <dl className='grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2'>
                    {changesStatus ? null : (
                        <>
                            <dt className='text-label text-text-tertiary'>{t('detail.status')}</dt>
                            <dd className='text-body-sm text-text-primary'>{t(`status.${task.status}`)}</dd>
                        </>
                    )}
                    <dt className='text-label text-text-tertiary'>{t('detail.due')}</dt>
                    <dd
                        className={cn(
                            'flex items-center gap-1.5 text-body-sm',
                            overdue ? 'text-danger' : 'text-text-primary'
                        )}
                    >
                        <DueIcon className='size-4 shrink-0' aria-hidden='true' />
                        {!due
                            ? t('due.none')
                            : overdue
                              ? `${t('due.overdue')} · ${dueText(due, now, timeZone, i18n.language, words)}`
                              : dueText(due, now, timeZone, i18n.language, words)}
                    </dd>
                    <dt className='text-label text-text-tertiary'>{t('detail.creator')}</dt>
                    <dd>
                        <PersonRow
                            person={task.creator}
                            serverId={task.serverId}
                            me={myId}
                            presence={presence.get(task.creator.id)}
                            leftServer={task.creator.leftServer}
                        />
                    </dd>
                </dl>

                <section className='flex flex-col gap-1'>
                    <div className='flex items-center justify-between gap-2'>
                        <h3 className='text-label font-semibold uppercase text-text-tertiary'>
                            {people.length > 0
                                ? t('detail.assignees', { count: people.length })
                                : t('detail.assigneesNone')}
                        </h3>
                        {changesStatus ? (
                            <Offline offline={offline} label={offlineHint}>
                                <AssigneePicker
                                    selected={picking}
                                    onChange={setPicking}
                                    known={known}
                                    remember={(person) => setSeen((before) => new Map(before).set(person.id, person))}
                                    me={me}
                                    candidates={place.candidates}
                                    locked={locked}
                                    onOpenChange={(open) => {
                                        if (open) setPicking(task.assignees.map((person) => person.id))
                                        else savePicked(picking)
                                    }}
                                    trigger={
                                        <Button variant='text' size='sm' disabled={offline}>
                                            <UserPlus aria-hidden='true' />
                                            {t('detail.addPeople')}
                                        </Button>
                                    }
                                />
                            </Offline>
                        ) : null}
                    </div>
                    {people.length === 0 ? (
                        <p className='text-body-sm text-text-tertiary'>{t('detail.unassigned')}</p>
                    ) : (
                        <ul className='flex flex-col gap-1'>
                            {shownPeople.map((person) => (
                                <li key={person.id}>
                                    <PersonRow
                                        person={person}
                                        serverId={task.serverId}
                                        me={myId}
                                        presence={presence.get(person.id)}
                                        lostAccess={!person.viewsChannel}
                                    >
                                        {person.id === myId && !place.timedOut ? (
                                            <Offline offline={offline} label={offlineHint}>
                                                <Button
                                                    variant='text'
                                                    size='sm'
                                                    disabled={offline}
                                                    onClick={() => {
                                                        setLeaving(true)
                                                        unassign.mutate({ taskId: task.id, userId: person.id })
                                                    }}
                                                >
                                                    {t('detail.withdraw')}
                                                </Button>
                                            </Offline>
                                        ) : person.id !== myId && edits ? (
                                            <Offline offline={offline} label={offlineHint}>
                                                <WithTooltip
                                                    label={t('detail.remove', {
                                                        name: nameOf(person, t('people.deleted'))
                                                    })}
                                                >
                                                    <IconButton
                                                        label={t('detail.remove', {
                                                            name: nameOf(person, t('people.deleted'))
                                                        })}
                                                        disabled={offline}
                                                        onClick={() =>
                                                            unassign.mutate({ taskId: task.id, userId: person.id })
                                                        }
                                                    >
                                                        <X />
                                                    </IconButton>
                                                </WithTooltip>
                                            </Offline>
                                        ) : null}
                                    </PersonRow>
                                </li>
                            ))}
                        </ul>
                    )}
                    {people.length > PEOPLE_SHOWN ? (
                        <Button
                            variant='text'
                            size='sm'
                            className='self-start'
                            onClick={() => setAllPeople((all) => !all)}
                        >
                            {allPeople ? t('detail.fewerPeople') : t('detail.allPeople', { count: people.length })}
                        </Button>
                    ) : null}
                </section>

                <section className='flex flex-col gap-1'>
                    <h3 className='text-label font-semibold uppercase text-text-tertiary'>{t('detail.description')}</h3>
                    {task.description ? (
                        <p className='whitespace-pre-wrap break-words text-body-sm text-text-primary'>
                            {task.description}
                        </p>
                    ) : (
                        <p className='text-body-sm text-text-tertiary'>{t('detail.noDescription')}</p>
                    )}
                </section>

                <section className='flex flex-col gap-1'>
                    <h3 className='text-label font-semibold uppercase text-text-tertiary'>{t('history.title')}</h3>
                    {history.isError ? (
                        <p className='text-label text-text-secondary'>{t('history.loadError')}</p>
                    ) : !lines ? (
                        <Skeleton className='h-3 w-2/3' />
                    ) : (
                        <ol className='flex flex-col gap-1'>
                            {shownLines.map((line) => (
                                <li key={line.id} className='flex items-baseline justify-between gap-3 text-label'>
                                    <span className='min-w-0 break-words text-text-secondary'>
                                        {historyLine(line, myId, t, clock)}
                                    </span>
                                    <span className='shrink-0 text-text-tertiary'>
                                        {historyTime(new Date(line.createdAt), clock, t('due.yesterday'))}
                                    </span>
                                </li>
                            ))}
                        </ol>
                    )}
                    {total > LINES_SHOWN ? (
                        <Button
                            variant='text'
                            size='sm'
                            className='self-start'
                            onClick={() => setAllLines((all) => !all)}
                        >
                            {allLines ? t('history.less') : t('history.all', { count: total })}
                        </Button>
                    ) : null}
                </section>

                {claims ? (
                    <div className='flex justify-end'>
                        <Offline offline={offline} label={offlineHint}>
                            <Button
                                disabled={offline}
                                onClick={() => myId && assign.mutate({ taskId: task.id, userIds: [myId] })}
                            >
                                {t('detail.claim')}
                            </Button>
                        </Offline>
                    </div>
                ) : null}
            </div>
        </>
    )
}

/** Its own chunk (code-splitting.md): opened from a row, a link or the inbox. */
export default TaskDetail
