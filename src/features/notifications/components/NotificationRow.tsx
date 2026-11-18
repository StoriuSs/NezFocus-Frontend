import type { KeyboardEvent, MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, AtSign, Check, ListChecks, Reply, UserX } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/notifications'
import { Avatar, AvatarFallback, AvatarImage, AvatarInitial } from '@/components/ui/avatar'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { NotificationText } from '../lib/notification-text'
import type { Notification } from '../types'

/** The small round of the item's type at the avatar's corner (C-29): `at-sign`, `reply`, `list-checks`. */
const TYPE_ICONS = { mention: AtSign, reply: Reply, task_assigned: ListChecks } as const
/** An item no person is the subject of: its type's square in place of an avatar (C-29). */
const SYSTEM_ICONS = { task_reminder: AlarmClock, task_unassigned: UserX } as const

export interface NotificationRowProps {
    item: Notification
    text: NotificationText
    /** The time column: "21:30", "16/10", "28/12/2025"; and the whole moment for its Tooltip. */
    time: string
    fullTime: string
    /** Where clicking goes: the message, lit up (D-48); a task, on the page one is on (`?task=`). */
    to: string
    /** Opening it takes no step in the history: a task's detail over the page (05 Q6). */
    replace?: boolean
    /** The row keyboard focus is on in the list: the one Tab stop of the list, its buttons after it. */
    current: boolean
    offline: boolean
    onOpen: (event: MouseEvent<HTMLAnchorElement>) => void
    onMarkRead: () => void
    onFocus: () => void
    onKeyDown: (event: KeyboardEvent<HTMLAnchorElement>) => void
    /** Its place in the feed, from 1; how many there are, -1 while more may come. */
    position: number
    setSize: number
}

/**
 * NotificationRow (C-29), a mention, a reply or a task item: the person's
 * avatar 40 with the type's round at its corner, or for an item no one is
 * the subject of (a reminder, a task no one is on) the type's square 40; the title (600 while unread), the message
 * now (2 lines), "#kênh · Server" (1 line, the server's name cut first); on
 * the right the time and, unread, the dot. The whole row is a link to the
 * message (Ctrl / ⌘ opens a tab); hovered or focused, an unread row shows ✓
 * "Đánh dấu đã đọc" for the dot (D-99), off while offline (D-24). Its
 * `article` is named as the row reads: "Chưa đọc. Minh nhắc tới bạn: …".
 */
export function NotificationRow({
    item,
    text,
    time,
    fullTime,
    to,
    replace = false,
    current,
    offline,
    onOpen,
    onMarkRead,
    onFocus,
    onKeyDown,
    position,
    setSize
}: NotificationRowProps) {
    const { t } = useTranslation('notifications')
    const unread = !item.readAt
    const TypeIcon = TYPE_ICONS[item.type as keyof typeof TYPE_ICONS] ?? AtSign
    const SystemIcon = SYSTEM_ICONS[item.type as keyof typeof SYSTEM_ICONS]
    const name = item.actor?.displayName ?? item.actor?.username
    const head = text.content ? `${text.title}: ${text.content}` : text.title
    const tail = [text.place ? `#${text.place.channelName}, ${text.place.serverName}` : null, time]
    const label = `${unread ? `${t('row.unread')} ` : ''}${head}. ${tail.filter(Boolean).join(', ')}`
    const labelId = `notification-${item.id}`
    const markLabel = t('row.markRead')

    return (
        <article
            aria-labelledby={labelId}
            aria-posinset={position}
            aria-setsize={setSize}
            className='group relative flex gap-3 rounded-input px-2 py-3 hover:bg-surface-2 has-[:focus-visible]:bg-surface-2'
        >
            <Link
                id={labelId}
                to={to}
                replace={replace}
                aria-label={label}
                tabIndex={current ? 0 : -1}
                data-notification-row
                onClick={onOpen}
                onFocus={onFocus}
                onKeyDown={onKeyDown}
                className='absolute inset-0 z-[1] rounded-input outline-none focus-visible:ring-2 focus-visible:ring-primary'
            />
            {SystemIcon ? (
                <span
                    aria-hidden='true'
                    data-type-square
                    className='flex size-10 shrink-0 items-center justify-center rounded-input bg-surface-2 text-text-secondary group-hover:bg-surface-3'
                >
                    <SystemIcon className='size-5' />
                </span>
            ) : (
                <span className='relative size-10 shrink-0'>
                    <Avatar className='size-10'>
                        <AvatarImage src={item.actor?.avatarUrl ?? undefined} alt='' className='object-cover' />
                        <AvatarFallback className='bg-surface-3 text-body font-semibold text-text-primary'>
                            <AvatarInitial name={name} />
                        </AvatarFallback>
                    </Avatar>
                    <span
                        aria-hidden='true'
                        className='absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-surface-1 bg-surface-3 text-text-secondary group-hover:border-surface-2'
                    >
                        <TypeIcon className='size-3' />
                    </span>
                </span>
            )}
            <span aria-hidden='true' className='flex min-w-0 flex-1 flex-col gap-0.5'>
                <span className={cn('line-clamp-2 text-body text-text-primary', unread && 'font-semibold')}>
                    {text.title}
                </span>
                {text.content ? (
                    <span className='line-clamp-2 break-words text-body-sm text-text-secondary'>{text.content}</span>
                ) : null}
                {text.place ? (
                    <span className='flex min-w-0 text-label text-text-tertiary'>
                        <span className='min-w-0 shrink-0 truncate'>#{text.place.channelName}</span>
                        <span className='min-w-0 truncate'>&nbsp;· {text.place.serverName}</span>
                    </span>
                ) : null}
            </span>
            <span className='flex shrink-0 flex-col items-end gap-1.5'>
                <WithTooltip label={fullTime}>
                    {/* Above the row's link (over everything else of the row), for its Tooltip: the one spot that opens nothing. */}
                    <time dateTime={item.createdAt} className='relative z-[2] text-label text-text-tertiary'>
                        {time}
                    </time>
                </WithTooltip>
                {unread ? (
                    <>
                        <span
                            aria-hidden='true'
                            className='mt-1.5 size-2 rounded-full bg-primary group-hover:hidden group-has-[:focus-visible]:hidden'
                        />
                        <WithTooltip label={offline ? t('inbox.offline') : markLabel}>
                            <span className='relative z-[2] hidden group-hover:flex group-has-[:focus-visible]:flex'>
                                <IconButton
                                    label={markLabel}
                                    disabled={offline}
                                    tabIndex={current ? 0 : -1}
                                    onClick={() => {
                                        onMarkRead()
                                        // The ✓ goes with the dot: the row keeps the focus.
                                        document.getElementById(labelId)?.focus()
                                    }}
                                    className='size-7 disabled:pointer-events-none disabled:text-text-tertiary'
                                >
                                    <Check />
                                </IconButton>
                            </span>
                        </WithTooltip>
                    </>
                ) : null}
            </span>
        </article>
    )
}
