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
import { onOtherTab, tellOtherTabs, type TabMessage } from './lib/tab-sync'
import { isSignInFlowPage, sameSitePath, signInPath } from './lib/paths'
import { trackSignOut } from './lib/sign-out-in-flight'
import { flushBeforeSignOut, setTokenSource } from '@/lib/before-sign-out'
import { deletesAtOf, SIGN_OUT_REASONS, signOutReasonOf, type SignOutReason } from './lib/sign-out-reason'

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
/** With the reason `account-deleted`: when the account goes, for the sign-in page's banner (D-141). */
const DELETES_AT_KEY = 'auth:deletes-at'

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
    /**
     * The account has done "complete your account" (D-61). While false, the
     * app's pages send to /welcome: the API refuses them anyway
     * (ACCOUNT_INCOMPLETE). True when signed out, so nothing waits on it.
     */
    isComplete: boolean
    /** A sign-out is under way; nothing should send anyone to sign in. */
    isSigningOut: boolean
    /**
     * Signed in, and its profile on the way: whether the account is complete
     * or waiting to be deleted is not known yet, so the sign-in pages stay as
     * they are rather than move on (an account waiting to be deleted stays on
     * the page, under the restore dialog, with what was typed).
     */
    isLoadingAccount: boolean
    /**
     * When the account is deleted, if its owner asked to delete it (ISO
     * 8601); null otherwise (D-141). While set, signing in stops at the
     * restore dialog: the app's pages send to sign in, where it shows, and
     * the API refuses them anyway (ACCOUNT_PENDING_DELETION).
     */
    deletesAt: string | null
    user: AuthUser | null
    /** Restore the session on page load, if there is one. Resolves true when signed in. */
    initAuth: () => Promise<boolean>
    /** Sign in with an address and password. Rejects with the API's error. */
    signIn: (email: string, password: string) => Promise<void>
    /**
     * Take up a session the API started another way: the emailed code or a
     * password reset answer with tokens, as sign-in does. `account` is what
     * the code's answer says about it, until the profile arrives.
     */
    startSession: (tokens: TokenResponse, account?: { completed: boolean }) => Promise<void>
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
    logout: (reason?: SignOutReason, to?: string, deletesAt?: string) => void
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
    /** The API answered ACCOUNT_INCOMPLETE: open "complete your account" (api-session.ts). */
    markIncomplete: () => void
    /** "Complete your account" is done, here or in another tab (ACCOUNT_ALREADY_COMPLETE). */
    markComplete: () => void
    /** The API answered ACCOUNT_PENDING_DELETION: the account waits to be deleted (api-session.ts). */
    markPendingDeletion: (deletesAt: string) => void
    /** "Restore account" in the restore dialog. Rejects with the API's error. */
    restoreAccount: () => Promise<void>
    /**
     * "Not now" in the restore dialog: the session just opened ends, here and
     * in the other tabs, and the page stays as it is, its form as typed
     * (01-auth.md › Khôi phục tài khoản). Nothing is deleted.
     */
    setRestoreAside: () => void
    /** When the account deleted at the last sign-out goes, for the banner; left in place, like peekSignOutReason. */
    peekDeletesAt: () => string | null
    /**
     * The reason recorded by the last logout, removed as it is read. With
     * `which`, only a reason of that kind is taken; another stays for its
     * reader (the app's toasts, the sign-in page's banner: sign-out-notice.ts).
     */
    takeSignOutReason: (which?: (reason: SignOutReason) => boolean) => SignOutReason | null
    /** The reason recorded by the last logout, left in place: read while rendering, taken in an effect. */
    peekSignOutReason: () => SignOutReason | null
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
/** With it, when the account goes, if its owner asked to delete it (D-141). */
let lastDeletesAt: string | undefined

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
                lastDeletesAt = deletesAtOf(error)
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
 * elsewhere goes to sign in, where a banner says why (S-AUTH-03
 * `session-revoked`), and back to this page afterwards; from a page outside
 * the app, to sign in alone. A password changed elsewhere opens the password
 * way. An account waiting to be deleted goes to sign in, where a banner says
 * until when it can be restored, and not back: the page is gone with the
 * session. One the person ended (or a deleted account) goes home.
 */
function afterSignOut(reason: SignOutReason | undefined): string {
    if (reason === 'account-deleted') return signInPath()
    const ended =
        reason === 'session-expired' ||
        reason === 'password-changed' ||
        reason === 'signed-out-everywhere' ||
        reason === 'signed-out' ||
        reason === 'security'
    if (!ended) return '/'
    const { pathname, search, hash } = window.location
    const back = isSignInFlowPage(pathname) ? undefined : `${pathname}${search}${hash}`
    return signInPath(back, reason === 'password-changed' ? 'password' : undefined)
}

const toAuthUser = (profile: UserProfile): AuthUser => ({
    id: profile.id,
    email: profile.email,
    username: profile.username,
    displayName: profile.displayName,
    roles: profile.roles
})

const PROFILE_KEY = JSON.stringify(userKeys.profile())

// A request sent as the page goes, or just before signing out, takes the
// token as it is: no time to refresh (src/lib/before-sign-out.ts).
setTokenSource(() => accessTokenValidFor(0))

/** This tab's address, to load it again as it is. */
const currentPath = () => `${window.location.pathname}${window.location.search}${window.location.hash}`

export const useAuthStore = create<AuthState>((set, get) => {
    /**
     * A token is in hand: mark the session, then find out who it belongs to.
     * `completed` is what the sign-in already said about the account; without
     * it, and should the profile not arrive, the account counts as complete
     * and the API's ACCOUNT_INCOMPLETE corrects it on the first refusal.
     */
    async function establish(tokens?: TokenResponse, completed = true): Promise<void> {
        if (tokens) setAccessToken(tokens.accessToken, tokens.expiresIn)
        safeLocalStorage.set(HINT_KEY, '1')
        set({ isAuthenticated: true, isSigningOut: false, isComplete: completed, isLoadingAccount: true })
        logoutStarted = false
        try {
            const profile = await fetchProfile()
            // The header and the profile page read this query; seeding it
            // saves them a second request.
            queryClient.setQueryData(userKeys.profile(), profile)
            set({
                user: toAuthUser(profile),
                isComplete: profile.completed,
                deletesAt: profile.deletesAt ?? null,
                isLoadingAccount: false
            })
            setErrorTrackingUser(profile.id)
        } catch {
            // Signed in all the same; the profile query retries on its own.
            set({ isLoadingAccount: false })
        }
    }

    /**
     * Forget the session in this tab only. `keepHint`: the browser still has
     * a session (another tab signed in to another account), so the next page
     * load must take it up.
     */
    function forget({ keepHint = false } = {}): void {
        clearAccessToken()
        if (!keepHint) safeLocalStorage.remove(HINT_KEY)
        set({
            isSigningOut: true,
            isAuthenticated: false,
            isComplete: true,
            isLoadingAccount: false,
            deletesAt: null,
            user: null
        })
        setErrorTrackingUser(undefined)
        // User A's cached data must not stay visible, or be reused, for
        // whoever signs in next in this tab.
        queryClient.clear()
    }

    /** What the sign-in page's banner says next, in this tab (sessionStorage is per tab). */
    function recordSignOut(reason: SignOutReason | undefined, deletesAt: string | undefined): void {
        // A reason from an earlier sign-out must not be said for this one.
        if (reason) safeSessionStorage.set(NOTICE_KEY, reason)
        else safeSessionStorage.remove(NOTICE_KEY)
        if (reason === 'account-deleted' && deletesAt) safeSessionStorage.set(DELETES_AT_KEY, deletesAt)
        else safeSessionStorage.remove(DELETES_AT_KEY)
    }

    function onTabMessage(message: TabMessage): void {
        const { isAuthenticated, user, deletesAt } = get()
        switch (message.type) {
            // Signed out in another tab: land where that tab did, with the same banner.
            case 'signed-out':
                if (!isAuthenticated) return
                recordSignOut(message.reason, message.deletesAt)
                forget()
                hardNavigate(afterSignOut(message.reason))
                return
            case 'signed-in':
                // Pick the session up from the shared cookie.
                if (!isAuthenticated) return void get().initAuth()
                // The cookie now belongs to another account (or one this tab
                // cannot tell apart): this tab's data is someone else's. Load
                // the page again, as the new account.
                if (!message.userId || message.userId !== user?.id) {
                    forget({ keepHint: true })
                    hardNavigate(currentPath())
                }
                return
            // Restored in another tab: this tab's restore dialog closes.
            case 'restored':
                if (isAuthenticated && deletesAt !== null) {
                    set({ deletesAt: null })
                    void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
                }
                return
        }
    }

    onOtherTab(onTabMessage)

    // The profile query is read again after "complete your account" (the
    // username), after a profile edit, after a failed first read: the header,
    // role checks and the password rules read `user`, so keep it in step.
    queryClient.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return
        if (JSON.stringify(event.query.queryKey) !== PROFILE_KEY) return
        const profile = event.query.state.data as UserProfile | undefined
        const { isAuthenticated, user } = get()
        if (profile && isAuthenticated && (!user || user.id === profile.id)) set({ user: toAuthUser(profile) })
    })

    return {
        isAuthenticated: false,
        isComplete: true,
        isSigningOut: false,
        isLoadingAccount: false,
        deletesAt: null,
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
                    if (lastDeletesAt) safeSessionStorage.set(DELETES_AT_KEY, lastDeletesAt)
                }
                return false
            }
            await establish()
            return true
        },

        signIn: async (email, password) => {
            await get().startSession(await authApi.login(email, password))
        },

        startSession: async (tokens, account) => {
            await establish(tokens, account?.completed)
            tellOtherTabs({ type: 'signed-in', userId: get().user?.id })
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
            tellOtherTabs({ type: 'signed-in', userId: get().user?.id })
            return true
        },

        logout: (reason, to = afterSignOut(reason), deletesAt = lastDeletesAt) => {
            if (logoutStarted) return
            logoutStarted = true
            recordSignOut(reason, deletesAt)
            const wasSignedIn = get().isAuthenticated
            // A change still waiting to be sent goes now, with the token in hand.
            flushBeforeSignOut()
            forget()
            tellOtherTabs({
                type: 'signed-out',
                reason,
                deletesAt: reason === 'account-deleted' ? deletesAt : undefined
            })
            // Ends the session on the API and clears the cookie. Best effort:
            // a failure leaves a session that nothing in this browser holds a
            // token for, and it ends by itself.
            const ended = wasSignedIn ? authApi.logout() : Promise.resolve()
            trackSignOut(ended)
            // Never off-site, however `to` is written (`//evil.example`, `/\evil.example`).
            void ended.catch(() => undefined).then(() => hardNavigate(sameSitePath(to) ?? '/'))
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

        markIncomplete: () => {
            if (get().isAuthenticated) set({ isComplete: false })
        },

        markComplete: () => {
            set({ isComplete: true })
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
        },

        markPendingDeletion: (deletesAt) => {
            if (get().isAuthenticated) set({ deletesAt })
        },

        restoreAccount: async () => {
            await authApi.restoreAccount()
            set({ deletesAt: null })
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
            // Another tab of this browser shows the restore dialog too.
            tellOtherTabs({ type: 'restored' })
        },

        setRestoreAside: () => {
            flushBeforeSignOut()
            forget()
            set({ isSigningOut: false })
            tellOtherTabs({ type: 'signed-out' })
            // Ends the session on the API and clears the cookie, best effort
            // as in logout; this page stays, and signing in again from it
            // waits for this answer (sign-out-in-flight.ts).
            const ended = authApi.logout()
            trackSignOut(ended)
            void ended.catch(() => undefined)
        },

        peekDeletesAt: () => safeSessionStorage.get(DELETES_AT_KEY),

        peekSignOutReason: () => {
            const stored = safeSessionStorage.get(NOTICE_KEY)
            return stored && SIGN_OUT_REASONS.has(stored) ? (stored as SignOutReason) : null
        },

        takeSignOutReason: (which) => {
            const reason = get().peekSignOutReason()
            if (reason && which && !which(reason)) return null
            safeSessionStorage.remove(NOTICE_KEY)
            safeSessionStorage.remove(DELETES_AT_KEY)
            return reason
        }
    }
})
