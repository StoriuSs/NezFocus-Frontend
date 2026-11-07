import { useLocation } from 'react-router-dom'

/** The page that sent the sign-in code: "Back" returns there (S-AUTH-02). */
export type CodeFrom = 'register' | 'login'

/**
 * What one auth page hands the next: the address to prefill, and which page
 * sent the code.
 *
 * Carried in the router's navigation state, not the URL: an address in the
 * query string ends up in the browser's history, the web server's access log
 * and the page URLs error tracking records. The state lives in the tab only.
 * A reload keeps it; a new tab starts without it, which only means typing the
 * address again (01-auth.md › Trạng thái giữa các trang).
 */
export interface AuthPageState {
    email?: string
    from?: CodeFrom
    /** Signed in with Google just now: "complete your account" says so (S-AUTH-05 `from-google`). */
    via?: 'google'
}

/** The state for `navigate(path, { state })` or `<Link state>`. */
export function authPageState(email: string | undefined, extra: Omit<AuthPageState, 'email'> = {}): AuthPageState {
    return { ...(email ? { email } : {}), ...extra }
}

/** This page's state, checked: history entries can hold anything. */
export function useAuthPageState(): AuthPageState {
    const state = useLocation().state as Record<string, unknown> | null
    return {
        email: typeof state?.email === 'string' ? state.email : undefined,
        from: state?.from === 'register' || state?.from === 'login' ? state.from : undefined,
        via: state?.via === 'google' ? 'google' : undefined
    }
}
