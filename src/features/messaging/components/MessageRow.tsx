import { memo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { CircleAlert, Clock, CornerUpRight, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { WithTooltip } from '@/components/ui/tooltip'
import { useCountdown } from '@/hooks/useCountdown'
import { cn } from '@/lib/utils'
import { messageTime, messageTimeInFull } from '../lib/message-time'
import { isOutgoing, type ChatMessage, type MessageHandlers, type OutgoingMessage, type RepliedMessage } from '../types'
import { HoverToolbar } from './HoverToolbar'
import { MessageEditor } from './MessageEditor'
import { MessageMenu, type MenuAnchor } from './MessageMenu'

/** The open editor of the message being edited (C-10 `editing`). */
export interface EditorState {
    saving: boolean
    save: (text: string) => void
    cancel: () => void
}

interface MessageRowProps {
    /** The row's key in the list: which message ↑ / ↓ and Tab come back to. */
    rowKey: string
    message: ChatMessage
    /** Under the one before, from the same person: no avatar, no name (C-10 `grouped`). */
    grouped: boolean
    now: Date
    timeZone?: string
    /** The browser online: a queued message shows as sending, else as waiting for the network. */
    online: boolean
    onRetry: (nonce: string) => unknown
    onDiscard: (nonce: string) => void
    handlers: MessageHandlers
    /** Set on the message being edited only. */
    editor?: EditorState
    /** The one message of the list reached with Tab; ↑ / ↓ move from there (C-10 › Accessibility). */
    tabbable: boolean
}

/**
 * One message (C-10 MessageRow): a flat row, avatar 40, name and time, the
 * line of the message it answers, the text as typed (line breaks kept) and
 * "(edited)". A saved message has its toolbar on hover or focus (C-11), and
 * its menu there, on a right-click or on Shift+F10 (S-CHAT-03). A message not
 * saved yet is faded while it is sent, and says what went wrong under it
 * otherwise. Read out as "who, when: what". System messages are drawn once
 * the app writes them (REQ-MSG-08).
 */
export const MessageRow = memo(function MessageRow({
    rowKey,
    message,
    grouped,
    now,
    timeZone,
    online,
    onRetry,
    onDiscard,
    handlers,
    editor,
    tabbable
}: MessageRowProps) {
    const { t } = useTranslation('messaging')
    const [menu, setMenu] = useState<{ anchor: MenuAnchor } | null>(null)
    const openedFrom = useRef<HTMLElement | null>(null)
    if (!isOutgoing(message) && message.type === 'system') return null

    const at = new Date(message.createdAt)
    const author = message.author
    const name = author?.displayName ?? author?.username ?? t('message.deletedAccount')
    const shownTime = grouped ? messageTime(at, at, timeZone, t) : messageTime(at, now, timeZone, t)
    const time = (
        <WithTooltip label={messageTimeInFull(at, timeZone, t)}>
            <time dateTime={message.createdAt} className='text-label text-text-tertiary'>
                {shownTime}
            </time>
        </WithTooltip>
    )
    const outgoing = isOutgoing(message) ? message : undefined
    const saved = isOutgoing(message) ? undefined : message
    // Read as "who, when[, answering whom]: what[ (edited)]" (C-10 › Accessibility).
    const replyName =
        message.replyTo?.author?.displayName ?? message.replyTo?.author?.username ?? t('message.deletedAccount')
    const read = { name, time: shownTime, content: message.content, replyTo: replyName }
    const label =
        (message.replyTo
            ? t(message.replyTo.deleted ? 'message.labelReplyDeleted' : 'message.labelReply', read)
            : t('message.label', read)) + (saved?.editedAt ? ` ${t('message.edited')}` : '')
    // Queued behind another: shown as sending, or as waiting for the network while offline.
    const state = outgoing?.state === 'queued' ? (online ? 'sending' : 'waiting') : outgoing?.state
    const onItsWay = state === 'sending'

    const openMenu = (anchor: MenuAnchor, from: HTMLElement) => {
        openedFrom.current = from
        setMenu({ anchor })
    }
    const contextMenu = (event: MouseEvent<HTMLElement>) => {
        if (!saved || editor) return
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        openMenu({ x: event.clientX - box.left, y: event.clientY - box.top }, event.currentTarget)
    }
    // On the message itself, not on a button or the editor inside it.
    const keyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const all = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('article') ?? [])]
            const next = all[all.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)]
            if (!next) return
            event.preventDefault()
            next.focus()
        } else if (saved && (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) {
            event.preventDefault()
            openMenu(null, event.currentTarget)
        }
    }

    return (
        <article
            data-row-key={rowKey}
            tabIndex={tabbable ? 0 : -1}
            aria-label={label}
            aria-busy={onItsWay || undefined}
            onContextMenu={contextMenu}
            onKeyDown={keyDown}
            className={cn(
                'group relative flex gap-3 px-4 hover:bg-surface-1',
                'focus-visible:bg-surface-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                grouped ? 'py-0.5' : 'mt-2 py-1',
                (menu || editor) && 'bg-surface-1',
                onItsWay && 'opacity-50'
            )}
        >
            <div className='flex w-10 shrink-0 justify-center'>
                {grouped ? (
                    // The grouped message's own time, shown on hover (C-10 › Luật).
                    <span className='pt-1 text-micro opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'>
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
                {message.replyTo ? <ReplyLine quoted={message.replyTo} /> : null}
                {grouped ? null : (
                    <h3 className='flex items-center gap-2'>
                        <span className='truncate text-body font-semibold text-text-primary'>{name}</span>
                        {time}
                    </h3>
                )}
                {saved && editor ? (
                    <MessageEditor
                        messageId={saved.id}
                        content={saved.content}
                        saving={editor.saving}
                        onSave={editor.save}
                        onCancel={editor.cancel}
                    />
                ) : (
                    <p className='whitespace-pre-wrap break-words text-body text-text-primary'>
                        {message.content}
                        {saved?.editedAt ? (
                            <>
                                {' '}
                                <WithTooltip
                                    label={t('message.editedAt', {
                                        time: messageTimeInFull(new Date(saved.editedAt), timeZone, t)
                                    })}
                                >
                                    <span className='text-label text-text-tertiary'>{t('message.edited')}</span>
                                </WithTooltip>
                            </>
                        ) : null}
                    </p>
                )}
                {onItsWay ? <span className='sr-only'>{t('message.sending')}</span> : null}
                {outgoing && !onItsWay ? (
                    <OutgoingLine
                        message={{ ...outgoing, state: state ?? outgoing.state }}
                        onRetry={onRetry}
                        onDiscard={onDiscard}
                    />
                ) : null}
            </div>
            {saved && !editor ? (
                <>
                    <HoverToolbar
                        message={saved}
                        handlers={handlers}
                        menuOpen={menu !== null}
                        onMore={(button) => openMenu(null, button)}
                    />
                    <MessageMenu
                        message={saved}
                        handlers={handlers}
                        open={menu !== null}
                        anchor={menu?.anchor ?? null}
                        onOpenChange={(open) => !open && setMenu(null)}
                        returnFocus={() => openedFrom.current?.focus()}
                    />
                </>
            ) : null}
        </article>
    )
})

/**
 * The message a reply answers (C-10 `reply`): who wrote it and its first
 * line, or "Original message was deleted" once it is. Opening it in the list
 * comes with message links (L4b).
 */
function ReplyLine({ quoted }: { quoted: RepliedMessage }) {
    const { t } = useTranslation('messaging')
    const name = quoted.author?.displayName ?? quoted.author?.username ?? t('message.deletedAccount')
    return (
        <p className='flex min-w-0 items-center gap-1 text-label text-text-tertiary'>
            <CornerUpRight className='size-3.5 shrink-0' aria-hidden='true' />
            {quoted.deleted ? (
                <span>{t('message.replyDeleted')}</span>
            ) : (
                <>
                    <span className='sr-only'>{t('message.replyTo', { name })}</span>
                    <span className='shrink-0 font-semibold text-text-secondary' aria-hidden='true'>
                        {name}
                    </span>
                    <span className='truncate'>{quoted.content}</span>
                </>
            )}
        </p>
    )
}

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
