import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { env } from '@/config/env'
import { fetchRealtimeTicket } from '../api/realtime.api'
import type { Presence } from '@/components/ui/presence-dot'
import { startPresenceSignals } from '../lib/presence-signals'
import { emitRealtimeEvent } from '../lib/realtime-events'
import { endSession } from '../lib/session-end'
import { setSignalSender } from '../lib/signals'
import { realtimeKeys } from '../keys'
import { useRealtimeStore } from '../realtime.store'

/**
 * Opens the tab's socket while the AppShell is up (SRS 5.2), and keeps the
 * connection state the Banner reads (S-SHELL-01): the socket's, and the
 * browser's online / offline.
 *
 * The socket code is fetched after the shell's first paint (import(), its
 * own chunk): the first screen loads over REST as before, and live updates
 * start once `ready` comes. What it hears goes to the features listening
 * (`onRealtimeEvent`). Leaving the shell (signing out) closes it.
 *
 * While open, the tab tells its presence (heartbeat, gone unused; REQ-AUTH-07)
 * and features may send signals through it (`sendRealtimeSignal`).
 */
export function useRealtimeConnection(): void {
    const queryClient = useQueryClient()
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
                // The signals start now; what they say before the socket is open is dropped.
                let send: (event: string, data?: object) => void = () => undefined
                const signals = startPresenceSignals((event, data) => send(event, data))
                const socket = openSocket({
                    url: new URL(env.VITE_API_URL).origin,
                    getTicket: fetchRealtimeTicket,
                    onStatus: (status, ready) => {
                        const state = useRealtimeStore.getState()
                        state.setSocket(status)
                        if (status !== 'connected') return
                        const said = (ready as { status?: Presence } | undefined)?.status
                        if (said) queryClient.setQueryData(realtimeKeys.ownPresence(), said)
                        signals.ready()
                        // Live again: what was missed meanwhile is read now (ARCHITECTURE 3.4).
                        emitRealtimeEvent('ready', undefined)
                    },
                    onSessionEnded: endSession,
                    onEvent: emitRealtimeEvent,
                    onPing: () => signals.beat()
                })
                send = socket.send
                setSignalSender(socket.send)
                close = () => {
                    setSignalSender(undefined)
                    signals.stop()
                    socket.close()
                }
            })
        }, 0)

        return () => {
            cancelled = true
            clearTimeout(start)
            close?.()
            window.removeEventListener('online', online)
            window.removeEventListener('offline', offline)
            useRealtimeStore.getState().reset()
            queryClient.removeQueries({ queryKey: realtimeKeys.ownPresence() })
        }
    }, [queryClient])
}
