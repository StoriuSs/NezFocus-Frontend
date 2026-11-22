import { useEffect, useState } from 'react'
import { serverNow } from '@/lib/server-clock'
import { accountTimeZone } from '@/lib/time-zones'
import { dayStartOf } from '../lib/today'

/**
 * The server's time (D-18), again as each day begins in one's zone: the
 * Study page's week is read again and today's column moves on even with no
 * session ticking a clock.
 */
export function useNewDay(): number {
    const [now, setNow] = useState(serverNow)
    const nextDay = dayStartOf(now, accountTimeZone()) + 24 * 3600 * 1000
    useEffect(() => {
        const timer = setTimeout(() => setNow(serverNow()), Math.max(1000, nextDay - serverNow() + 1000))
        return () => clearTimeout(timer)
    }, [nextDay])
    return now
}
