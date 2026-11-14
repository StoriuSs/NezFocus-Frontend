import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { PopoverAnchor } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useMentionBox } from '../hooks/useMentionBox'
import type { ComposerNames } from '../lib/mention-text'
import { lengthNotice } from '../lib/message-length'
import type { MentionSource } from '../types'
import { MentionSuggest } from './MentionSuggest'

/**
 * Editing in place (C-10 `editing`, S-CHAT-01 `edit-mode`): the text in a
 * box with a 2 `primary` border, and "Esc to cancel · Enter to save" under
 * it. Enter saves, Shift+Enter starts a new line, Esc leaves it as it was.
 * The same counter as the composer; past 2000, Enter saves nothing. The text
 * stays while a save is on its way, and after one that failed. Mentions as
 * in the composer: the box shows the names (`names`, from the message) and
 * saves the tokens, with the same suggestions after @ and #.
 */
export function MessageEditor({
    messageId,
    content,
    names: named,
    saving,
    onSave,
    onCancel,
    source,
    me,
    mentionEveryone
}: {
    messageId: string
    /** As saved, mentions as tokens. */
    content: string
    /** What the box shows for the tokens it can name. */
    names: ComposerNames
    saving: boolean
    onSave: (text: string) => void
    onCancel: () => void
    source: MentionSource
    me: string | undefined
    mentionEveryone: boolean
}) {
    const { t } = useTranslation('messaging')
    const box = useRef<HTMLTextAreaElement>(null)
    const [draft, setDraft] = useState({ text: content, names: named })
    const { text } = draft
    const mention = useMentionBox({
        box,
        text,
        names: draft.names,
        onChange: (next, names) => setDraft({ text: next, names }),
        source,
        me,
        mentionEveryone
    })
    const notice = lengthNotice(text)
    const tooLong = notice !== null && notice.left < 0
    const hint = `edit-hint-${messageId}`

    // The cursor at the end of the text, as if it had just been typed.
    useEffect(() => {
        const field = box.current
        if (!field) return
        field.focus()
        field.setSelectionRange(field.value.length, field.value.length)
    }, [])

    const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (mention.keyDown(event)) return
        if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onCancel()
            return
        }
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
        event.preventDefault()
        if (!tooLong && !saving) onSave(text)
    }

    return (
        <div className='mt-1'>
            <MentionSuggest state={mention.suggest}>
                <PopoverAnchor asChild>
                    <div
                        className={cn(
                            'flex items-end rounded-input border-2 bg-surface-1 px-3',
                            tooLong ? 'border-danger' : 'border-primary'
                        )}
                    >
                        <textarea
                            ref={box}
                            rows={1}
                            value={mention.value}
                            onChange={mention.change}
                            onSelect={mention.select}
                            onBlur={mention.leave}
                            onKeyDown={keyDown}
                            {...mention.aria}
                            readOnly={saving}
                            aria-label={t('edit.label')}
                            aria-describedby={hint}
                            aria-invalid={tooLong || undefined}
                            // At most half the window high, then it scrolls, like the composer.
                            style={{ maxHeight: '50vh' }}
                            className='flex-1 resize-none bg-transparent py-2 text-body text-text-primary [field-sizing:content] focus:outline-none'
                        />
                        {notice ? (
                            <span
                                className={cn(
                                    'shrink-0 py-2 pl-2 text-label',
                                    tooLong ? 'font-semibold text-danger' : 'text-text-tertiary'
                                )}
                            >
                                {tooLong ? `−${-notice.left}` : t('composer.left', { count: notice.left })}
                            </span>
                        ) : null}
                    </div>
                </PopoverAnchor>
            </MentionSuggest>
            <p id={hint} className='mt-1 flex items-center gap-1.5 text-label text-text-secondary'>
                {tooLong ? (
                    <>
                        <CircleAlert className='size-4 shrink-0 text-danger' aria-hidden='true' />
                        <span className='text-danger'>{t('composer.tooLong')}</span>
                    </>
                ) : (
                    t('edit.hint')
                )}
            </p>
        </div>
    )
}
