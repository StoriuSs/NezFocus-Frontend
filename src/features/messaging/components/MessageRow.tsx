import { memo } from 'react'
import { CircleAlert, Clock, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WithTooltip } from '@/components/ui/tooltip'
import { useCountdown } from '@/hooks/useCountdown'
import { cn } from '@/lib/utils'
import { messageTime, messageTimeInFull } from '../lib/message-time'
import { isOutgoing, type ChatMessage, type OutgoingMessage } from '../types'

interface MessageRowProps {
    message: ChatMessage
    /** Under the one before, from the same person: no avatar, no name (C-10 `grouped`). */
    grouped: boolean
    now: Date
    timeZone?: string
    /** The browser online: a queued message shows as sending, else as waiting for the network. */
    online: boolean
    onRetry: (nonce: string) => unknown
    onDiscard: (nonce: string) => void
}

/**
 * One message (C-10 MessageRow): a flat row, avatar 40, name and time, the
 * text as typed (line breaks kept). A message not saved yet is faded while
 * it is sent, and says what went wrong under it otherwise. System messages
 * are drawn once the app writes them (REQ-MSG-08).
 */
export const MessageRow = memo(function MessageRow({
    message,
    grouped,
    now,
    timeZone,
    online,
    onRetry,
    onDiscard
}: MessageRowProps) {
    const { t } = useTranslation('messaging')
    if (!isOutgoing(message) && message.type === 'system') return null

    const at = new Date(message.createdAt)
    const author = message.author
    const name = author?.displayName ?? author?.username ?? t('message.deletedAccount')
    const time = (
        <WithTooltip label={messageTimeInFull(at, timeZone, t)}>
            <time dateTime={message.createdAt} className='text-label text-text-tertiary'>
                {grouped ? messageTime(at, at, timeZone, t) : messageTime(at, now, timeZone, t)}
            </time>
        </WithTooltip>
    )
    const outgoing = isOutgoing(message) ? message : undefined
    // Queued behind another: shown as sending, or as waiting for the network while offline.
    const state = outgoing?.state === 'queued' ? (online ? 'sending' : 'waiting') : outgoing?.state
    const onItsWay = state === 'sending'

    return (
        <article
            className={cn(
                'group flex gap-3 px-4 hover:bg-surface-1',
                grouped ? 'py-0.5' : 'mt-2 py-1',
                onItsWay && 'opacity-50'
            )}
            aria-busy={onItsWay || undefined}
        >
            <div className='flex w-10 shrink-0 justify-center'>
                {grouped ? (
                    // The grouped message's own time, shown on hover (C-10 › Luật).
                    <span className='pt-1 text-micro opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'>
                        {time}
                    </span>
                ) : (
                    <Avatar className='size-10'>
                        <AvatarImage src={author?.avatarUrl ?? undefined} alt='' className='object-cover' />
                        <AvatarFallback className='bg-surface-3 text-body-sm font-semibold text-text-primary'>
                            {name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                )}
            </div>
            <div className='min-w-0 flex-1'>
                {grouped ? null : (
                    <h3 className='flex items-center gap-2'>
                        <span className='truncate text-body font-semibold text-text-primary'>{name}</span>
                        {time}
                    </h3>
                )}
                <p className='whitespace-pre-wrap break-words text-body text-text-primary'>{message.content}</p>
                {onItsWay ? <span className='sr-only'>{t('message.sending')}</span> : null}
                {outgoing && !onItsWay ? (
                    <OutgoingLine
                        message={{ ...outgoing, state: state ?? outgoing.state }}
                        onRetry={onRetry}
                        onDiscard={onDiscard}
                    />
                ) : null}
            </div>
        </article>
    )
})

/** What happened to a message not saved yet (C-10 `failed`, `rate-limited`; S-CHAT-01 "Sẽ gửi khi có mạng"). */
function OutgoingLine({
    message,
    onRetry,
    onDiscard
}: {
    message: OutgoingMessage
    onRetry: (nonce: string) => unknown
    onDiscard: (nonce: string) => void
}) {
    const { t } = useTranslation('messaging')
    const seconds = useCountdown(message.state === 'rate-limited' ? message.retryAt : null)

    if (message.state === 'failed') {
        // Text buttons, primary like the frame's (C-10 `failed`).
        const action = 'font-semibold text-primary hover:underline'
        return (
            <p role='alert' className='mt-1 flex items-center gap-1.5 text-label text-danger'>
                <CircleAlert className='size-4 shrink-0' aria-hidden='true' />
                {t('message.failed')} ·
                <button type='button' className={action} onClick={() => void onRetry(message.nonce)}>
                    {t('message.retry')}
                </button>
                ·
                <button type='button' className={action} onClick={() => onDiscard(message.nonce)}>
                    {t('message.discard')}
                </button>
            </p>
        )
    }
    const Icon = message.state === 'rate-limited' ? Clock : WifiOff
    return (
        <p role='status' className='mt-1 flex items-center gap-1.5 text-label text-text-secondary'>
            <Icon className='size-4 shrink-0' aria-hidden='true' />
            {message.state === 'rate-limited' ? t('message.rateLimited', { count: seconds }) : t('message.waiting')}
        </p>
    )
}
