import { SIGN_OUT_REASONS, type SignOutReason } from './sign-out-reason'

/**
 * Tells the app's other open tabs about sign-in, sign-out and a restored
 * account.
 *
 * Tabs share the refresh cookie but each holds its own access token in
 * memory. Without this, signing out in one tab left the others showing the
 * account until their next request was refused; signing in left them showing
 * "Sign in".
 *
 * - `signed-in`: whose account, so a tab signed in to another account knows
 *   the shared cookie is no longer its own.
 * - `signed-out`: why, and for a deletion until when, so every tab lands on
 *   the same sign-in banner.
 * - `restored`: the account no longer waits to be deleted; another tab's
 *   restore dialog closes.
 *
 * BroadcastChannel is missing in some embedded browsers; then each tab simply
 * finds out on its next request.
 */
export type TabMessage =
    | { type: 'signed-in'; userId?: string }
    | { type: 'signed-out'; reason?: SignOutReason; deletesAt?: string }
    | { type: 'restored' }

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

const optionalString = (value: unknown): value is string | undefined => value === undefined || typeof value === 'string'

/**
 * The message, if it is one this app sends; anything else on the channel (an
 * older version of the app in another tab, say) is ignored.
 */
export function tabMessageOf(data: unknown): TabMessage | null {
    if (typeof data !== 'object' || data === null) return null
    const message = data as Record<string, unknown>
    switch (message.type) {
        case 'signed-in':
            return optionalString(message.userId) ? { type: 'signed-in', userId: message.userId } : null
        case 'signed-out': {
            const { reason, deletesAt } = message
            if (reason !== undefined && !(typeof reason === 'string' && SIGN_OUT_REASONS.has(reason))) return null
            if (!optionalString(deletesAt)) return null
            return { type: 'signed-out', reason: reason as SignOutReason | undefined, deletesAt }
        }
        case 'restored':
            return { type: 'restored' }
        default:
            return null
    }
}

/** Listen to the other tabs. Returns the function that stops listening. */
export function onOtherTab(listener: (message: TabMessage) => void): () => void {
    const current = open()
    if (!current) return () => undefined
    const handler = (event: MessageEvent) => {
        const message = tabMessageOf(event.data)
        if (message) listener(message)
    }
    current.addEventListener('message', handler)
    return () => current.removeEventListener('message', handler)
}
