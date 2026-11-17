import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import { AlarmClockOff, Calendar, CalendarOff, Check, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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

/** What one row may do, worked out by the board from the viewer's rights (REQ-TASK-02). */
export interface RowPowers {
    status: boolean
    edit: boolean
}

/**
 * TaskRow `board` (C-28): the status box, the title (2 lines then …), the
 * due line, the people on it. The box marks it done, or opens it again; a
 * viewer who may not change it sees a still box with the reason in a
 * Tooltip. ⋯ (on hover or keyboard focus, in place of the avatars; always
 * there on a touch screen), a right click or Shift+F10 open the row's menu:
 * the status (one of three), "Sửa", "Xóa việc", each only for who may (05
 * S-TASK-01 › Menu hàng việc). Offline, nothing that saves works (05 Q10).
 */
export function TaskRow({
    task,
    status,
    due,
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
    onDelete
}: {
    task: Task
    /** What the box shows (the status just clicked, while the row stands still). */
    status: TaskStatus
    due: DueLine
    me: string | undefined
    powers: RowPowers
    offline: boolean
    touch: boolean
    /** The row the list's Tab stops on (one for the whole list). */
    active: boolean
    onFocus: () => void
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
    /** Bấm hàng / Enter: the task's detail (S-TASK-02, L4); nothing until then. */
    onOpen?: () => void
    onToggle: () => void
    onSetStatus: (status: TaskStatus) => void
    onEdit: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation('tasks')
    const [menuOpen, setMenuOpen] = useState(false)
    const people = meFirst(task.assignees, me)
    const names = people.map((person) => nameOf(person, t('people.deleted'))).join(', ')
    const done = status === 'done'
    const hasMenu = powers.status || powers.edit
    const can = powers.status && !offline

    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === ' ' && can) {
            event.preventDefault()
            onToggle()
        } else if (hasMenu && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
            event.preventDefault()
            if (!offline) setMenuOpen(true)
        } else onKeyDown(event)
    }
    const contextMenu = (event: MouseEvent<HTMLElement>) => {
        if (!hasMenu || offline) return
        event.preventDefault()
        setMenuOpen(true)
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
                type='button'
                data-task-row={task.id}
                tabIndex={active ? 0 : -1}
                aria-label={t('row.label', {
                    title: task.title,
                    status: t(`status.${status}`),
                    due: due.text,
                    people: names || t('row.unassigned')
                })}
                onClick={onOpen}
                onFocus={onFocus}
                onKeyDown={keyDown}
                onContextMenu={contextMenu}
                className={cn(
                    'flex w-full items-start gap-2 rounded-button py-2 pl-9 pr-2 text-left outline-none hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-primary',
                    menuOpen && 'bg-surface-2'
                )}
            >
                <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span
                        className={cn(
                            'line-clamp-2 break-words text-body-sm font-medium',
                            done ? 'text-text-tertiary line-through' : 'text-text-primary'
                        )}
                    >
                        {task.title}
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
                        <span className='truncate'>{due.text}</span>
                    </span>
                </span>
                <span
                    className={cn(
                        'flex shrink-0 items-center gap-1 pt-0.5',
                        hasMenu && !touch && 'group-focus-within:invisible group-hover:invisible',
                        hasMenu && !touch && menuOpen && 'invisible',
                        hasMenu && touch && 'pr-8'
                    )}
                >
                    {people.length > 0 ? (
                        <AvatarStack people={people} me={me} max={touch ? 1 : 3} />
                    ) : (
                        <span className='text-label text-text-tertiary'>{t('row.unassigned')}</span>
                    )}
                </span>
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
            {hasMenu && offline ? (
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
            ) : hasMenu ? (
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                    <DropdownMenuTrigger asChild>
                        <IconButton
                            label={t('row.more', { title: task.title })}
                            tabIndex={-1}
                            className={cn(
                                'absolute right-1 top-1.5 size-7 [&_svg]:size-4',
                                menuOpen
                                    ? 'bg-surface-3'
                                    : !touch && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                            )}
                        >
                            <MoreHorizontal aria-hidden='true' />
                        </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end' className='w-[220px]'>
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
                        {powers.edit ? (
                            <>
                                {powers.status ? <DropdownMenuSeparator /> : null}
                                <DropdownMenuItem onSelect={onEdit}>
                                    <Pencil aria-hidden='true' />
                                    {t('menu.edit')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={onDelete} className='text-danger focus:text-danger'>
                                    <Trash2 aria-hidden='true' />
                                    {t('menu.delete')}
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : null}
        </li>
    )
}
