import { memo, type KeyboardEvent } from 'react'
import { Pin, UserPlus, type LucideIcon } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { WithTooltip } from '@/components/ui/tooltip'
import { messageTime, messageTimeInFull } from '../lib/message-time'
import type { Message } from '../types'

/** The system messages the chat draws, with their icon and words (REQ-MSG-08, D-168). */
const SYSTEM_EVENTS: Record<string, { icon: LucideIcon; key: 'system.pinned' | 'system.joined' }> = {
    message_pinned: { icon: Pin, key: 'system.pinned' },
    member_joined: { icon: UserPlus, key: 'system.joined' }
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
 */
export const SystemMessageRow = memo(function SystemMessageRow({
    rowKey,
    message,
    now,
    timeZone,
    tabbable,
    onShow
}: {
    rowKey: string
    message: Message
    now: Date
    timeZone?: string
    tabbable: boolean
    onShow: (messageId: string) => void
}) {
    const { t } = useTranslation('messaging')
    const event = SYSTEM_EVENTS[message.systemEvent ?? '']
    if (!event) return null
    const { icon: Icon, key } = event
    const at = new Date(message.createdAt)
    const time = messageTime(at, now, timeZone, t)
    const name = message.systemUser?.displayName ?? message.systemUser?.username ?? t('message.deletedAccount')
    const pinnedId = message.systemEvent === 'message_pinned' ? message.systemData?.messageId : undefined

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
            aria-label={t('system.label', { text: t(key, { name }).replace(/<\/?0>/g, ''), time })}
            onKeyDown={keyDown}
            className='group mt-2 flex gap-3 px-4 py-1 hover:bg-surface-1 focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
        >
            <div className='flex h-5 w-10 shrink-0 items-center justify-center'>
                <Icon className='size-4 text-text-tertiary' aria-hidden='true' />
            </div>
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
                <WithTooltip label={messageTimeInFull(at, timeZone, t)}>
                    <time dateTime={message.createdAt} className='text-label text-text-tertiary'>
                        {time}
                    </time>
                </WithTooltip>
            </p>
        </article>
    )
})
