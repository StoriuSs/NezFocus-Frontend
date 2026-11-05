/** The auth pages' paths, in one place. */
export const AUTH_PATHS = {
    signIn: '/sign-in',
    signUp: '/sign-up',
    verifyEmail: '/verify-email',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    /** Where the API sends the browser back after signing in with Google. */
    oauthCallback: '/auth/callback',
    settings: '/settings'
} as const

/** The pages for signing in, as opposed to the signed-in settings page. */
export function isSignInFlowPage(pathname: string): boolean {
    return Object.values(AUTH_PATHS).some((path) => path !== AUTH_PATHS.settings && pathname === path)
}

/** Where the auth pages send someone who is already signed in, unless told otherwise. */
const DEFAULT_AFTER_SIGN_IN = '/'

/**
 * A `?redirect=` value, made safe to navigate to: a path on this site, never
 * an address elsewhere. Without this check, a link to
 * `/sign-in?redirect=https://evil.example` would send someone to another site
 * straight after they signed in — a phishing page that looks like the next
 * step.
 */
export function safeRedirect(value: string | null | undefined): string {
    if (!value) return DEFAULT_AFTER_SIGN_IN
    try {
        const url = new URL(value, window.location.origin)
        if (url.origin !== window.location.origin) return DEFAULT_AFTER_SIGN_IN
        // Never back to an auth page: after signing in, /sign-in is a dead end.
        if (isSignInFlowPage(url.pathname)) return DEFAULT_AFTER_SIGN_IN
        return `${url.pathname}${url.search}${url.hash}`
    } catch {
        return DEFAULT_AFTER_SIGN_IN
    }
}

/**
 * `path` keeping `?redirect=`: how the auth pages pass along where the
 * visitor was heading, from one step to the next, to go there once signed in.
 */
export function withRedirect(path: string, redirect: string | null | undefined): string {
    return redirect ? `${path}?redirect=${encodeURIComponent(redirect)}` : path
}

/** The sign-in page, remembering where to come back to. */
export function signInPath(redirect?: string): string {
    return redirect ? `${AUTH_PATHS.signIn}?redirect=${encodeURIComponent(redirect)}` : AUTH_PATHS.signIn
}
