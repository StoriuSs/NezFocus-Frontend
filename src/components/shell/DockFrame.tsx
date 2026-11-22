import { useRef, useState, type ReactNode } from 'react'
import { useToastEdge } from '@/hooks/useToastArea'
import { cn } from '@/lib/utils'

/** Where a dock sits (C-09): the bottom of the 240 list column from 1024 up, a band across the window below. */
export type DockShape = 'column' | 'strip'

/**
 * The buttons of a dock (C-09, IconButton `filled` of C-02): `surface-3`;
 * hover the overlay of a pressed button, there being no step above it.
 */
export const DOCK_BUTTON =
    'size-8 bg-surface-3 text-text-primary hover:bg-surface-3 hover:bg-[linear-gradient(var(--overlay-pressed),var(--overlay-pressed))] hover:text-text-primary'

/** The dock's words, a link to its page (C-09 › vùng chữ): hover `surface-3`. */
export const dockLinkClass = (shape: DockShape) =>
    cn(
        'flex min-w-0 rounded-input px-1.5 py-1 hover:bg-surface-3',
        shape === 'column' ? 'flex-col gap-1' : 'flex-1 items-center gap-2'
    )

/**
 * The frame of a dock that keeps something running at hand away from its
 * page (InRoomDock, C-09): the voice room's (voice) and one's Solo's
 * (study, D-234), the same look. `column`: the bottom of the channel list,
 * 240 wide (≥ 1024; the column stacks the docks, a room's over a Solo's);
 * `strip`: a 52-high band at the bottom of the window (below 1024), the
 * toasts kept above the highest one (C-16).
 *
 * `children` may read whether the focus is inside the dock: its minutes are
 * read out as they change only then (C-09 › Accessibility).
 */
export function DockFrame({
    shape,
    label,
    children
}: {
    shape: DockShape
    label: string
    children: ReactNode | ((focused: boolean) => ReactNode)
}) {
    const frame = useRef<HTMLElement>(null)
    const [focused, setFocused] = useState(false)
    useToastEdge('barTop', frame, shape === 'strip')
    return (
        <section
            ref={frame}
            aria-label={label}
            onFocus={() => setFocused(true)}
            // Only once the focus leaves the dock, not as it moves from the link to a button.
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false)
            }}
            className={cn(
                'flex shrink-0 border-t bg-surface-2',
                shape === 'column' ? 'flex-col gap-1.5 px-1.5 pb-3 pt-2' : 'h-[52px] items-center gap-3 px-4'
            )}
        >
            {typeof children === 'function' ? children(focused) : children}
        </section>
    )
}
