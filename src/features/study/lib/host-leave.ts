import type { AnySession } from '../types'

/**
 * Leaving asks first only the Host of a session not yet ended, paused too
 * (D-44: the one thing leaving loses is the Host); a manager who is not the
 * Host leaves at once.
 */
export function asksBeforeLeaving(session: AnySession | null | undefined, me: string | undefined): boolean {
    return !!session && !!me && session.hostId === me && session.status !== 'ended'
}
