/**
 * Tells the app's other open tabs about sign-in and sign-out.
 *
 * Tabs share the refresh cookie but each holds its own access token in
 * memory. Without this, signing out in one tab left the others showing the
 * account until their next request was refused; signing in left them showing
 * "Sign in".
 *
 * BroadcastChannel is missing in some embedded browsers; then each tab simply
 * finds out on its next request.
 */
export type TabMessage = 'signed-in' | 'signed-out'

const CHANNEL = 'auth'

let channel: BroadcastChannel | null = null
function open(): BroadcastChannel | null {
    if (channel || typeof BroadcastChannel === 'undefined') return channel
    channel = new BroadcastChannel(CHANNEL)
    return channel
}

export function tellOtherTabs(message: TabMessage): void {
    open()?.postMessage(message)
}

/** Listen to the other tabs. Returns the function that stops listening. */
export function onOtherTab(listener: (message: TabMessage) => void): () => void {
    const current = open()
    if (!current) return () => undefined
    const handler = (event: MessageEvent) => {
        if (event.data === 'signed-in' || event.data === 'signed-out') listener(event.data)
    }
    current.addEventListener('message', handler)
    return () => current.removeEventListener('message', handler)
}
