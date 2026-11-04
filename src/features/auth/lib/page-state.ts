import { useLocation } from 'react-router-dom'

/** What the last step did, for the next page to say. */
export type AuthNotice = 'code-sent' | 'unverified'

/**
 * What one auth page hands the next: the address to prefill, and a notice.
 *
 * Carried in the router's navigation state, not the URL: an address in the
 * query string ends up in the browser's history, the web server's access log
 * and the page URLs error tracking records. The state lives in the tab only.
 * A reload keeps it; a new tab starts without it, which only means typing the
 * address again.
 */
export interface AuthPageState {
    email?: string
    notice?: AuthNotice
}

const NOTICES = new Set<string>(['code-sent', 'unverified'])

/**
 * What the two-step page needs: the challenge from the first step. Absent
 * after Google, whose challenge is in a cookie the page never sees. In the
 * tab's history like the rest: the challenge is worth something only with a
 * code from the app, and only for five minutes. (Where to go afterwards is the
 * URL's `?redirect=`, as on the sign-in page: see twoStepPath.)
 */
export interface TwoStepState {
    challenge?: string
}

export function twoStepState(challenge: string | undefined): TwoStepState {
    return challenge ? { challenge } : {}
}

export function useTwoStepState(): TwoStepState {
    const state = useLocation().state as Record<string, unknown> | null
    return { challenge: typeof state?.challenge === 'string' ? state.challenge : undefined }
}

/** The state for `navigate(path, { state })` or `<Link state>`. */
export function authPageState(email: string | undefined, notice?: AuthNotice): AuthPageState {
    return { ...(email ? { email } : {}), ...(notice ? { notice } : {}) }
}

/** This page's state, checked: history entries can hold anything. */
export function useAuthPageState(): AuthPageState {
    const state = useLocation().state as Record<string, unknown> | null
    return {
        email: typeof state?.email === 'string' ? state.email : undefined,
        notice:
            typeof state?.notice === 'string' && NOTICES.has(state.notice) ? (state.notice as AuthNotice) : undefined
    }
}
