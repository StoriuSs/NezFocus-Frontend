import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role'> {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
}

/**
 * A switch (C-24a): a 36 × 20 track with a 16 knob. Off: a `surface-3`
 * track with a `border-input` edge and a `text-secondary` knob; on: a
 * `primary` track and an `on-primary` knob. The knob changes side, so the
 * state reads without colour. Name it with `aria-labelledby`, or with a
 * `<label htmlFor>` so clicking the words flips it too.
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
    ({ checked, onCheckedChange, className, ...props }, ref) => (
        <button
            ref={ref}
            type='button'
            role='switch'
            aria-checked={checked}
            onClick={() => onCheckedChange(!checked)}
            className={cn(
                'group inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-micro',
                'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-2',
                checked ? 'border-primary bg-primary' : 'border-border-input bg-surface-3',
                className
            )}
            {...props}
        >
            <span
                aria-hidden='true'
                className={cn(
                    'size-4 rounded-full transition-transform duration-micro group-disabled:bg-text-tertiary',
                    checked ? 'translate-x-[17px] bg-on-primary' : 'translate-x-px bg-text-secondary'
                )}
            />
        </button>
    )
)
Switch.displayName = 'Switch'

export { Switch }
