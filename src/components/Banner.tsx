import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BannerProps {
    icon: LucideIcon
    children: ReactNode
    className?: string
    /** A spinning icon, say (`reconnecting`). */
    iconClassName?: string
    /** `block`: a box in a form (AuthShell). `strip`: the 36-high band under a page's Header. */
    variant?: 'block' | 'strip'
}

/**
 * Banner (C-16): one line of news about the page, neutral, no action. In
 * AuthShell it sits at the top of the form block, 400 wide with the input's
 * corners (00-components.md › AuthShell), e.g. why a session ended
 * (S-AUTH-03 `session-revoked`). In the AppShell's content area it is the
 * strip under the Header (ConnectionBanner). A status, read out when it appears.
 */
export function Banner({ icon: Icon, children, className, iconClassName, variant = 'block' }: BannerProps) {
    return (
        <p
            role='status'
            className={cn(
                'flex gap-2 bg-surface-2 text-label text-text-secondary',
                variant === 'block' ? 'rounded-input px-3 py-2' : 'h-9 shrink-0 items-center px-4',
                className
            )}
        >
            <Icon
                className={cn('size-4 shrink-0', variant === 'block' && 'mt-0.5', iconClassName)}
                aria-hidden='true'
            />
            <span>{children}</span>
        </p>
    )
}
