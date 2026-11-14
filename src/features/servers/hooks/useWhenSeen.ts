import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `onSeen` once the element comes into view (or at once, where nothing
 * can tell: no IntersectionObserver). Mount it anew to ask again.
 */
export function useWhenSeen(onSeen: () => void): RefObject<HTMLDivElement | null> {
    const spot = useRef<HTMLDivElement | null>(null)
    const seen = useRef(onSeen)
    useEffect(() => {
        seen.current = onSeen
    })
    useEffect(() => {
        const element = spot.current
        if (!element) return
        if (typeof IntersectionObserver === 'undefined') return seen.current()
        const watch = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) seen.current()
        })
        watch.observe(element)
        return () => watch.disconnect()
    }, [])
    return spot
}
