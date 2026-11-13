import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void): () => void {
    window.addEventListener('online', onChange)
    window.addEventListener('offline', onChange)
    return () => {
        window.removeEventListener('online', onChange)
        window.removeEventListener('offline', onChange)
    }
}

/** Whether the browser says it is online, kept up to date: a queued message shows "will send when back online" (S-CHAT-01). */
export function useBrowserOnline(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => navigator.onLine,
        () => true
    )
}
