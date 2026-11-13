import { useEffect } from 'react'
import { env } from '@/config/env'
import { fetchRealtimeTicket } from '../api/realtime.api'
import { endSession } from '../lib/session-end'
import { useRealtimeStore } from '../realtime.store'

/**
 * Opens the tab's socket while the AppShell is up (SRS 5.2), and keeps the
 * connection state the Banner reads (S-SHELL-01): the socket's, and the
 * browser's online / offline.
 *
 * The socket code is fetched after the shell's first paint (import(), its
 * own chunk): the first screen loads over REST as before, and live updates
 * start once `ready` comes. Leaving the shell (signing out) closes it.
 */
export function useRealtimeConnection(): void {
    useEffect(() => {
        const store = useRealtimeStore.getState()
        const online = () => store.setBrowserOnline(true)
        const offline = () => store.setBrowserOnline(false)
        window.addEventListener('online', online)
        window.addEventListener('offline', offline)

        let cancelled = false
        let close: (() => void) | undefined
        const start = setTimeout(() => {
            void import('@/lib/socket').then(({ openSocket }) => {
                if (cancelled) return
                close = openSocket({
                    url: new URL(env.VITE_API_URL).origin,
                    getTicket: fetchRealtimeTicket,
                    onStatus: (status) => useRealtimeStore.getState().setSocket(status),
                    onSessionEnded: endSession
                })
            })
        }, 0)

        return () => {
            cancelled = true
            clearTimeout(start)
            close?.()
            window.removeEventListener('online', online)
            window.removeEventListener('offline', offline)
            useRealtimeStore.getState().reset()
        }
    }, [])
}
