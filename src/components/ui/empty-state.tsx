import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * EmptyState (C-17): an optional mascot, a title, at most two lines of text,
 * and what to do about it. Centred in what holds it.
 */
export function EmptyState({
    mascot,
    title,
    children,
    actions,
    className
}: {
    mascot?: ReactNode
    title: string
    children: ReactNode
    actions?: ReactNode
    className?: string
}) {
    return (
        <section className={cn('flex max-w-[420px] flex-col items-center text-center', className)}>
            {mascot}
            <h2 className={cn('text-title-2 font-semibold text-text-primary', mascot ? 'mt-4' : undefined)}>{title}</h2>
            <p className='mt-2 text-body text-text-secondary'>{children}</p>
            {actions ? <div className='mt-6 flex flex-wrap justify-center gap-3'>{actions}</div> : null}
        </section>
    )
}
