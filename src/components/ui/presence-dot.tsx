import { useId } from 'react'
import { cn } from '@/lib/utils'

export type Presence = 'online' | 'idle' | 'dnd' | 'offline'

const COLOUR: Record<Presence, string> = {
    online: 'text-success',
    idle: 'text-warning',
    dnd: 'text-danger',
    offline: 'text-text-tertiary'
}

/**
 * PresenceDot (C-03). The shape carries the meaning, the colour only repeats
 * it: filled dot (online), crescent (idle), dot with a bar (do not disturb),
 * hollow ring (offline). Decorative: the name next to it, or the label of the
 * control it sits on, says the presence in words.
 *
 * `cutout` is a ring in the colour behind the dot (`ring-bg`,
 * `ring-surface-1`) that separates it from the avatar it overlaps.
 */
export function PresenceDot({
    presence,
    size = 10,
    cutout,
    className
}: {
    presence: Presence
    size?: 10 | 14
    cutout?: string
    className?: string
}) {
    const maskId = useId()
    return (
        <svg
            viewBox='0 0 10 10'
            width={size}
            height={size}
            // Inline, so a parent's `[&_svg]:size-4` (menu rows) cannot enlarge it.
            style={{ width: size, height: size }}
            aria-hidden='true'
            data-presence={presence}
            className={cn('shrink-0 rounded-full', COLOUR[presence], cutout && `ring-2 ${cutout}`, className)}
        >
            {presence === 'online' && <circle cx='5' cy='5' r='5' fill='currentColor' />}
            {presence === 'offline' && (
                <circle cx='5' cy='5' r='3.75' fill='none' stroke='currentColor' strokeWidth='2.5' />
            )}
            {(presence === 'idle' || presence === 'dnd') && (
                <>
                    <mask id={maskId}>
                        <rect width='10' height='10' fill='white' />
                        {presence === 'idle' ? (
                            <circle cx='2.5' cy='2.5' r='3.5' fill='black' />
                        ) : (
                            <rect x='2' y='4' width='6' height='2' rx='1' fill='black' />
                        )}
                    </mask>
                    <circle cx='5' cy='5' r='5' fill='currentColor' mask={`url(#${maskId})`} />
                </>
            )}
        </svg>
    )
}
