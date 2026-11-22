import { useEffect, useState } from 'react'
import { serverNow } from '@/lib/server-clock'
import { untilMinuteChanges } from '../lib/phases'
import type { AnySession } from '../types'

/**
 * The server's time now (D-18), again each time the minutes left of a
 * running phase say another number ("còn 18 phút" → "còn 17 phút", C-19
 * `list`): a row of the channel list re-renders once a minute, not each
 * second. Still while paused, or with no session.
 */
export function useListClock(session: AnySession | null | undefined): number {
    const [now, setNow] = useState(serverNow)
    const running = session?.status === 'running' ? session.phaseEndsAt : null

    useEffect(() => {
        setNow(serverNow())
        if (!running) return
        let timer: ReturnType<typeof setTimeout>
        const tick = () => {
            const current = serverNow()
            setNow(current)
            const left = Date.parse(running) - current
            if (left > 0) timer = setTimeout(tick, untilMinuteChanges(left) + 5)
        }
        tick()
        return () => clearTimeout(timer)
    }, [running])

    return now
}
