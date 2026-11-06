import type { ReactNode } from 'react'
import { Clock, Info, Mail, OctagonX, WifiOff, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const ICONS = { info: Info, clock: Clock, mail: Mail, 'wifi-off': WifiOff, 'octagon-x': OctagonX } satisfies Record<
    string,
    LucideIcon
>

export type FormMessageIcon = keyof typeof ICONS

interface FormMessageProps {
    /** `danger`: a failure no field owns. `neutral`: a limit to wait out, or information. */
    tone: 'danger' | 'neutral'
    /** By default `octagon-x` for danger, `info` for neutral. */
    icon?: FormMessageIcon
    children: ReactNode
    className?: string
}

/**
 * The message for a whole form (C-22 › FormMessage), right above its main
 * button: an icon and `body-sm` text, no background. Never colour alone: each
 * tone has its icon (DESIGN.md › Colors). Errors of the form never go to a
 * toast.
 */
export function FormMessage({ tone, icon, children, className }: FormMessageProps) {
    const Icon = ICONS[icon ?? (tone === 'danger' ? 'octagon-x' : 'info')]
    return (
        <p
            role={tone === 'danger' ? 'alert' : 'status'}
            className={cn(
                'flex gap-2 text-body-sm',
                tone === 'danger' ? 'text-danger' : 'text-text-secondary',
                className
            )}
        >
            <Icon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
            <span>{children}</span>
        </p>
    )
}
