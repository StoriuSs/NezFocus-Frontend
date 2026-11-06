import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info } from 'lucide-react'

interface AuthCardProps {
    title: string
    subtitle?: ReactNode
    /** A message above the form: a notice from the previous step, or an error for the whole form. */
    notice?: ReactNode
    children: ReactNode
    /** Links under the form: "No account yet? Create one". */
    footer?: ReactNode
}

/**
 * The form block every sign-in page shares, inside AuthShell's 400-wide
 * column (C-34): a `title-1` heading, the form, links under it. No card
 * around it: the column is the frame (DESIGN.md: blocks are not wrapped in
 * shadowed cards).
 */
export function AuthCard({ title, subtitle, notice, children, footer }: AuthCardProps) {
    return (
        <div className='space-y-6'>
            <div className='space-y-2'>
                <h1 className='text-title-1 text-text-primary'>{title}</h1>
                {subtitle ? <p className='text-body text-text-secondary'>{subtitle}</p> : null}
            </div>
            {notice}
            {children}
            {footer ? <div className='space-y-2 text-body-sm text-text-secondary'>{footer}</div> : null}
        </div>
    )
}

const NOTICE = {
    info: { icon: Info, className: 'text-text-primary' },
    success: { icon: CircleCheck, className: 'text-success' },
    error: { icon: CircleAlert, className: 'text-danger' }
} as const

/**
 * A message in the form block: `success` after a finished step, `error` for a
 * failure of the whole form. Never colour alone: each tone has its icon
 * (DESIGN.md › Colors).
 */
export function Notice({ tone, children }: { tone: 'info' | 'success' | 'error'; children: ReactNode }) {
    const { icon: Icon, className } = NOTICE[tone]
    return (
        <p
            role={tone === 'error' ? 'alert' : 'status'}
            className='flex gap-2 rounded-input border bg-surface-1 px-3 py-2 text-body-sm text-text-primary'
        >
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-hidden='true' />
            <span>{children}</span>
        </p>
    )
}
