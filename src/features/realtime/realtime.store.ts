import { create } from 'zustand'
import type { ConnectionState } from './lib/connection-banner'

interface RealtimeState extends ConnectionState {
    setSocket: (status: 'connected' | 'down') => void
    setBrowserOnline: (online: boolean) => void
    /** Back to the first-load state: the shell closed its socket (signed out). */
    reset: () => void
}

const initial = (): ConnectionState => ({
    browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
    socket: 'idle',
    downSince: null
})

/**
 * The tab's connection (S-SHELL-01): UI state only, so Zustand, not the
 * query cache (docs/state-management.md). The socket itself is not here.
 */
export const useRealtimeStore = create<RealtimeState>((set, get) => ({
    ...initial(),
    setSocket: (status) => {
        if (status === 'connected') return set({ socket: 'connected', downSince: null })
        // Down again while already down: keep when it first went.
        if (get().socket === 'down') return
        set({ socket: 'down', downSince: Date.now() })
    },
    setBrowserOnline: (online) => set({ browserOnline: online }),
    reset: () => set(initial())
}))
