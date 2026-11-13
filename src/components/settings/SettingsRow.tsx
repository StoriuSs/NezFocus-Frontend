import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * A group of the settings page (C-27): its title (`label` 600, upper case,
 * `text-tertiary`) over its rows, groups 32 apart. No card around it.
 */
export function SettingsGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section aria-labelledby={id} className='space-y-1'>
            <h2 id={id} className='mb-1 text-label font-semibold uppercase text-text-tertiary'>
                {title}
            </h2>
            {children}
        </section>
    )
}

/**
 * A row of a settings page (C-27): the label, a read-only value under it
 * (`value`, never at the far edge of the 720 block), a description, and the
 * control on the right, always visible. Every row so far has two lines or
 * more, which with its padding reaches the 48 the spec asks for.
 */
export function SettingsRow({
    label,
    value,
    description,
    control,
    className
}: {
    label: ReactNode
    value?: ReactNode
    description?: ReactNode
    control?: ReactNode
    className?: string
}) {
    return (
        <div className={cn('flex items-center gap-4 py-2', className)}>
            <div className='min-w-0 flex-1'>
                <div className='text-body-sm text-text-primary'>{label}</div>
                {value ? <div className='truncate text-body-sm text-text-secondary'>{value}</div> : null}
                {description ? <p className='max-w-md text-label text-text-tertiary'>{description}</p> : null}
            </div>
            {control ? <div className='shrink-0'>{control}</div> : null}
        </div>
    )
}

/** A short label that cannot be clicked (C-36): "This device", a role. */
export function Tag({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <span
            className={cn(
                'inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-label text-text-secondary',
                className
            )}
        >
            {children}
        </span>
    )
}
