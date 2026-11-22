import { Coffee, LampDesk, Moon, Pause } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/study'
import { cn } from '@/lib/utils'
import { PHASE_TEXT } from '@/lib/phase-colors'
import type { SessionPhase } from '../types'

const ICONS = { focus: LampDesk, short_break: Coffee, long_break: Moon }

/**
 * The phase, always icon and name (PhaseBadge, C-19): `M` over the ring's
 * number (icon 18, `headline` 600), `S` in lists and the dock (icon 14,
 * `label` 600). In the phase's colour, no ground, no border; paused, the
 * icon `pause` and "Tạm dừng · Tập trung" in `text-secondary`.
 */
export function PhaseBadge({
    phase,
    paused = false,
    size = 'M',
    className
}: {
    phase: SessionPhase
    paused?: boolean
    size?: 'S' | 'M'
    className?: string
}) {
    const { t } = useTranslation('study')
    const Icon = paused ? Pause : ICONS[phase]
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5',
                size === 'M' ? 'text-headline [&_svg]:size-[18px]' : 'text-label font-semibold [&_svg]:size-3.5',
                paused ? 'text-text-secondary' : PHASE_TEXT[phase],
                className
            )}
        >
            <Icon aria-hidden='true' />
            {paused ? t('phase.pausedPhase', { phase: t(`phase.${phase}`) }) : t(`phase.${phase}`)}
        </span>
    )
}
