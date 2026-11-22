import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
// Its classes are the voice stylesheet's: they come with it wherever it shows (the Solo page too).
import '../voice.css'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * A round control of a room (RoomControl, C-21): 48, `surface-2` with a
 * `border` rule, icon 20 `text-primary`; `on` (mic, camera on) `surface-3`;
 * hover one step up. Under it its name (`label` 500 `text-secondary`), except
 * `iconOnly` on the preview page (D-53), where the Tooltip and the
 * accessible name say it. No phase colour, no `primary`.
 *
 * Disabled (no SPEAK, 07 câu L3-c) it stays focusable for its Tooltip, and
 * says it is unavailable. Its name says what a press does ("Unmute"), so it
 * carries no `aria-pressed` besides.
 */
export const RoomControl = forwardRef<
    HTMLButtonElement,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
        icon: ReactNode
        /** The name under the button. */
        label: string
        /** What it does now, with its shortcut: the Tooltip and the accessible name. */
        hint: string
        on?: boolean
        iconOnly?: boolean
    }
>(({ icon, label, hint, on, iconOnly, disabled, className, onClick, ...props }, ref) => {
    const button = (
        <button
            ref={ref}
            type='button'
            aria-label={hint}
            aria-disabled={disabled || undefined}
            onClick={disabled ? undefined : onClick}
            className={cn(
                'inline-flex size-12 shrink-0 items-center justify-center rounded-full border text-text-primary transition-colors duration-micro [&_svg]:size-5',
                on ? 'bg-surface-3' : 'bg-surface-2',
                disabled ? 'text-text-tertiary' : 'hover:bg-surface-3',
                className
            )}
            {...props}
        >
            {icon}
        </button>
    )
    return (
        <div className='flex w-[72px] flex-col items-center gap-1.5'>
            <WithTooltip label={hint}>{button}</WithTooltip>
            {iconOnly ? null : (
                <span className='whitespace-nowrap text-label font-medium text-text-secondary' aria-hidden='true'>
                    {label}
                </span>
            )}
        </div>
    )
})
RoomControl.displayName = 'RoomControl'
