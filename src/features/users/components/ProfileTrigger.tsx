import { Suspense, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
    connectedProfilePopover,
    handOffDialog,
    type ProfilePopover,
    type ProfilePopoverProps,
    type ProfileTarget
} from '../lib/profile-popover'

/**
 * Someone's avatar or name that opens their profile popover (02 S-CHAT-05,
 * D-253): a button around `children`; the Popover (C-15, 320 wide) beside
 * it on the right (`side`: from the right panel on the left, under a
 * Header), turning to the other side at the window's edge. Esc or a click
 * outside closes it, the keyboard back on the button.
 *
 * `label`: the button's name when `children` has none to read (an avatar).
 * `tabbable={false}`: the same person's name beside it is the keyboard's
 * way in, one Tab stop per person.
 *
 * Only the button is here: the popover is the connected one, loaded the
 * first time one opens. Not connected (a feature's own tests), the
 * children are drawn as they were, with nothing to open.
 */
export function ProfileTrigger({
    children,
    className,
    style,
    label,
    tabbable = true,
    side = 'right',
    ...target
}: ProfileTarget & {
    children: ReactNode
    className?: string
    /** One-off sizes the caller keeps inline (a row's height). */
    style?: CSSProperties
    label?: string
    tabbable?: boolean
    side?: ProfilePopoverProps['side']
}) {
    const popover = connectedProfilePopover()
    const [open, setOpen] = useState(false)
    const button = useRef<HTMLButtonElement>(null)
    if (!popover)
        return (
            <span style={style} className={className}>
                {children}
            </span>
        )

    // Closed by Esc (the focus was in the popover, gone with it): back on the button.
    const openChange = (next: boolean) => {
        setOpen(next)
        if (!next)
            requestAnimationFrame(() => {
                if (!document.activeElement || document.activeElement === document.body) button.current?.focus()
            })
    }
    // The dialog is drawn by the AppShell's `ProfileDialogs`: it outlives this opener.
    const handOff = (next: ReactNode | null) => {
        setOpen(false)
        handOffDialog(next)
        if (next === null) requestAnimationFrame(() => button.current?.focus())
    }

    return (
        <>
            <button
                ref={button}
                type='button'
                aria-label={label}
                aria-haspopup='dialog'
                aria-expanded={open}
                tabIndex={tabbable ? undefined : -1}
                style={style}
                className={cn('cursor-pointer text-left', className)}
                onClick={() => setOpen((was) => !was)}
            >
                {children}
            </button>
            {open ? (
                <Suspense fallback={null}>
                    <Drawn
                        draw={popover}
                        {...target}
                        anchor={button}
                        side={side}
                        open={open}
                        onOpenChange={openChange}
                        close={() => setOpen(false)}
                        handOff={handOff}
                    />
                </Suspense>
            ) : null}
        </>
    )
}

/** The connected popover, drawn as a component of its own (its hooks are its own). */
function Drawn({ draw, ...props }: ProfilePopoverProps & { draw: ProfilePopover }) {
    return draw(props)
}
