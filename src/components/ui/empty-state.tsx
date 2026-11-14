import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * EmptyState (C-17): an optional mascot, a title, at most two lines of text,
 * and what to do about it. Centred in what holds it. `inline`: inside one
 * part of a page (a panel's "No pinned messages yet"), no mascot, a
 * `headline` title over `body-sm` text.
 */
export function EmptyState({
    mascot,
    title,
    children,
    actions,
    size = 'page',
    className
}: {
    mascot?: ReactNode
    title: string
    children: ReactNode
    actions?: ReactNode
    size?: 'page' | 'inline'
    className?: string
}) {
    const inline = size === 'inline'
    return (
        <section className={cn('flex max-w-[420px] flex-col items-center text-center', className)}>
            {mascot}
            <h2
                className={cn(
                    'font-semibold text-text-primary',
                    inline ? 'text-headline' : 'text-title-2',
                    mascot ? 'mt-4' : undefined
                )}
            >
                {title}
            </h2>
            <p className={cn('mt-2 text-text-secondary', inline ? 'text-body-sm' : 'text-body')}>{children}</p>
            {actions ? <div className='mt-6 flex flex-wrap justify-center gap-3'>{actions}</div> : null}
        </section>
    )
}
