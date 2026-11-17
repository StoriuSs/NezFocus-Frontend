import type { ReactNode } from 'react'
import { WithTooltip } from '@/components/ui/tooltip'

/**
 * Offline, a control that saves is off with "Cần kết nối mạng" in a Tooltip
 * (05 Q10): a disabled button hears no pointer, so the Tooltip is on a box
 * around it.
 */
export function Offline({ offline, label, children }: { offline: boolean; label: string; children: ReactNode }) {
    if (!offline) return children
    return (
        <WithTooltip label={label}>
            <span className='flex'>{children}</span>
        </WithTooltip>
    )
}
