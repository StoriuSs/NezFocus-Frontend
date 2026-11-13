import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * IconButton (C-02): 32 × 32, rounded `input`, icon 16–18 `text-secondary`.
 * Hover lifts the background one step; `on` (a panel it opens is open) is
 * `surface-2` with a `text-primary` icon and `aria-pressed`, unless the
 * caller describes the state with `aria-expanded` instead.
 * Disabled, the icon is `text-tertiary` and hover does nothing.
 * Always has a label for screen readers; wrap it in WithTooltip for sighted
 * users, since the icon alone never explains itself.
 */
export const IconButton = forwardRef<
    HTMLButtonElement,
    ButtonHTMLAttributes<HTMLButtonElement> & { label: string; on?: boolean }
>(({ label, on, className, children, ...props }, ref) => (
    <button
        ref={ref}
        type='button'
        aria-label={label}
        aria-pressed={props['aria-expanded'] === undefined ? on : undefined}
        className={cn(
            'inline-flex size-8 shrink-0 items-center justify-center rounded-input text-text-secondary transition-colors duration-micro hover:bg-surface-2 hover:text-text-primary [&_svg]:size-[18px]',
            // Disabled: the icon dims, nothing lifts (C-02, C-41 ‹ on the first page).
            'disabled:pointer-events-none disabled:text-text-tertiary',
            on && 'bg-surface-2 text-text-primary',
            className
        )}
        {...props}
    >
        {children}
    </button>
))
IconButton.displayName = 'IconButton'
