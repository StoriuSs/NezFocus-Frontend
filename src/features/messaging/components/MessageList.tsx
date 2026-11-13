import { useState, type FocusEvent } from 'react'
import { ArrowDown, CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { useChatScroll } from '../hooks/useChatScroll'
import type { ChatRow } from '../lib/chat-rows'
import { isOutgoing, type MessageHandlers } from '../types'
import { dayLabel } from '../lib/message-time'
import { ChannelIntro } from './ChannelIntro'
import { DateDivider } from './DateDivider'
import { MessageRow, type EditorState } from './MessageRow'
import { MessageSkeletons } from './MessageSkeletons'

interface MessageListProps {
    channelName: string
    rows: ChatRow[]
    /** Nothing to show yet: first load (`loading`), or it failed (`error`). */
    status: 'ready' | 'loading' | 'error'
    older: { has: boolean; loading: boolean; load: () => void }
    onReload: () => void
    now: Date
    timeZone?: string
    online: boolean
    onRetry: (nonce: string) => unknown
    onDiscard: (nonce: string) => void
    handlers: MessageHandlers
    /** The message being edited, and its editor. */
    editing?: { messageId: string; editor: EditorState }
}

/**
 * The messages of a channel, newest at the bottom (S-CHAT-01): a `log` read
 * out politely as messages arrive (C-10 › Accessibility). The channel's
 * beginning (ChannelIntro) shows above the first message once nothing older
 * is left, so an empty channel has it at the bottom.
 *
 * Tab reaches one message, the newest at first, then the one last focused;
 * ↑ / ↓ go to the one before or after (C-10 › Accessibility, S-CHAT-01 ›
 * Focus).
 */
export function MessageList({
    channelName,
    rows,
    status,
    older,
    onReload,
    now,
    timeZone,
    online,
    onRetry,
    onDiscard,
    handlers,
    editing
}: MessageListProps) {
    const { t } = useTranslation('messaging')
    const { list, onScroll, away, newCount, toBottom } = useChatScroll(rows, older)
    const [focused, setFocused] = useState<string>()
    // The messages drawn: a system message is not one yet (it draws nothing before L10).
    const keys = rows.flatMap((row) =>
        row.kind === 'message' && (isOutgoing(row.message) || row.message.type === 'regular') ? [row.key] : []
    )
    const tabbable = focused && keys.includes(focused) ? focused : keys.at(-1)

    const focusIn = (event: FocusEvent<HTMLElement>) => {
        const key = (event.target as HTMLElement).closest('article')?.dataset.rowKey
        if (key) setFocused(key)
    }

    if (status === 'error') {
        return (
            <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center'>
                <CloudOff className='size-8 text-text-tertiary' aria-hidden='true' />
                <p className='text-body text-text-secondary'>{t('list.loadError')}</p>
                <Button variant='secondary' onClick={onReload}>
                    {t('list.retry')}
                </Button>
            </div>
        )
    }

    return (
        <div className='relative min-h-0 flex-1'>
            <div
                ref={list}
                onScroll={onScroll}
                onFocus={focusIn}
                role='log'
                aria-label={t('list.label', { channel: channelName })}
                aria-busy={status === 'loading' || older.loading || undefined}
                className='h-full overflow-y-auto'
                // No browser scroll anchoring: useChatScroll keeps the message being read in place.
                // Inline: one element's behaviour, not worth a class in the stylesheet loaded first.
                style={{ overflowAnchor: 'none' }}
            >
                <div className='flex min-h-full flex-col justify-end pb-2'>
                    {status === 'loading' ? (
                        <>
                            <p role='status' className='sr-only'>
                                {t('list.loading')}
                            </p>
                            <MessageSkeletons count={6} />
                        </>
                    ) : (
                        <>
                            {older.loading ? <MessageSkeletons count={2} /> : null}
                            {older.has ? null : <ChannelIntro channelName={channelName} />}
                            {rows.map((row) =>
                                row.kind === 'date' ? (
                                    <DateDivider key={row.key} label={dayLabel(row.at, now, timeZone, t)} />
                                ) : (
                                    <MessageRow
                                        key={row.key}
                                        rowKey={row.key}
                                        message={row.message}
                                        grouped={row.grouped}
                                        now={now}
                                        timeZone={timeZone}
                                        online={online}
                                        onRetry={onRetry}
                                        onDiscard={onDiscard}
                                        handlers={handlers}
                                        editor={editing?.messageId === row.key ? editing.editor : undefined}
                                        tabbable={row.key === tabbable}
                                    />
                                )
                            )}
                        </>
                    )}
                </div>
            </div>
            {away ? (
                <button
                    type='button'
                    onClick={toBottom}
                    aria-label={newCount ? undefined : t('list.toLatest')}
                    className='absolute bottom-0 right-4 flex h-9 items-center gap-1.5 rounded-full border bg-surface-2 px-3 text-label font-semibold text-text-primary shadow-float hover:bg-surface-3'
                >
                    {newCount ? t('list.newMessages', { count: newCount }) : null}
                    <ArrowDown className='size-4' aria-hidden='true' />
                </button>
            ) : null}
        </div>
    )
}
