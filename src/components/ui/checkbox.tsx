import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A checkbox (C-24b): a real `<input type="checkbox">`, drawn as an 18 box
 * with a 2 px `border-input` edge; checked is a `primary` box with a `check`.
 * Put it in a `<label>` with its sentence, so clicking the words ticks it too.
 * Unticked by default.
 */
const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.ComponentProps<'input'>, 'type'>>(
    ({ className, ...props }, ref) => (
        <span className={cn('relative inline-flex size-[18px] shrink-0', className)}>
            <input
                ref={ref}
                type='checkbox'
                className={cn(
                    'peer size-full cursor-pointer appearance-none rounded-badge border-2 border-border-input bg-bg transition-colors duration-micro',
                    'hover:border-text-secondary checked:border-primary checked:bg-primary',
                    'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:border-border'
                )}
                {...props}
            />
            <Check
                className='pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-on-primary peer-checked:block'
                strokeWidth={3}
                aria-hidden='true'
            />
        </span>
    )
)
Checkbox.displayName = 'Checkbox'

export { Checkbox }
