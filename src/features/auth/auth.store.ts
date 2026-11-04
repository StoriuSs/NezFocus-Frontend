import axios from 'axios'
import { create } from 'zustand'
import { queryClient } from '@/lib/query-client'
import { safeLocalStorage, safeSessionStorage } from '@/lib/safe-storage'
import { hardNavigate } from '@/lib/navigation'
import { setErrorTrackingUser } from '@/lib/error-tracking'
import { fetchProfile, userKeys, type UserProfile } from '@/features/users'
import { accessTokenValidFor, clearAccessToken, setAccessToken } from './lib/access-token'
import { authApi } from './api/auth.api'
import type { TokenResponse } from './types'
import { onOtherTab, tellOtherTabs } from './lib/tab-sync'
import { isSignInFlowPage, signInPath } from './lib/paths'
import { SIGN_OUT_REASONS, signOutReasonOf, type SignOutReason } from './lib/sign-out-reason'

/**
 * Who is signed in, and the access token their requests carry.
 *
 * The API issues two tokens at sign-in (its docs/auth/sessions-and-tokens.md): a
 * short-lived access token, kept here in memory (access-token.ts), and a
 * refresh token in an httpOnly cookie this code never sees. The browser sends
 * the cookie to /auth/refresh by itself; that is how a reload, or a token
 * about to expire, gets a new access token.
 */

/** Who is signed in — what the header shows and role checks read. */
export interface AuthUser {
    id: string
    email?: string
    username?: string
    displayName?: string
    roles: string[]
}

export type { SignOutReason } from './lib/sign-out-reason'

const NOTICE_KEY = 'auth:sign-out-reason'

/**
 * Set while this browser may have a session. Only decides whether a page load
 * tries to refresh: without it, every visitor who never signed in would cost a
 * refused request per page load. Not a secret — the session is the httpOnly
 * cookie, which scripts cannot read.
 */
const HINT_KEY = 'auth:session'

/** Refresh this long before the access token expires, so no request leaves with one about to die. */
const REFRESH_MARGIN_MS = 60_000

interface AuthState {
    isAuthenticated: boolean
    /** A sign-out is under way; nothing should send anyone to sign in. */
    isSigningOut: boolean
    user: AuthUser | null
    /** Restore the session on page load, if there is one. Resolves true when signed in. */
    initAuth: () => Promise<boolean>
    /**
     * Sign in with an address and password, and the Turnstile answer when the
     * API asks for one. Rejects with the API's error — including 403
     * AUTH_TWO_FACTOR_REQUIRED, which the two-step page finishes.
     */
    signIn: (email: string, password: string, turnstileToken?: string) => Promise<void>
    /**
     * Take up a session the API started another way: confirming the address
     * or resetting the password answer with tokens, as sign-in does.
     */
    startSession: (tokens: TokenResponse) => Promise<void>
    /**
     * Take up a session the API started during a redirect (signing in with
     * Google): only the refresh cookie came back, so trade it for a token.
     * Resolves false if there was no session to take up.
     */
    resumeFromCookie: () => Promise<boolean>
    /**
     * End the session here, on the API, and in the other tabs, then reload at
     * `to` (a path on this site). By default: sign-in, coming back to this
     * page, when the session ended by itself or elsewhere; home otherwise.
     */
    logout: (reason?: SignOutReason, to?: string) => void
    /** An access token for a request: the current one, or a fresh one when it is about to expire. */
    getToken: () => Promise<string | undefined>
    /**
     * A new access token now, whatever the current one's age: after the API
     * refused it. Resolves undefined when the session is over, having signed
     * out with the reason the refresh gave (a password changed elsewhere, say);
     * rejects when the API could not be asked (network, 5xx), which says
     * nothing about the session.
     */
    refreshToken: () => Promise<string | undefined>
    /** The reason recorded by the last logout, removed as it is read. */
    takeSignOutReason: () => SignOutReason | null
}

// Several in-flight requests can fail together (every query 401s once a
// session is revoked). Sign out once, not once per request.
let logoutStarted = false

// One refresh at a time: a page's queries all find the token expiring at
// once, and each refresh uses the cookie up. The API would forgive the
// duplicates (they arrive within its grace window), but there is no reason to
// send them.
let refreshInFlight: Promise<string | undefined> | null = null

/** Why the last refused refresh said the session ended. */
let lastRefusal: SignOutReason = 'session-expired'

function refreshOnce(): Promise<string | undefined> {
    refreshInFlight ??= (async () => {
        try {
            const tokens = await authApi.refresh()
            setAccessToken(tokens.accessToken, tokens.expiresIn)
            return tokens.accessToken
        } catch (error) {
            // 401: the cookie is missing, used up or its session ended.
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                clearAccessToken()
                lastRefusal = signOutReasonOf(error)
                return undefined
            }
            throw error
        } finally {
            refreshInFlight = null
        }
    })()
    return refreshInFlight
}

/**
 * Where a sign-out lands when not told. A session that ended by itself or
 * elsewhere, mid-task, goes to sign in and back to this page afterwards;
 * one the person ended (or a deleted account) goes home.
 */
function afterSignOut(reason: SignOutReason | undefined): string {
    const ended =
        reason === 'session-expired' ||
        reason === 'password-changed' ||
        reason === 'signed-out-everywhere' ||
        reason === 'signed-out' ||
        reason === 'security'
    if (!ended) return '/'
    const { pathname, search, hash } = window.location
    return isSignInFlowPage(pathname) ? '/' : signInPath(`${pathname}${search}${hash}`)
}

const toAuthUser = (profile: UserProfile): AuthUser => ({
    id: profile.id,
    email: profile.email,
    username: profile.username,
    displayName: profile.displayName,
    roles: profile.roles
})

export const useAuthStore = create<AuthState>((set, get) => {
    /** A token is in hand: mark the session, then find out who it belongs to. */
    async function establish(tokens?: TokenResponse): Promise<void> {
        if (tokens) setAccessToken(tokens.accessToken, tokens.expiresIn)
        safeLocalStorage.set(HINT_KEY, '1')
        set({ isAuthenticated: true, isSigningOut: false })
        logoutStarted = false
        try {
            const profile = await fetchProfile()
            // The header, the profile page and the username prompt read this
            // query; seeding it saves them a second request.
            queryClient.setQueryData(userKeys.profile(), profile)
            set({ user: toAuthUser(profile) })
            setErrorTrackingUser(profile.id)
        } catch {
            // Signed in all the same; the profile query retries on its own.
        }
    }

    /** Forget the session in this tab only. */
    function forget(): void {
        clearAccessToken()
        safeLocalStorage.remove(HINT_KEY)
        set({ isSigningOut: true, isAuthenticated: false, user: null })
        setErrorTrackingUser(undefined)
        // User A's cached data must not stay visible, or be reused, for
        // whoever signs in next in this tab.
        queryClient.clear()
    }

    onOtherTab((message) => {
        if (message === 'signed-out' && get().isAuthenticated) {
            forget()
            hardNavigate('/')
        }
        // Another tab signed in: pick the session up from the shared cookie.
        if (message === 'signed-in' && !get().isAuthenticated) void get().initAuth()
    })

    return {
        isAuthenticated: false,
        isSigningOut: false,
        user: null,

        initAuth: async () => {
            if (safeLocalStorage.get(HINT_KEY) !== '1') return false
            let token: string | undefined
            try {
                token = await refreshOnce()
            } catch {
                // The API could not be reached. Keep the hint and show the page
                // signed out; the next load tries again.
                return false
            }
            if (!token) {
                safeLocalStorage.remove(HINT_KEY)
                // Ended while the app was closed: say why, when it is news
                // (a password changed, signed out everywhere), not for an
                // expiry nobody needs telling about.
                if (lastRefusal !== 'session-expired' && lastRefusal !== 'signed-out') {
                    safeSessionStorage.set(NOTICE_KEY, lastRefusal)
                }
                return false
            }
            await establish()
            return true
        },

        signIn: async (email, password, turnstileToken) => {
            await get().startSession(await authApi.login(email, password, turnstileToken))
        },

        startSession: async (tokens) => {
            await establish(tokens)
            tellOtherTabs('signed-in')
        },

        resumeFromCookie: async () => {
            let token: string | undefined
            try {
                token = await refreshOnce()
            } catch {
                return false
            }
            if (!token) return false
            await establish()
            tellOtherTabs('signed-in')
            return true
        },

        logout: (reason, to = afterSignOut(reason)) => {
            if (logoutStarted) return
            logoutStarted = true
            if (reason) safeSessionStorage.set(NOTICE_KEY, reason)
            const wasSignedIn = get().isAuthenticated
            forget()
            tellOtherTabs('signed-out')
            // Ends the session on the API and clears the cookie. Best effort:
            // a failure leaves a session that nothing in this browser holds a
            // token for, and it ends by itself.
            const ended = wasSignedIn ? authApi.logout().catch(() => undefined) : Promise.resolve()
            void ended.then(() => hardNavigate(to.startsWith('/') && !to.startsWith('//') ? to : '/'))
        },

        getToken: async () => {
            if (!get().isAuthenticated) return undefined
            const fresh = accessTokenValidFor(REFRESH_MARGIN_MS)
            if (fresh) return fresh
            try {
                const token = await refreshOnce()
                if (!token) get().logout(lastRefusal)
                return token
            } catch {
                // Could not reach the API to refresh. Send what we have, if it
                // is still valid at all; the request fails on its own otherwise.
                return accessTokenValidFor(0)
            }
        },

        refreshToken: async () => {
            const token = await refreshOnce()
            if (!token) get().logout(lastRefusal)
            return token
        },

        takeSignOutReason: () => {
            const reason = safeSessionStorage.get(NOTICE_KEY) as SignOutReason | null
            safeSessionStorage.remove(NOTICE_KEY)
            return reason && SIGN_OUT_REASONS.has(reason) ? reason : null
        }
    }
})
