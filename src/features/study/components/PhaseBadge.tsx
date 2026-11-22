import { Pause } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { cn } from '@/lib/utils'
import { PHASE_ICONS, PHASE_TEXT } from '@/lib/phase-colors'
import type { SessionPhase } from '../types'

/**
 * The phase on the room's page, always icon and name (PhaseBadge `M`,
 * C-19): over the ring's number and in the compact block (icon 18,
 * `headline` 600). In the phase's colour, no ground, no border; paused, the
 * icon `pause` and "Tạm dừng · Tập trung" in `text-secondary`. Away from the
 * page, `S` is the shell's `PhaseTag` (src/components/shell).
 */
export function PhaseBadge({
    phase,
    paused = false,
    waiting = false,
    className
}: {
    phase: SessionPhase
    paused?: boolean
    /** A Solo after its break (C-19 `waiting`): the break's icon and "Hết giờ nghỉ" in `text-primary`. */
    waiting?: boolean
    className?: string
}) {
    const { t } = useTranslation('study')
    const Icon = paused ? Pause : PHASE_ICONS[phase]
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 text-headline [&_svg]:size-[18px]',
                waiting ? 'text-text-primary' : paused ? 'text-text-secondary' : PHASE_TEXT[phase],
                className
            )}
        >
            <Icon aria-hidden='true' />
            {waiting
                ? t('phase.waiting')
                : paused
                  ? t('phase.pausedPhase', { phase: t(`phase.${phase}`) })
                  : t(`phase.${phase}`)}
        </span>
    )
}
