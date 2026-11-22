import type { ReactNode } from 'react'
import { Pause } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { PHASE_ICONS, PHASE_TEXT, type SessionPhase } from '@/lib/phase-colors'

/**
 * A study phase away from the room's page (PhaseBadge `S`, C-19): icon 14
 * and the phase's name, then what follows it (`children`), all in the
 * phase's colour; paused, `pause` and "Tạm dừng" in `text-secondary`. The
 * shell shows it (the channel list, the dock), so it is here, in the main
 * stylesheet's files and the shell's words (`common`), not in the study
 * feature, whose classes load with the room's page only (D-193). The size
 * of the words is the caller's: `label` 600 in the list, `body-sm` 600 in
 * the dock.
 */
export function PhaseTag({
    phase,
    paused,
    className,
    children
}: {
    phase: SessionPhase
    paused: boolean
    className?: string
    children?: ReactNode
}) {
    const { t } = useTranslation()
    const Icon = paused ? Pause : PHASE_ICONS[phase]
    return (
        <span
            className={cn(
                'inline-flex min-w-0 items-center gap-1.5 font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0',
                paused ? 'text-text-secondary' : PHASE_TEXT[phase],
                className
            )}
        >
            <Icon aria-hidden='true' />
            {/* What follows the name sits a space after it, as words do, not a gap away. */}
            <span className='flex min-w-0'>
                <span className='truncate'>
                    {t(paused ? 'shell.study.phase.paused' : `shell.study.phase.${phase}`)}
                </span>
                {children}
            </span>
        </span>
    )
}
