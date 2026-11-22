import { useTranslation } from 'react-i18next'
import '@/i18n/voice'
import { WithTooltip } from '@/components/ui/tooltip'

/**
 * The "+N" seat (ParticipantTile `seat-more`, C-20): 48 on `surface-2`, an
 * `border-input` edge, "+N" in `label` 600, in the 56 frame of a seat. It
 * opens the panel "Người trong phòng" (C-18, 07 `room-13-people`); with no
 * panel to open, it only counts.
 */
export function SeatMore({
    more,
    total,
    onOpen
}: {
    more: number
    total: number
    /** Given the seat, for the focus to come back to as the panel closes. */
    onOpen?: (seat: HTMLButtonElement) => void
}) {
    const { t } = useTranslation('voice')
    const face = (
        <span className='flex size-12 items-center justify-center rounded-full border border-border-input bg-surface-2 text-label font-semibold text-text-primary'>
            +{more}
        </span>
    )
    if (!onOpen) return <span className='flex size-14 items-center justify-center'>{face}</span>
    const label = t('room.allPeople', { count: total })
    return (
        <WithTooltip label={label}>
            <button
                type='button'
                aria-label={label}
                onClick={(event) => onOpen(event.currentTarget)}
                className='flex size-14 items-center justify-center rounded-full'
            >
                {face}
            </button>
        </WithTooltip>
    )
}
