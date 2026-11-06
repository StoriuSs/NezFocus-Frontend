import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * A one-line text field (C-22 TextField): 40 high, `surface-1`, a 1 px
 * `border-input` edge. Focus draws the edge 2 px `primary`, with the mouse
 * too; an invalid field draws it 2 px `danger`. The second pixel is an inset
 * shadow, so the text does not move. Read-only (while a form is sending) has
 * no edge on `surface-2`.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    'flex h-10 w-full rounded-input border border-border-input bg-surface-1 px-3 py-2 text-body-sm text-text-primary transition-colors duration-micro',
                    'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary placeholder:text-text-tertiary',
                    'hover:border-text-secondary focus:border-primary focus:shadow-[inset_0_0_0_1px_rgb(var(--primary))] focus:outline-none',
                    'aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_1px_rgb(var(--danger))]',
                    'read-only:border-transparent read-only:bg-surface-2 read-only:text-text-secondary read-only:shadow-none',
                    'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2 disabled:text-text-tertiary',
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = 'Input'

export { Input }
