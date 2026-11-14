import { useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { CircleAlert, Smile } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { IconButton } from '@/components/ui/icon-button'
import { PopoverTrigger } from '@/components/ui/popover'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useComposerFocus } from '../hooks/useComposerFocus'
import { useDraft } from '../hooks/useDraft'
import { lengthNotice } from '../lib/message-length'
import type { RepliedMessage } from '../types'
import { EmojiPicker } from './EmojiPicker'
import { ReplyBar } from './ReplyBar'

/**
 * Composer (C-12): Enter sends, Shift+Enter starts a new line; the box grows
 * with the text up to half the window, then scrolls. The counter shows with
 * 200 characters left; past 2000, Enter sends nothing. The draft is kept per
 * channel until the tab closes, and stays when the message is not taken.
 * Where the cursor goes: `useComposerFocus`.
 *
 * Replying, a strip above the box says to whom ("Replying to **Tuấn**" ✕),
 * or that the message was deleted meanwhile (it still sends); Esc stops
 * replying. ↑ in the empty box edits one's last message (C-12 › Luật).
 *
 * (☺) at its right opens the emoji picker above the box; the emoji picked
 * goes where the cursor was, and the cursor after it.
 */
export function Composer({
    box,
    userId,
    channelId,
    channelName,
    replyingTo,
    onCancelReply,
    onEditLast,
    onSend
}: {
    /** The box itself: the chat puts the cursor back in it. */
    box: RefObject<HTMLTextAreaElement | null>
    /** Whose draft: none is shared with the next account signed in. */
    userId: string | undefined
    channelId: string
    channelName: string
    /** The message the next one answers (S-CHAT-01 `reply-mode`). */
    replyingTo: RepliedMessage | null
    onCancelReply: () => void
    /** Whether there was a message of one's own to edit. */
    onEditLast: () => boolean
    /**
     * Whether the message was taken: the box empties only then. A promise when
     * that is known later (the newest messages read first): the box keeps the
     * text meanwhile, sends nothing more, and empties once it is taken, unless
     * something else was typed.
     */
    onSend: (text: string) => boolean | Promise<boolean>
}) {
    const { t } = useTranslation('messaging')
    const [text, setText] = useDraft(userId, channelId)
    const [focused, setFocused] = useState(false)
    const [picking, setPicking] = useState(false)
    /** Where the cursor goes once the picker closes. */
    const caret = useRef<number | null>(null)
    /** A message waiting to be taken: Enter sends nothing more meanwhile. */
    const waiting = useRef(false)
    const notice = lengthNotice(text)
    const tooLong = notice !== null && notice.left < 0
    const replyId = `composer-reply-${channelId}`
    const tooLongId = `composer-too-long-${channelId}`

    useComposerFocus(box, channelId)

    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Escape' && replyingTo) {
            event.preventDefault()
            onCancelReply()
            return
        }
        if (event.key === 'ArrowUp' && !text && onEditLast()) {
            event.preventDefault()
            return
        }
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        if (tooLong || !text.trim() || waiting.current) return
        const taken = onSend(text)
        if (typeof taken === 'boolean') {
            if (taken) setText('')
            return
        }
        waiting.current = true
        void taken.then((sent) => {
            waiting.current = false
            if (sent && box.current?.value === text) setText('')
        })
    }

    /** The emoji in place of what was selected, the cursor after it. */
    const insert = (emoji: string) => {
        const start = box.current?.selectionStart ?? text.length
        const end = box.current?.selectionEnd ?? text.length
        setText(text.slice(0, start) + emoji + text.slice(end))
        caret.current = start + emoji.length
    }
    const backToBox = () => {
        const field = box.current
        if (!field) return
        field.focus()
        if (caret.current !== null) field.setSelectionRange(caret.current, caret.current)
        caret.current = null
    }

    return (
        <div className='shrink-0 px-4 pb-4'>
            {replyingTo ? <ReplyBar id={replyId} quoted={replyingTo} onCancel={onCancelReply} /> : null}
            <div
                className={cn(
                    'flex items-end rounded-input border bg-surface-1 px-4',
                    focused ? 'border-primary shadow-[inset_0_0_0_1px_rgb(var(--primary))]' : 'border-border-input',
                    tooLong && 'border-danger shadow-[inset_0_0_0_1px_rgb(var(--danger))]'
                )}
            >
                <textarea
                    ref={box}
                    rows={1}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={keyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    placeholder={t('composer.placeholder', { channel: channelName })}
                    aria-label={t('composer.placeholder', { channel: channelName })}
                    aria-invalid={tooLong || undefined}
                    aria-describedby={
                        [replyingTo && replyId, tooLong && tooLongId].filter(Boolean).join(' ') || undefined
                    }
                    // At most half the window high, then it scrolls (C-12). Inline: a one-off size,
                    // not worth a class in the stylesheet loaded first.
                    style={{ maxHeight: '50vh' }}
                    className='min-h-12 flex-1 resize-none bg-transparent py-3 text-body text-text-primary [field-sizing:content] placeholder:text-text-tertiary focus:outline-none'
                />
                {notice ? (
                    <span
                        className={cn(
                            'shrink-0 py-3 pl-2 text-label',
                            tooLong ? 'font-semibold text-danger' : 'text-text-tertiary'
                        )}
                    >
                        {tooLong ? `−${-notice.left}` : t('composer.left', { count: notice.left })}
                    </span>
                ) : null}
                <EmojiPicker
                    open={picking}
                    onOpenChange={setPicking}
                    onPick={insert}
                    userId={userId}
                    side='top'
                    returnFocus={backToBox}
                >
                    <WithTooltip label={t('emoji.insert')}>
                        <PopoverTrigger asChild>
                            <IconButton label={t('emoji.insert')} className='mb-2 shrink-0'>
                                <Smile aria-hidden='true' />
                            </IconButton>
                        </PopoverTrigger>
                    </WithTooltip>
                </EmojiPicker>
            </div>
            {tooLong ? (
                <p id={tooLongId} className='mt-1 flex items-center gap-1.5 text-label text-danger'>
                    <CircleAlert className='size-4 shrink-0' aria-hidden='true' />
                    {t('composer.tooLong')}
                </p>
            ) : null}
        </div>
    )
}
