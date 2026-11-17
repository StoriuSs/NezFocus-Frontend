import { useRef, useState, type FocusEvent } from 'react'
import { ArrowDown, CloudOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import { useToastEdge } from '@/hooks/useToastArea'
import { useChatScroll, type ScrollTarget } from '../hooks/useChatScroll'
import { useSeenMessages } from '../hooks/useSeenMessages'
import type { ChatRow } from '../lib/chat-rows'
import { isOutgoing, type ChatMessage, type MessageHandlers } from '../types'
import { dayLabel } from '../lib/message-time'
import { ChannelIntro } from './ChannelIntro'
import { DateDivider } from './DateDivider'
import { MessageRow, type EditorState } from './MessageRow'
import { NewDivider } from './NewDivider'
import { isShownSystem, SystemMessageRow } from './SystemMessageRow'
import { MessageSkeletons } from './MessageSkeletons'

interface MessageListProps {
    channelName: string
    rows: ChatRow[]
    /** Nothing to show yet: first load (`loading`), or it failed (`error`). */
    status: 'ready' | 'loading' | 'error'
    older: { has: boolean; loading: boolean; load: () => void }
    /** Newer messages to read on scrolling down: a history that stops short (opened at a link). */
    newer: { has: boolean; loading: boolean; load: () => void }
    /** Where to scroll: a message a link or a reply line opened, or the bottom (key null) once the newest are back. */
    target?: ScrollTarget
    /** The message lit up for a moment (D-48). */
    highlighted?: string
    onHighlightEnd: () => void
    /** From a history that stops short: back to the newest messages, at the bottom. */
    onToPresent: () => void
    onReload: () => void
    now: Date
    timeZone?: string
    online: boolean
    onRetry: (nonce: string) => unknown
    onDiscard: (nonce: string) => void
    handlers: MessageHandlers
    /** The message being edited, and its editor. */
    editing?: { messageId: string; editor: EditorState }
    /** The first unread message, under "New" (C-10); once it is deleted, the one after it. */
    newFrom?: string
    /** The messages from others after the reader's mark the list holds: the ↓ button's count once opened at "New". */
    unreadHeld?: number
    /** While the reader cannot see the page: following new messages down stops with "New" near the top (D-46). */
    holdNew?: boolean
    /** Told the newest message in view while the reader can see the page (D-46); left out otherwise. */
    onSeen?: (messageId: string) => void
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
 *
 * Opened at an older message (a link), the list stops short of the newest:
 * scrolling down reads them (skeletons at the bottom meanwhile), and ↓ goes
 * back to the newest page at once.
 *
 * "New" stands above the first unread message, which starts a group of its
 * own; where a day begins there too, one line says both (C-10).
 */
export function MessageList({
    channelName,
    rows,
    status,
    older,
    newer,
    target,
    highlighted,
    onHighlightEnd,
    onToPresent,
    onReload,
    now,
    timeZone,
    online,
    onRetry,
    onDiscard,
    handlers,
    editing,
    newFrom,
    unreadHeld = 0,
    holdNew = false,
    onSeen
}: MessageListProps) {
    const { t } = useTranslation('messaging')
    const newKey =
        newFrom === undefined
            ? undefined
            : rows.find((row) => row.kind === 'message' && !isOutgoing(row.message) && row.message.id >= newFrom)?.key
    const { list, onScroll, away, newCount, toBottom } = useChatScroll(rows, older, {
        newer,
        target,
        hold: holdNew ? newKey : undefined
    })
    // Messages come while reading older ones; or opened at "New", those still unread below it.
    const below = Math.max(newCount, unreadHeld)
    // While it shows, toasts sit 8 above it (C-16, 06 message-deleted).
    const toNew = useRef<HTMLButtonElement>(null)
    useToastEdge('liftTop', toNew, away)
    useSeenMessages(list, rows, onSeen)
    const [focused, setFocused] = useState<string>()
    // The messages drawn: a system message only when its words are known.
    const shown = (message: ChatMessage) => isOutgoing(message) || message.type === 'regular' || isShownSystem(message)
    const keys = rows.flatMap((row) => (row.kind === 'message' && shown(row.message) ? [row.key] : []))
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
                aria-busy={status === 'loading' || older.loading || newer.loading || undefined}
                // Positioned: a message's offsetTop is measured from the list's top (useChatScroll).
                className='relative h-full overflow-y-auto'
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
                            {rows.flatMap((row, index) => {
                                if (row.kind === 'date') {
                                    const day = dayLabel(row.at, now, timeZone, t)
                                    return rows[index + 1]?.key === newKey ? (
                                        <NewDivider key={row.key} day={day} />
                                    ) : (
                                        <DateDivider key={row.key} label={day} />
                                    )
                                }
                                const first = row.key === newKey
                                const drawn =
                                    !isOutgoing(row.message) && row.message.type === 'system' ? (
                                        <SystemMessageRow
                                            key={row.key}
                                            rowKey={row.key}
                                            message={row.message}
                                            now={now}
                                            timeZone={timeZone}
                                            tabbable={row.key === tabbable}
                                            onShow={handlers.show}
                                        />
                                    ) : (
                                        <MessageRow
                                            key={row.key}
                                            rowKey={row.key}
                                            message={row.message}
                                            grouped={row.grouped && !first}
                                            now={now}
                                            timeZone={timeZone}
                                            online={online}
                                            onRetry={onRetry}
                                            onDiscard={onDiscard}
                                            handlers={handlers}
                                            editor={editing?.messageId === row.key ? editing.editor : undefined}
                                            tabbable={row.key === tabbable}
                                            highlighted={row.key === highlighted}
                                            onHighlightEnd={onHighlightEnd}
                                        />
                                    )
                                return first && rows[index - 1]?.kind !== 'date'
                                    ? [<NewDivider key={`new-${row.key}`} />, drawn]
                                    : [drawn]
                            })}
                            {newer.loading ? <MessageSkeletons count={2} /> : null}
                        </>
                    )}
                </div>
            </div>
            {away ? (
                <button
                    ref={toNew}
                    type='button'
                    onClick={newer.has ? onToPresent : toBottom}
                    aria-label={below ? undefined : t('list.toLatest')}
                    className='absolute bottom-0 right-4 flex h-9 items-center gap-1.5 rounded-full border bg-surface-2 px-3 text-label font-semibold text-text-primary shadow-float hover:bg-surface-3'
                >
                    {below ? t('list.newMessages', { count: below }) : null}
                    <ArrowDown className='size-4' aria-hidden='true' />
                </button>
            ) : null}
        </div>
    )
}
