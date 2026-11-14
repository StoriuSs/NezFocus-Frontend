import { SmilePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { WithTooltip } from '@/components/ui/tooltip'
import type { Message, MessageHandlers } from '../types'
import { ReactionChip } from './ReactionChip'

/**
 * A message's reactions (C-10): its chips in the order first given, wrapping
 * onto more lines, then ☺+ to add one, shown on hover or keyboard focus of
 * the message (with ADD_REACTIONS only). Nothing without reactions: the
 * toolbar's ☺+ adds the first.
 */
export function ReactionBar({
    message,
    handlers,
    onAdd
}: {
    message: Message
    handlers: MessageHandlers
    /** Opens the picker from this ☺+. */
    onAdd: (button: HTMLButtonElement) => void
}) {
    const { t } = useTranslation('messaging')
    if (!message.reactions.length) return null
    const { permissions } = handlers
    return (
        <div role='group' aria-label={t('reactions.label')} className='mt-1 flex flex-wrap gap-1.5'>
            {message.reactions.map((reaction) => (
                <ReactionChip
                    key={reaction.emoji}
                    messageId={message.id}
                    reaction={reaction}
                    me={handlers.me}
                    disabled={!permissions.react}
                    onClick={() => handlers.react(message, reaction.emoji)}
                />
            ))}
            {permissions.addReactions ? (
                <WithTooltip label={t('actions.react')}>
                    <button
                        type='button'
                        aria-label={t('actions.react')}
                        tabIndex={-1}
                        onClick={(event) => onAdd(event.currentTarget)}
                        className='flex h-7 items-center rounded-full bg-surface-2 px-2.5 text-text-secondary opacity-0 hover:bg-surface-3 hover:text-text-primary group-hover:opacity-100 group-has-[:focus-visible]:opacity-100'
                    >
                        <SmilePlus className='size-4' aria-hidden='true' />
                    </button>
                </WithTooltip>
            ) : null}
        </div>
    )
}
