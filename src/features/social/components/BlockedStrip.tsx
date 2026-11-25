import { useEffect, useRef } from 'react'
import { Ban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/social'
import { Button } from '@/components/ui/button'
import { WithTooltip } from '@/components/ui/tooltip'
import { useToastEdge } from '@/hooks/useToastArea'

/**
 * In the composer's place in a DM with someone I blocked (S-DM-03
 * `blocked-by-me`): `ban` "You blocked {name}" and Unblock (`secondary · S`),
 * no question asked (09 › Bỏ chặn): their messages come back, the composer
 * too, no friendship back (D-107). Off with "You need a connection" while
 * offline. Toasts sit 16 above it, as above the composer (C-16).
 */
export function BlockedStrip({
    name,
    offline,
    unblocking,
    onUnblock
}: {
    name: string
    offline: boolean
    unblocking: boolean
    onUnblock: () => void
}) {
    const { t } = useTranslation('social')
    const bar = useRef<HTMLDivElement>(null)
    useToastEdge('barTop', bar)
    const button = useRef<HTMLButtonElement>(null)
    // Put here from a dialog (Block), focus would fall to the page: Unblock takes it.
    useEffect(() => {
        const focused = document.activeElement
        if (!focused || focused === document.body) button.current?.focus()
    }, [])
    const unblock = (
        <Button
            ref={button}
            size='sm'
            variant='outline'
            disabled={offline || unblocking}
            aria-busy={unblocking || undefined}
            onClick={onUnblock}
        >
            {t('friends.unblock')}
        </Button>
    )
    return (
        <div ref={bar} className='shrink-0 px-4 pb-4'>
            <div className='flex min-h-12 items-center gap-2 rounded-input bg-surface-1 px-3 py-2 text-label text-text-secondary'>
                <Ban className='size-4 shrink-0' aria-hidden='true' />
                <p className='min-w-0 flex-1 truncate'>{t('dm.blocked', { name })}</p>
                {offline ? (
                    <WithTooltip label={t('friends.offline')}>
                        <span>{unblock}</span>
                    </WithTooltip>
                ) : (
                    unblock
                )}
            </div>
        </div>
    )
}
