import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * A text field of several lines (C-22 TextField `multiline`): the one-line
 * Input's edge, colours and states, three lines high, growing with its text
 * to six where the browser can (`field-sizing`), then scrolling.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
    ({ className, ...props }, ref) => {
        return (
            <textarea
                className={cn(
                    'flex min-h-[78px] w-full resize-none rounded-input border border-border-input bg-surface-1 px-3 py-2 text-body-sm text-text-primary transition-colors duration-micro [field-sizing:content] max-h-[138px] placeholder:text-text-tertiary',
                    'hover:border-text-secondary focus:border-primary focus:shadow-[inset_0_0_0_1px_rgb(var(--primary))] focus:outline-none',
                    'aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-[inset_0_0_0_1px_rgb(var(--danger))]',
                    'read-only:border-transparent read-only:bg-surface-2 read-only:text-text-secondary read-only:shadow-none',
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Textarea.displayName = 'Textarea'

export { Textarea }
