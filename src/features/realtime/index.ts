/**
 * What the app uses from realtime: the AppShell opens the socket and reads
 * which connection Banner to show (S-SHELL-01); features that keep data hear
 * its events (`onRealtimeEvent`) and send it signals (`sendRealtimeSignal`).
 * Everything else is internal.
 */
export { useRealtimeConnection } from './hooks/useRealtimeConnection'
export { useConnectionBanner } from './hooks/useConnectionBanner'
export { onRealtimeEvent } from './lib/realtime-events'
// Typing and presence signals to the API (SRS 5.2), and one's own presence (REQ-AUTH-07).
export { sendRealtimeSignal } from './lib/signals'
export { useOwnPresence } from './hooks/useOwnPresence'
