import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

/**
 * Tooltip (C-02): inverted colours (`text-primary` background, `bg` text) so
 * it stands out on every surface; `label` 500, rounded `input`, the floating
 * shadow. Shown after 500 ms of hover, at once on keyboard focus.
 *
 * One provider wraps the app (App.tsx), so moving from one icon to the next
 * shows the next tooltip without the delay again.
 */
const TooltipProvider = ({ delayDuration = 500, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
    <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
)

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                'z-50 max-w-60 rounded-input bg-text-primary px-2 py-1.5 text-label text-bg shadow-float',
                className
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

/** The common case: `children` (a focusable element) with `label` as its tooltip. */
function WithTooltip({
    label,
    side = 'top',
    children
}: {
    label: React.ReactNode
    side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side']
    children: React.ReactElement
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>{children}</TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    )
}

/**
 * Text cut on one line (`children` is the element with `truncate`), its whole
 * `label` in a Tooltip only while it is cut: a short name shows no tooltip
 * repeating itself (04 long-role-name).
 */
function TooltipWhenCut({
    label,
    side = 'top',
    children
}: {
    label: React.ReactNode
    side?: React.ComponentProps<typeof TooltipPrimitive.Content>['side']
    children: React.ReactElement
}) {
    // The trigger's type; with asChild it is the child (a span), read only for its widths.
    const text = React.useRef<HTMLButtonElement>(null)
    const [open, setOpen] = React.useState(false)
    const cut = () => Boolean(text.current && text.current.scrollWidth > text.current.clientWidth)
    return (
        <Tooltip open={open} onOpenChange={(next) => setOpen(next && cut())}>
            <TooltipTrigger asChild ref={text}>
                {children}
            </TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipWhenCut, WithTooltip }
