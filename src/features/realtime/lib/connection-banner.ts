import type { ConnectionNotice } from '@/components/shell/shell-context'

/** What the AppShell knows about its connection. */
export interface ConnectionState {
    /** `navigator.onLine`, kept by the online / offline events. */
    browserOnline: boolean
    /** `idle`: not opened yet (first load); `connected`: `ready` came; `down`: lost or refused. */
    socket: 'idle' | 'connected' | 'down'
    /** When the socket went down (ms since epoch); null when it is not. */
    downSince: number | null
}

/** A socket down this long shows `reconnecting` (C-16): a blip passes unseen. */
export const RECONNECTING_AFTER_MS = 3000

/**
 * Which connection Banner (C-16) the content area shows, if any (S-SHELL-01
 * `reconnecting`, `offline`). Offline wins: no network says more than a lost
 * socket. Never both; none while first loading, and no "reconnected" notice
 * when it comes back.
 */
export function connectionBanner(state: ConnectionState, now: number): ConnectionNotice | null {
    if (!state.browserOnline) return 'offline'
    if (state.socket !== 'down' || state.downSince === null) return null
    return now - state.downSince >= RECONNECTING_AFTER_MS ? 'reconnecting' : null
}
