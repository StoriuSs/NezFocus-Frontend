import { memo, type KeyboardEvent } from 'react'
import { AlarmClock, Pin, UserPlus, type LucideIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { WithTooltip } from '@/components/ui/tooltip'
import { messageTime, messageTimeInFull } from '../lib/message-time'
import { reminderPeople, shortTaskTitle } from '../lib/task-due'
import type { Message } from '../types'

type SystemKey = 'system.pinned' | 'system.joined' | 'system.taskDue24h' | 'system.taskDue2h'

/** The system messages the chat draws, with their icon and words (REQ-MSG-08, D-168). */
const SYSTEM_EVENTS: Record<string, { icon: LucideIcon; key: SystemKey }> = {
    message_pinned: { icon: Pin, key: 'system.pinned' },
    member_joined: { icon: UserPlus, key: 'system.joined' },
    task_due: { icon: AlarmClock, key: 'system.taskDue24h' }
}

/** A due-date reminder's task, as sent (its title then, D-98), and the mark's words. */
interface TaskDue {
    taskId: string
    title: string
    key: SystemKey
}

function taskDueOf(message: Message): TaskDue | null {
    const data = message.systemData
    if (message.systemEvent !== 'task_due' || typeof data?.taskId !== 'string') return null
    return {
        taskId: data.taskId,
        title: typeof data.title === 'string' ? data.title : '',
        key: data.reminder === '2h' ? 'system.taskDue2h' : 'system.taskDue24h'
    }
}

/**
 * "An, Bình, Chi và 4 người khác": up to 3 named, oneself first when on it
 * (05 `reminder-long`); empty when it names no one (an account gone since).
 */
function peopleWords(message: Message, me: string | undefined, t: TFunction<'messaging'>): string {
    const { shown, others } = reminderPeople(message.systemUsers, me)
    const names = shown.map((user) => user.displayName ?? user.username ?? t('message.deletedAccount')).join(', ')
    return others > 0 ? t('system.taskDueOthers', { names, count: others }) : names
}

/** Whether the chat draws this system message: one it knows the words of. */
export const isShownSystem = (message: Message) =>
    message.type === 'system' && message.systemEvent !== null && message.systemEvent in SYSTEM_EVENTS

/**
 * A system message (C-10 `system`): the icon 16 `text-tertiary` in the avatar
 * column, then `body-sm` `text-secondary` with the person's name 600
 * `text-primary`, and the time. "An pinned a message · View": View shows the
 * pinned message, lit up (S-CHAT-03). No toolbar, no menu (C-11); reached
 * with ↑ / ↓ like the other messages.
 *
 * A due-date reminder (05 S-TASK-01 › Tin nhắc hạn): "Còn 24 giờ tới hạn:
 * {task} · An, Chi · Hôm qua 23:59" and Button `text · S` "Xem việc", which
 * opens the task (`onShowTask`; none where no task can open). The task's
 * name 500 `text-primary`, cut at 60 characters; the people as plain words,
 * not mentions. "people · time · Xem việc" never breaks: short of room, it
 * goes down a line whole, and only wider than the column (long names) does
 * it wrap inside. Icon, words and button on lines 28 high.
 * "Xem việc" is named with its task, telling several reminders apart.
 */
export const SystemMessageRow = memo(function SystemMessageRow({
    rowKey,
    message,
    now,
    timeZone,
    tabbable,
    me,
    onShow,
    onShowTask
}: {
    rowKey: string
    message: Message
    now: Date
    timeZone?: string
    tabbable: boolean
    /** Whom a reminder names first, when on the task. */
    me?: string
    onShow: (messageId: string) => void
    /** A task's detail opened on this page (`?task=`, 05 Q6); left out where none can open. */
    onShowTask?: (taskId: string) => void
}) {
    const { t } = useTranslation('messaging')
    const event = SYSTEM_EVENTS[message.systemEvent ?? '']
    if (!event) return null
    const { icon: Icon } = event
    const task = taskDueOf(message)
    const key = task?.key ?? event.key
    const at = new Date(message.createdAt)
    const time = messageTime(at, now, timeZone, t)
    const name = message.systemUser?.displayName ?? message.systemUser?.username ?? t('message.deletedAccount')
    const pinnedId = message.systemEvent === 'message_pinned' ? message.systemData?.messageId : undefined
    const people = task ? peopleWords(message, me, t) : ''
    const said = task
        ? [t(key, { title: task.title }).replace(/<\/?0>/g, ''), people].filter(Boolean).join(' · ')
        : t(key, { name }).replace(/<\/?0>/g, '')
    const moment = (className?: string) => (
        <WithTooltip label={messageTimeInFull(at, timeZone, t)}>
            <time dateTime={message.createdAt} className={className}>
                {time}
            </time>
        </WithTooltip>
    )

    // ↑ / ↓ as on any message (MessageRow).
    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
        const all = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('article') ?? [])]
        const next = all[all.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)]
        if (!next) return
        event.preventDefault()
        next.focus()
    }

    return (
        <article
            data-row-key={rowKey}
            tabIndex={tabbable ? 0 : -1}
            aria-label={t('system.label', { text: said, time })}
            onKeyDown={keyDown}
            className='group mt-2 flex gap-3 px-4 py-1 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
        >
            <div className={`flex ${task ? 'h-7' : 'h-5'} w-10 shrink-0 items-center justify-center`}>
                <Icon className='size-4 text-text-tertiary' aria-hidden='true' />
            </div>
            {task ? (
                <p className='min-w-0 flex-1 text-body-sm leading-7 text-text-secondary'>
                    <Trans
                        t={t}
                        i18nKey={key}
                        values={{ title: shortTaskTitle(task.title) }}
                        components={[<span key='task' className='font-medium text-text-primary' />]}
                    />
                    {' · '}
                    <span className='inline-flex max-w-full flex-wrap items-center gap-x-2'>
                        <span>
                            {people ? `${people} · ` : null}
                            {moment()}
                        </span>
                        {onShowTask ? (
                            <Button
                                variant='text'
                                size='sm'
                                aria-label={t('system.viewTaskLabel', { title: task.title })}
                                onClick={() => onShowTask(task.taskId)}
                                // A shade over the hovered row's surface-1, as C-01 `text` is over the page.
                                className='h-7 px-3 hover:bg-surface-2'
                            >
                                {t('system.viewTask')}
                            </Button>
                        ) : null}
                    </span>
                </p>
            ) : (
                <p className='min-w-0 flex-1 text-body-sm text-text-secondary'>
                    <Trans
                        t={t}
                        i18nKey={key}
                        values={{ name }}
                        components={[<span key='name' className='font-semibold text-text-primary' />]}
                    />
                    {typeof pinnedId === 'string' ? (
                        <>
                            {' · '}
                            <button
                                type='button'
                                aria-label={t('system.viewLabel')}
                                onClick={() => onShow(pinnedId)}
                                className='font-semibold text-text-primary hover:underline'
                            >
                                {t('system.view')}
                            </button>
                        </>
                    ) : null}{' '}
                    {moment('text-label text-text-tertiary')}
                </p>
            )}
        </article>
    )
})
