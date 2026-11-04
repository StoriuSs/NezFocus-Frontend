import { useEffect, useState } from 'react'

/**
 * Seconds until another code may be requested. The API sends at most one code
 * a minute to an address; waiting here saves a refused request, and says why
 * the button is disabled.
 */
export function useResendCooldown(initialSeconds: number) {
    const [remaining, setRemaining] = useState(initialSeconds)

    useEffect(() => {
        if (remaining <= 0) return
        const timer = setTimeout(() => setRemaining((seconds) => seconds - 1), 1000)
        return () => clearTimeout(timer)
    }, [remaining])

    return { remaining, start: (seconds = 60) => setRemaining(seconds) }
}
