import { useEffect, useState } from 'react'
import type { ConnectionNotice } from '@/components/shell/shell-context'
import { connectionBanner, RECONNECTING_AFTER_MS } from '../lib/connection-banner'
import { useRealtimeStore } from '../realtime.store'

/** Which connection Banner the content area shows now (S-SHELL-01), redrawn when the 3 s are up. */
export function useConnectionBanner(): ConnectionNotice | null {
    const browserOnline = useRealtimeStore((state) => state.browserOnline)
    const socket = useRealtimeStore((state) => state.socket)
    const downSince = useRealtimeStore((state) => state.downSince)
    const [now, setNow] = useState(() => Date.now())

    useEffect(() => {
        if (downSince === null) return
        const timer = setTimeout(() => setNow(Date.now()), Math.max(0, downSince + RECONNECTING_AFTER_MS - Date.now()))
        return () => clearTimeout(timer)
    }, [downSince])

    return connectionBanner({ browserOnline, socket, downSince }, now)
}
