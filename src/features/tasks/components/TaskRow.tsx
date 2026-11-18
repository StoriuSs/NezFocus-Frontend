import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { AlarmClockOff, Calendar, CalendarOff, Check, EyeOff, Link, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/tasks'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DueLine } from '../lib/due-text'
import { meFirst, nameOf } from '../lib/people'
import type { Task, TaskStatus } from '../types'
import { AvatarStack } from './AvatarStack'

const STATUSES: TaskStatus[] = ['todo', 'doing', 'done']
/** The foot of ⋯ (right 4, top 6, 28 high): the menu opens under it, right edges in line. */
const MORE_FOOT = { right: 4, top: 34, width: 0, height: 0 }

/** What one row may do, worked out by the board from the viewer's rights (REQ-TASK-02). */
export interface RowPowers {
    status: boolean
    edit: boolean
}

/**
 * TaskRow (C-28): the status box, the title (2 lines then …), the due line,
 * the people on it; `page` (the To-do page, S-TASK-04) adds where the task
 * is to the due line ("{hạn} · {server} › #{kênh}"). The box marks it done, or opens it again; a
 * viewer who may not change it sees a still box with the reason in a
 * Tooltip. ⋯ (on hover or keyboard focus, in place of the avatars; always
 * there on a touch screen), a right click (where the pointer is, like a
 * message's, C-12) or Shift+F10 open the row's menu:
 * the status (one of three), "Sửa", "Sao chép link việc" (for everyone),
 * "Xóa việc", each only for who may (05 S-TASK-01 › Menu hàng việc).
 * Offline, nothing that saves works (05 Q10). People on it who no longer
 * view the channel add "Mất quyền xem kênh", their names in a Tooltip
 * (C-28 › Mất quyền, D-194).
 */
export function TaskRow({
    task,
    status,
    due,
    where,
    me,
    powers,
    offline,
    touch,
    active,
    onFocus,
    onKeyDown,
    onOpen,
    onToggle,
    onSetStatus,
    onEdit,
    onCopyLink,
    onDelete
}: {
    task: Task
    /** What the box shows (the status just clicked, while the row stands still). */
    status: TaskStatus
    due: DueLine
    /** `page`: the task's server and channel, or its channel alone while one server is shown. */
    where?: string
    me: string | undefined
    powers: RowPowers
    offline: boolean
    touch: boolean
    /** The row the list's Tab stops on (one for the whole list). */
    active: boolean
    onFocus: () => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    /** Bấm hàng / Enter: the task's detail (S-TASK-02). */
    onOpen: () => void
    onToggle: () => void
    onSetStatus: (status: TaskStatus) => void
    onEdit: () => void
    onCopyLink: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation('tasks')
    const [menuOpen, setMenuOpen] = useState(false)
    // Where the menu hangs in the row: at the pointer after a right click, else under ⋯ (null).
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null)
    const rowRef = useRef<HTMLButtonElement>(null)
    const openMenu = (at: { x: number; y: number } | null) => {
        setMenuAt(at)
        setMenuOpen(true)
    }
    const people = meFirst(task.assignees, me)
    const names = people.map((person) => nameOf(person, t('people.deleted'))).join(', ')
    const done = status === 'done'
    const lost = task.assignees
        .filter((person) => !person.viewsChannel)
        .map((person) => nameOf(person, t('people.deleted')))
        .join(', ')
    const can = powers.status && !offline
    const line = where ? `${due.text} · ${where}` : due.text

    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === ' ' && can) {
            event.preventDefault()
            onToggle()
        } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            event.preventDefault()
            if (!offline) openMenu(null)
        } else onKeyDown(event)
    }
    const contextMenu = (event: MouseEvent<HTMLElement>) => {
        // "Sao chép link việc" is for everyone: every row has its menu.
        if (offline) return
        event.preventDefault()
        const row = event.currentTarget.getBoundingClientRect()
        openMenu({ x: event.clientX - row.left, y: event.clientY - row.top })
    }

    const DueIcon = { overdue: AlarmClockOff, none: CalendarOff, done: Check, due: Calendar }[due.kind]
    const box = (
        <span
            className={cn(
                'flex size-5 items-center justify-center rounded-full border-2',
                status === 'todo' && 'border-border-input',
                status === 'doing' &&
                    'border-primary bg-[linear-gradient(90deg,rgb(var(--primary))_50%,transparent_50%)]',
                done && 'border-success bg-success text-on-primary'
            )}
        >
            {done ? <Check className='size-3' strokeWidth={3} aria-hidden='true' /> : null}
        </span>
    )

    return (
        <li className='group relative'>
            <button
                ref={rowRef}
                type='button'
                data-task-row={task.id}
                tabIndex={active ? 0 : -1}
                aria-label={t(lost ? 'row.labelLost' : 'row.label', {
                    title: task.title,
                    status: t(`status.${status}`),
                    due: line,
                    people: names || t('row.unassigned'),
                    names: lost
                })}
                onClick={onOpen}
                onFocus={onFocus}
                onKeyDown={keyDown}
                onContextMenu={contextMenu}
                className={cn(
                    'flex w-full flex-col gap-0.5 rounded-button py-2 pl-9 pr-2 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary',
                    menuOpen && 'bg-surface-2'
                )}
            >
                {/* The avatars beside the title only: the lines under it take the row's whole width,
                    so the due's time always shows (C-28, 05 R2), scrollbar or not. */}
                <span className='flex w-full items-start gap-2'>
                    <span
                        className={cn(
                            'line-clamp-2 min-w-0 flex-1 break-words text-body-sm font-medium',
                            done ? 'text-text-tertiary line-through' : 'text-text-primary'
                        )}
                    >
                        {task.title}
                    </span>
                    <span
                        className={cn(
                            'flex shrink-0 items-center gap-1 pt-0.5',
                            !touch && 'group-focus-within:invisible group-hover:invisible',
                            !touch && menuOpen && 'invisible',
                            touch && 'pr-8'
                        )}
                    >
                        {people.length > 0 ? (
                            <AvatarStack people={people} me={me} max={touch ? 1 : 3} />
                        ) : (
                            <span className='text-label text-text-tertiary'>{t('row.unassigned')}</span>
                        )}
                    </span>
                </span>
                <span
                    className={cn(
                        'flex min-w-0 items-center gap-1 text-label',
                        due.kind === 'overdue'
                            ? 'text-danger'
                            : due.kind === 'due'
                              ? 'text-text-secondary'
                              : 'text-text-tertiary'
                    )}
                >
                    <DueIcon className='size-3 shrink-0' aria-hidden='true' />
                    <span className='truncate'>{line}</span>
                </span>
                {lost ? (
                    <WithTooltip label={t('row.lostAccessHint', { names: lost })}>
                        <span className='flex min-w-0 items-center gap-1 text-label text-danger'>
                            <EyeOff className='size-3 shrink-0' aria-hidden='true' />
                            <span className='truncate'>{t('row.lostAccess')}</span>
                        </span>
                    </WithTooltip>
                ) : null}
            </button>
            <span className='absolute left-0.5 top-0.5'>
                {can ? (
                    <WithTooltip label={t(done ? 'row.reopenHint' : 'row.markDoneHint')}>
                        <button
                            type='button'
                            tabIndex={-1}
                            aria-label={t(done ? 'row.reopen' : 'row.markDone', { title: task.title })}
                            onClick={onToggle}
                            className='flex size-8 items-center justify-center rounded-full [&:hover>span]:border-text-secondary'
                        >
                            {box}
                        </button>
                    </WithTooltip>
                ) : (
                    <WithTooltip label={offline && powers.status ? t('board.offline') : t('row.readOnly')}>
                        <span className='flex size-8 items-center justify-center'>{box}</span>
                    </WithTooltip>
                )}
            </span>
            {offline ? (
                <WithTooltip label={t('board.offline')}>
                    <span className={cn('absolute right-1 top-1.5', !touch && 'opacity-0 group-hover:opacity-100')}>
                        <IconButton
                            label={t('row.more', { title: task.title })}
                            disabled
                            className='size-7 [&_svg]:size-4'
                        >
                            <MoreHorizontal aria-hidden='true' />
                        </IconButton>
                    </span>
                </WithTooltip>
            ) : (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <IconButton
                        label={t('row.more', { title: task.title })}
                        tabIndex={-1}
                        aria-haspopup='menu'
                        aria-expanded={menuOpen}
                        // As a message's ⋯ (MessageRow): while the menu is open the page takes no
                        // pointer, so pressing ⋯ again is "outside" and only closes it.
                        onClick={() => openMenu(null)}
                        className={cn(
                            'absolute right-1 top-1.5 size-7 [&_svg]:size-4',
                            menuOpen
                                ? 'bg-surface-3'
                                : !touch && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                        )}
                    >
                        <MoreHorizontal aria-hidden='true' />
                    </IconButton>
                    {/* What the menu hangs from: the pointer, or the foot of ⋯ (its right edge). */}
                    <DropdownMenuTrigger
                        tabIndex={-1}
                        aria-hidden='true'
                        data-row-menu-anchor=''
                        className='pointer-events-none absolute'
                        style={menuAt ? { left: menuAt.x, top: menuAt.y, width: 0, height: 0 } : MORE_FOOT}
                    />
                    <DropdownMenuContent
                        align={menuAt ? 'start' : 'end'}
                        className='w-[220px]'
                        // Back to the row, whichever way it opened: ↑ ↓ go on from there.
                        onCloseAutoFocus={(event) => {
                            event.preventDefault()
                            rowRef.current?.focus()
                        }}
                    >
                        {powers.status ? (
                            <>
                                <DropdownMenuLabel className='text-label font-semibold uppercase text-text-tertiary'>
                                    {t('menu.status')}
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={status}
                                    onValueChange={(next) => next !== status && onSetStatus(next as TaskStatus)}
                                >
                                    {STATUSES.map((option) => (
                                        <DropdownMenuRadioItem key={option} value={option}>
                                            {t(`status.${option}`)}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </>
                        ) : null}
                        {powers.status ? <DropdownMenuSeparator /> : null}
                        {powers.edit ? (
                            <DropdownMenuItem onSelect={onEdit}>
                                <Pencil aria-hidden='true' />
                                {t('menu.edit')}
                            </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem onSelect={onCopyLink}>
                            <Link aria-hidden='true' />
                            {t('menu.copyLink')}
                        </DropdownMenuItem>
                        {powers.edit ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={onDelete} className='text-danger focus:text-danger'>
                                    <Trash2 aria-hidden='true' />
                                    {t('menu.delete')}
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
        </li>
    )
}
