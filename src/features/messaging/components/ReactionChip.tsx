import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useReactors } from '../api/useReactors'
import { reactorsLabel } from '../lib/reactors-label'
import type { Reaction } from '../types'

/**
 * ReactionChip (C-10): 28 high, padding 10, round, the emoji 16 and the
 * count `label` 600, on `surface-2`; one's own on `surface-3` with a 1px
 * `primary` border. A click gives it or takes one's own back. Its Tooltip
 * names the first three who gave it, asked as it opens. Someone timed out
 * may look, not click (`aria-disabled`, so the Tooltip still shows).
 */
export function ReactionChip({
    messageId,
    reaction,
    me,
    disabled,
    onClick
}: {
    messageId: string
    reaction: Reaction
    me: string | undefined
    disabled: boolean
    onClick: () => void
}) {
    const { t } = useTranslation('messaging')
    const [open, setOpen] = useState(false)
    const { emoji, count } = reaction
    const reactors = useReactors(messageId, emoji, open)

    return (
        <Tooltip open={open} onOpenChange={setOpen}>
            <TooltipTrigger asChild>
                <button
                    type='button'
                    aria-pressed={reaction.me}
                    aria-disabled={disabled || undefined}
                    aria-label={t('reactions.chip', { emoji, count })}
                    onClick={() => !disabled && onClick()}
                    className={cn(
                        'flex h-7 items-center gap-1 rounded-full border px-2.5 text-label font-semibold text-text-secondary',
                        reaction.me ? 'border-primary bg-surface-3' : 'border-transparent bg-surface-2',
                        disabled ? 'cursor-default' : 'hover:bg-surface-3'
                    )}
                >
                    <span className='text-body' aria-hidden='true'>
                        {emoji}
                    </span>
                    <span aria-hidden='true'>{count}</span>
                </button>
            </TooltipTrigger>
            <TooltipContent>{reactorsLabel(reactors.data, emoji, count, me, t)}</TooltipContent>
        </Tooltip>
    )
}
