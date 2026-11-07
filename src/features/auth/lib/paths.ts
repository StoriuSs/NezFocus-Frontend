/** The auth pages' paths, in one place (01-auth.md › Quy ước: URL). */
export const AUTH_PATHS = {
    signIn: '/login',
    register: '/register',
    /** Enter the emailed code: signs up or signs in (S-AUTH-02, D-60). */
    verify: '/verify',
    /** "Complete your account", before anything else in the app (S-ONB-01, D-61). */
    welcome: '/welcome',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    /** Where the API sends the browser back after signing in with Google. */
    oauthCallback: '/auth/callback',
    settings: '/settings'
} as const

/** The pages outside the app, as opposed to the signed-in settings page. */
export function isSignInFlowPage(pathname: string): boolean {
    return Object.values(AUTH_PATHS).some((path) => path !== AUTH_PATHS.settings && pathname === path)
}

/**
 * Where the auth pages send someone who is signed in, unless told otherwise:
 * the Study page, the app's home (D-124).
 */
const DEFAULT_AFTER_SIGN_IN = '/study'

/**
 * A `?next=` value, made safe to navigate to: a path on this site, never an
 * address elsewhere. Without this check, a link to
 * `/login?next=https://evil.example` would send someone to another site
 * straight after they signed in — a phishing page that looks like the next
 * step.
 */
export function safeNext(value: string | null | undefined): string {
    if (!value) return DEFAULT_AFTER_SIGN_IN
    try {
        const url = new URL(value, window.location.origin)
        if (url.origin !== window.location.origin) return DEFAULT_AFTER_SIGN_IN
        // Never back to an auth page: after signing in, /login is a dead end.
        if (isSignInFlowPage(url.pathname)) return DEFAULT_AFTER_SIGN_IN
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return DEFAULT_AFTER_SIGN_IN
    }
}

/**
 * The query the auth pages pass from step to step (01-auth.md): `next`, where
 * the visitor was heading, and `invite`, an invite link waiting for them. Any
 * other parameter stays on the page that had it.
 */
const FLOW_PARAMS = ['next', 'invite'] as const

/** `path` with the flow's `?next` / `?invite` taken from `search` (a page's `location.search`). */
export function withFlow(path: string, search: string | URLSearchParams): string {
    const from = typeof search === 'string' ? new URLSearchParams(search) : search
    const kept = new URLSearchParams()
    for (const name of FLOW_PARAMS) {
        const value = from.get(name)
        if (value) kept.set(name, value)
    }
    const query = kept.toString()
    return query ? `${path}?${query}` : path
}

/**
 * The sign-in page, coming back to `next` afterwards; `password` opens it on
 * the password (`?method=password`, S-AUTH-03).
 */
export function signInPath(next?: string, method?: 'password'): string {
    const query = new URLSearchParams()
    if (next) query.set('next', next)
    if (method) query.set('method', method)
    const text = query.toString()
    return text ? `${AUTH_PATHS.signIn}?${text}` : AUTH_PATHS.signIn
}

/**
 * Where someone goes once signed in (01-auth.md › Điều hướng sau khi vào được
 * tài khoản): an incomplete account to "complete your account" first, keeping
 * the flow; otherwise to `next`, or home. `search` holds `next` / `invite`.
 */
export function afterSignIn(account: { completed: boolean }, search: string | URLSearchParams): string {
    const params = typeof search === 'string' ? new URLSearchParams(search) : search
    if (!account.completed) return withFlow(AUTH_PATHS.welcome, params)
    return safeNext(params.get('next'))
}
