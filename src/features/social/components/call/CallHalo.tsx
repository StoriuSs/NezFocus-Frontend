import { useEffect, useRef } from 'react'

/** 60% then clear and back, each way `medium` (320ms): the ring of a call ringing (C-49). */
const PULSE: Keyframe[] = [{ opacity: 0.6 }, { opacity: 1 }, { opacity: 0.6 }]
const PULSE_TIMING: KeyframeAnimationOptions = { duration: 640, iterations: Infinity, easing: 'ease-in-out' }

/**
 * The ringing halo (C-49, C-48 `calling`): a `border` ring around the
 * avatar, 60% then clear and back, each way `medium`; with less motion asked
 * for it stands still, clear (DESIGN.md › Giảm chuyển động, D-255). Never
 * `speaking-ring`, never `success`. Fills its frame: the avatar sits in the
 * middle, `width` inside the edge. The pulse is the browser's animation of
 * the element (no keyframes in a stylesheet for one ring).
 */
export function CallHalo({ width = 14 }: { width?: number }) {
    const ring = useRef<HTMLSpanElement>(null)
    const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    useEffect(() => {
        if (still) return
        const animation = ring.current?.animate?.(PULSE, PULSE_TIMING)
        return () => animation?.cancel()
    }, [still])
    return (
        <span
            ref={ring}
            aria-hidden='true'
            style={{ borderWidth: width, opacity: still ? 1 : 0.6 }}
            className='absolute inset-0 rounded-full border-border'
        />
    )
}
