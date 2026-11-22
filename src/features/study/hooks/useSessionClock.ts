import { useEffect, useState } from 'react'
import { serverNow } from '@/lib/server-clock'
import type { AnySession } from '../types'

/**
 * The server's time now (D-18), again as each second of the phase passes
 * while the session runs: the ring counts down from the server's end of the
 * phase, so a phase run on in a sleeping tab is where it really is when the
 * tab wakes (07 › Edge: no catching up on the phases gone by). A Solo
 * waiting for Học tiếp counts down its wait the same way. Still while
 * paused, or with no session.
 */
export function useSessionClock(session: AnySession | null | undefined): number {
    const [now, setNow] = useState(serverNow)
    const running =
        session?.status === 'running'
            ? session.phaseEndsAt
            : session && 'waitingUntil' in session && session.status === 'waiting'
              ? session.waitingUntil
              : null

    useEffect(() => {
        setNow(serverNow())
        if (!running) return
        let timer: ReturnType<typeof setTimeout>
        const tick = () => {
            const current = serverNow()
            setNow(current)
            // On the next whole second of what is left, so the number never lags.
            const left = Date.parse(running) - current
            timer = setTimeout(tick, left > 0 ? (left % 1000 || 1000) + 5 : 1000)
        }
        tick()
        return () => clearTimeout(timer)
    }, [running])

    return now
}
