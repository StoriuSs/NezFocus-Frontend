import { useEffect, useState } from 'react'

/**
 * The time now, updated as each minute starts: for a clock that shows hours
 * and minutes and must not lag (the "time there now" line under a time zone,
 * 01-auth.md › S-ONB-01). Waits for the next whole minute rather than ticking
 * every second, so it re-renders once a minute.
 */
export function useMinuteClock(): Date {
    const [now, setNow] = useState(() => new Date())

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        const schedule = () => {
            const current = new Date()
            const untilNextMinute = 60_000 - (current.getTime() % 60_000)
            timer = setTimeout(() => {
                setNow(new Date())
                schedule()
            }, untilNextMinute)
        }
        schedule()
        return () => clearTimeout(timer)
    }, [])

    return now
}
