import { cn } from '@/lib/utils'

/**
 * The NezFocus mark: the N on Runtime's chest (X-02, DESIGN.md › Logo). The
 * geometry is copied from design/assets/brand/logo-mark.svg, which comes from
 * the nez-mascot project; do not redraw it. `primary`, following the theme.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            viewBox='-17 -18 34 36'
            width={(size * 23) / 24}
            height={size}
            aria-hidden='true'
            className={cn('shrink-0 text-primary', className)}
        >
            <path fill='currentColor' d='M-17,-4 L-10,-12 L0,0 L-14,18 L-17,16 Z M17,4 L10,12 L0,0 L14,-18 L17,-16 Z' />
        </svg>
    )
}

/** The horizontal logo: the mark at 24 and "NezFocus" in `title-2` 700, 8 apart (master `AuthLogo`). */
export function LogoLockup({ className }: { className?: string }) {
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            <LogoMark />
            <span className='text-title-2 font-bold text-text-primary'>NezFocus</span>
        </span>
    )
}
