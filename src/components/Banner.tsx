import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BannerProps {
    icon: LucideIcon
    children: ReactNode
    className?: string
}

/**
 * Banner (C-16): one line of news about the page, neutral, no action. In
 * AuthShell it sits at the top of the form block, 400 wide with the input's
 * corners (00-components.md › AuthShell), e.g. why a session ended
 * (S-AUTH-03 `session-revoked`). A status, read out when it appears.
 */
export function Banner({ icon: Icon, children, className }: BannerProps) {
    return (
        <p
            role='status'
            className={cn('flex gap-2 rounded-input bg-surface-2 px-3 py-2 text-label text-text-secondary', className)}
        >
            <Icon className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
            <span>{children}</span>
        </p>
    )
}
