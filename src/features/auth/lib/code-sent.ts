import { safeSessionStorage } from '@/lib/safe-storage'

/**
 * Which kind of emailed code: the sign-in code (creating an account and
 * signing in with a code, one kind, D-60), or "forgot password"'s.
 */
export type CodeKind = 'sign-in' | 'password-reset'

/** The API sends at most one code email a minute to an address. */
export const RESEND_AFTER_SECONDS = 60

const key = (kind: CodeKind, email: string) => `auth:code-sent:${kind}:${email.trim().toLowerCase()}`

/**
 * Remember that a code was just emailed, in this tab (D-67): the pages that
 * offer to send another count from the real send time, across a reload or a
 * step to another page, rather than starting a fresh minute (or none) each
 * time.
 */
export function recordCodeSent(kind: CodeKind, email: string, now = Date.now()): void {
    safeSessionStorage.set(key(kind, email), String(now))
}

/**
 * When another code of this kind may be sent to the address (a `Date.now()`
 * time), or null when it may now: none was sent in this tab in the last
 * minute.
 */
export function resendAllowedAt(kind: CodeKind, email: string | undefined, now = Date.now()): number | null {
    if (!email) return null
    const sentAt = Number(safeSessionStorage.get(key(kind, email)))
    if (!sentAt) return null
    const allowedAt = sentAt + RESEND_AFTER_SECONDS * 1000
    return allowedAt > now ? allowedAt : null
}

/** Seconds until another code of this kind may be sent to the address; 0 when it may now. */
export function secondsUntilResend(kind: CodeKind, email: string | undefined, now = Date.now()): number {
    const allowedAt = resendAllowedAt(kind, email, now)
    return allowedAt ? Math.ceil((allowedAt - now) / 1000) : 0
}
