import { useRef } from 'react'
import { MoreHorizontal, Reply } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { IconButton } from '@/components/ui/icon-button'
import { WithTooltip } from '@/components/ui/tooltip'
import { allowedActions } from '../lib/message-permissions'
import type { Message, MessageHandlers } from '../types'

/**
 * HoverToolbar (C-11): IconButtons 28 on `surface-2`, padding 4, at the
 * message's top right, 14 above it. Shown on hover, or while the message
 * holds the keyboard's focus (not a click's). Out of the Tab order: Tab
 * reaches one message, and the same actions are in its menu (Shift+F10).
 * Reply only to who may post; the reaction button comes with reactions (L5).
 */
export function HoverToolbar({
    message,
    handlers,
    menuOpen,
    onMore
}: {
    message: Message
    handlers: MessageHandlers
    menuOpen: boolean
    onMore: (button: HTMLButtonElement) => void
}) {
    const { t } = useTranslation('messaging')
    const more = useRef<HTMLButtonElement>(null)
    const can = allowedActions(handlers.me, handlers.permissions, message)
    const button = 'size-7 hover:bg-surface-3 [&_svg]:size-4'

    return (
        <div
            role='group'
            aria-label={t('actions.toolbar')}
            className={
                'absolute -top-3.5 right-4 flex gap-0.5 rounded-input border bg-surface-2 p-1 shadow-float ' +
                (menuOpen ? '' : 'opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100')
            }
        >
            {can.reply ? (
                <WithTooltip label={t('actions.reply')}>
                    <IconButton
                        label={t('actions.reply')}
                        tabIndex={-1}
                        className={button}
                        onClick={() => handlers.reply(message)}
                    >
                        <Reply aria-hidden='true' />
                    </IconButton>
                </WithTooltip>
            ) : null}
            <WithTooltip label={t('actions.more')}>
                <IconButton
                    ref={more}
                    label={t('actions.more')}
                    tabIndex={-1}
                    aria-haspopup='menu'
                    aria-expanded={menuOpen}
                    className={button}
                    onClick={() => more.current && onMore(more.current)}
                >
                    <MoreHorizontal aria-hidden='true' />
                </IconButton>
            </WithTooltip>
        </div>
    )
}
