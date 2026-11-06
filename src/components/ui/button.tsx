import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Button (C-01 in docs/design/screens/00-components.md). The base's variant
 * names stay, mapped onto the spec's: `default` = primary, `outline` =
 * secondary, `text` = text, `destructive` = danger; `ghost` is a quiet button
 * whose hover lifts the surface one step, as IconButton does.
 * Hover on a filled button lays `overlay-pressed` over it; disabled is
 * `surface-3` with `text-tertiary`, never only faded.
 */
const buttonVariants = cva(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-button text-body-sm font-semibold transition-colors duration-micro disabled:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-on-primary hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] disabled:bg-surface-3 disabled:text-text-tertiary',
                destructive:
                    'bg-danger text-bg hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] disabled:bg-surface-3 disabled:text-text-tertiary',
                outline:
                    'border border-border-input bg-bg text-primary hover:bg-surface-1 disabled:border-border disabled:text-text-tertiary',
                secondary: 'bg-surface-2 text-text-primary hover:bg-surface-3 disabled:text-text-tertiary',
                ghost: 'text-text-secondary hover:bg-surface-2 hover:text-text-primary disabled:text-text-tertiary',
                text: 'text-primary hover:bg-surface-1 disabled:text-text-tertiary',
                link: 'text-primary underline-offset-4 hover:underline disabled:text-text-tertiary'
            },
            size: {
                default: 'h-10 px-4',
                sm: 'h-8 px-3',
                lg: 'h-10 px-6',
                icon: 'size-8 rounded-input'
            }
        },
        defaultVariants: {
            variant: 'default',
            size: 'default'
        }
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button'
        return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
