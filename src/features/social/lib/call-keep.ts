import { wasReloaded } from '@/lib/page-load'
import { safeSessionStorage } from '@/lib/safe-storage'

const KEY = 'social.call'

/**
 * The call this tab made or answered, kept for a reload (REQ-SOCIAL-05,
 * D-255): this tab's storage, so another tab of the account is "in a call
 * in another tab", never joining it by itself.
 */
export function keepCall(callId: string): void {
    safeSessionStorage.set(KEY, callId)
}

export function forgetCall(): void {
    safeSessionStorage.remove(KEY)
}

/** The call this page load goes back into: read once, whatever mounts again meanwhile. */
let pending: string | null | undefined

/**
 * The call to go back into once, on a reload of the tab that held it; taken,
 * so it is asked once. A duplicated tab carries a copy of this storage: not a
 * reload, so it goes back into nothing and drops the copy (as a voice room, D-51).
 */
export function callToRejoin(): string | null {
    if (pending === undefined) {
        const kept = safeSessionStorage.get(KEY)
        forgetCall()
        pending = kept && wasReloaded() ? kept : null
    }
    return pending
}

/** Gone back into, or given up: no later mount tries it. */
export function rejoinCallDone(): void {
    pending = null
}

/** For tests: as a new page load. */
export function resetCallRejoin(): void {
    pending = undefined
}
