/**
 * What the app uses from realtime: the AppShell opens the socket and reads
 * which connection Banner to show (S-SHELL-01). Everything else is internal.
 */
export { useRealtimeConnection } from './hooks/useRealtimeConnection'
export { useConnectionBanner } from './hooks/useConnectionBanner'
