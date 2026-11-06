import { useEffect, useState } from 'react'

/**
 * Whole seconds left until `until` (a `Date.now()` time), ticking each
 * second; 0 once it has passed, or with no `until`.
 *
 * Counts from a moment, not from a number of seconds: a wait that started on
 * another page, before a reload or in a tab the browser put to sleep still
 * ends when it really ends (01-auth.md › Số, D-67).
 */
export function useCountdown(until: number | null | undefined): number {
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        setNow(Date.now())
        if (!until || until <= Date.now()) return
        const timer = setInterval(() => {
            const current = Date.now()
            setNow(current)
            if (current >= until) clearInterval(timer)
        }, 1000)
        return () => clearInterval(timer)
    }, [until])

    return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0
}
