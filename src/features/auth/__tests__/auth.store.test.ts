import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiError } from '@/test/helpers'

/** The profile query's cache events, as the store listens to them. */
const cache = { listener: undefined as undefined | ((event: unknown) => void) }
const queryClientMock = {
    clear: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryCache: () => ({
        subscribe: (listener: (event: unknown) => void) => {
            cache.listener = listener
            return () => undefined
        }
    })
}
const hardNavigate = vi.fn()
const setErrorTrackingUser = vi.fn()
const authApi = { refresh: vi.fn(), login: vi.fn(), logout: vi.fn(), restoreAccount: vi.fn() }
const fetchProfile = vi.fn()
const tabs = { told: [] as unknown[], listener: undefined as undefined | ((message: unknown) => void) }

vi.mock('@/lib/query-client', () => ({ queryClient: queryClientMock }))
vi.mock('@/lib/navigation', () => ({ hardNavigate }))
vi.mock('@/lib/error-tracking', () => ({ setErrorTrackingUser }))
vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/users', () => ({ fetchProfile, userKeys: { profile: () => ['users', 'profile'] } }))
vi.mock('@/features/auth/lib/tab-sync', () => ({
    tellOtherTabs: (message: unknown) => tabs.told.push(message),
    onOtherTab: (listener: (message: unknown) => void) => {
        tabs.listener = listener
        return () => undefined
    }
}))

const PROFILE = { id: 'user-1', email: 'ada@example.test', username: 'ada', roles: ['user'], completed: true }
const tokens = (accessToken: string, expiresIn = 900) => ({ accessToken, tokenType: 'Bearer' as const, expiresIn })

/** Every value this origin's scripts can read back from storage. */
const storedValues = () =>
    [localStorage, sessionStorage].flatMap((storage) =>
        Array.from({ length: storage.length }, (_, i) => storage.key(i)).map((key) => `${key}=${storage.getItem(key!)}`)
    )

/**
 * The store holds the session: the access token in memory, a hint in
 * localStorage that decides whether a page load asks the API, and the signed-in
 * user. The API behind it is mocked; src/lib/__tests__/api.test.ts covers the
 * client and e2e/account.spec.ts the real thing in a browser.
 */
describe('auth store', () => {
    beforeEach(() => {
        // A fresh store (and access-token module) for each test.
        vi.resetModules()
        vi.useFakeTimers()
        for (const fn of [
            queryClientMock.clear,
            queryClientMock.setQueryData,
            queryClientMock.invalidateQueries,
            hardNavigate,
            setErrorTrackingUser
        ]) {
            fn.mockReset()
        }
        for (const fn of Object.values(authApi)) fn.mockReset()
        fetchProfile.mockResolvedValue(PROFILE)
        authApi.logout.mockResolvedValue(undefined)
        tabs.told = []
        tabs.listener = undefined
        localStorage.clear()
        sessionStorage.clear()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    const signedIn = async (expiresIn = 900) => {
        authApi.login.mockResolvedValue(tokens('secret-access-token', expiresIn))
        const store = (await import('@/features/auth/auth.store')).useAuthStore
        await store.getState().signIn('ada@example.test', 'Harbour-Lantern-42')
        return store
    }

    it('keeps the access token in memory only, never in localStorage or sessionStorage', async () => {
        const store = await signedIn()

        expect(store.getState().isAuthenticated).toBe(true)
        await expect(store.getState().getToken()).resolves.toBe('secret-access-token')
        // Any script on the page can read storage: one XSS bug would hand the token over.
        expect(storedValues().filter((entry) => entry.includes('secret-access-token'))).toEqual([])
        expect(localStorage.getItem('auth:session')).toBe('1')
        expect(tabs.told).toEqual([{ type: 'signed-in', userId: 'user-1' }])
    })

    it('ends the session when the refresh is refused, with the reason it gave', async () => {
        const store = await signedIn(30) // within the 60 s margin: getToken refreshes
        authApi.refresh.mockRejectedValue(apiError(401, 'AUTH_TOKEN_REVOKED', { data: { reason: 'password_changed' } }))

        await expect(store.getState().getToken()).resolves.toBeUndefined()

        expect(store.getState().isAuthenticated).toBe(false)
        expect(store.getState().takeSignOutReason()).toBe('password-changed')
    })

    it('lands an ended session on sign in, by password when it was changed, and comes back afterwards (D-65)', async () => {
        window.history.pushState({}, '', '/study?tab=a')
        const store = await signedIn(30)
        authApi.refresh.mockRejectedValue(apiError(401, 'AUTH_TOKEN_REVOKED', { data: { reason: 'password_changed' } }))

        await store.getState().getToken()
        await vi.runAllTimersAsync()

        expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login?next=%2Fstudy%3Ftab%3Da&method=password')
        window.history.pushState({}, '', '/')
    })

    it('hands each reader only its kind of reason, and leaves the rest for the other', async () => {
        const store = await signedIn(30)
        authApi.refresh.mockRejectedValue(apiError(401, 'AUTH_TOKEN_REVOKED', { data: { reason: 'security' } }))
        await store.getState().getToken()

        // The app's toasts do not take what the sign-in page's banner says.
        expect(store.getState().takeSignOutReason((reason) => reason === 'account-deleted')).toBeNull()
        expect(store.getState().peekSignOutReason()).toBe('security')
        expect(store.getState().takeSignOutReason((reason) => reason === 'security')).toBe('security')
        expect(store.getState().peekSignOutReason()).toBeNull()
    })

    it('signs out: forgets the token and the cached data, tells the other tabs, never lands off-site', async () => {
        const store = await signedIn()
        tabs.told = []

        store.getState().logout(undefined, '//evil.example/steal')
        await vi.runAllTimersAsync()

        expect(authApi.logout).toHaveBeenCalledTimes(1)
        expect(store.getState().isAuthenticated).toBe(false)
        expect(store.getState().user).toBeNull()
        expect(localStorage.getItem('auth:session')).toBeNull()
        // User A's cached data must not be shown to whoever signs in next in this tab.
        expect(queryClientMock.clear).toHaveBeenCalled()
        expect(setErrorTrackingUser).toHaveBeenLastCalledWith(undefined)
        expect(tabs.told).toEqual([{ type: 'signed-out' }])
        expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/')
        await expect(store.getState().getToken()).resolves.toBeUndefined()
    })

    it('follows a sign-out in another tab, without asking the API again', async () => {
        const store = await signedIn()

        tabs.listener?.({ type: 'signed-out' })

        expect(store.getState().isAuthenticated).toBe(false)
        expect(queryClientMock.clear).toHaveBeenCalled()
        await expect(store.getState().getToken()).resolves.toBeUndefined()
        expect(authApi.logout).not.toHaveBeenCalled()
        expect(hardNavigate).toHaveBeenCalledWith('/')
    })

    describe('"complete your account" (D-61)', () => {
        const signedInWithCode = async (completed: boolean, profile: unknown = { ...PROFILE, completed }) => {
            if (profile instanceof Error) fetchProfile.mockRejectedValue(profile)
            else fetchProfile.mockResolvedValue(profile)
            const store = (await import('@/features/auth/auth.store')).useAuthStore
            await store.getState().startSession(tokens('access'), { completed })
            return store
        }

        it('knows an account made by the code is incomplete, from the profile', async () => {
            const store = await signedInWithCode(false)
            expect(store.getState().isComplete).toBe(false)
        })

        it('goes by what the code said when the profile does not arrive', async () => {
            const store = await signedInWithCode(false, new Error('offline'))
            expect(store.getState().isComplete).toBe(false)
        })

        it('turns incomplete when the API says so, and complete once the step is done', async () => {
            const store = await signedInWithCode(true)

            store.getState().markIncomplete()
            expect(store.getState().isComplete).toBe(false)

            store.getState().markComplete()
            expect(store.getState().isComplete).toBe(true)
            // The profile says `completed` too: read it again.
            expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users', 'profile'] })
        })

        it('ignores ACCOUNT_INCOMPLETE once signed out, and starts the next session afresh', async () => {
            const store = await signedInWithCode(false)
            tabs.listener?.({ type: 'signed-out' })

            store.getState().markIncomplete()
            expect(store.getState().isComplete).toBe(true)
        })
    })

    describe('an account waiting to be deleted (D-141)', () => {
        const DELETES_AT = '2026-10-29T14:47:00.000Z'

        it('learns it from the profile, and forgets it once restored', async () => {
            fetchProfile.mockResolvedValue({ ...PROFILE, deletesAt: DELETES_AT })
            authApi.restoreAccount.mockResolvedValue(undefined)
            const store = await signedIn()
            expect(store.getState().deletesAt).toBe(DELETES_AT)

            await store.getState().restoreAccount()

            expect(authApi.restoreAccount).toHaveBeenCalledOnce()
            expect(store.getState().deletesAt).toBeNull()
            expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users', 'profile'] })
        })

        it('is still finding out until the profile arrives, and learns it waits in the same step', async () => {
            let arrive: (profile: unknown) => void = () => undefined
            fetchProfile.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
            authApi.login.mockResolvedValue(tokens('secret-access-token', 900))
            const store = (await import('@/features/auth/auth.store')).useAuthStore
            const seen: [boolean, boolean, string | null][] = []
            const stop = store.subscribe((s) => seen.push([s.isAuthenticated, s.isLoadingAccount, s.deletesAt]))

            const signingIn = store.getState().signIn('ada@example.test', 'Harbour-Lantern-42')
            await vi.waitFor(() => expect(store.getState().isLoadingAccount).toBe(true))
            arrive({ ...PROFILE, deletesAt: DELETES_AT })
            await signingIn
            stop()

            // Never signed in, done loading and not waiting: the sign-in page would move on.
            expect(seen).not.toContainEqual([true, false, null])
            expect(store.getState()).toMatchObject({ isLoadingAccount: false, deletesAt: DELETES_AT })
        })

        it('keeps waiting when the restore fails', async () => {
            fetchProfile.mockResolvedValue({ ...PROFILE, deletesAt: DELETES_AT })
            authApi.restoreAccount.mockRejectedValue(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
            const store = await signedIn()

            await expect(store.getState().restoreAccount()).rejects.toBeDefined()
            expect(store.getState().deletesAt).toBe(DELETES_AT)
        })

        it('"Not now" ends the session here and in the other tabs, and leaves the page alone', async () => {
            fetchProfile.mockResolvedValue({ ...PROFILE, deletesAt: DELETES_AT })
            const store = await signedIn()

            store.getState().setRestoreAside()
            await vi.runAllTimersAsync()

            expect(store.getState()).toMatchObject({ isAuthenticated: false, isSigningOut: false, deletesAt: null })
            expect(tabs.told).toEqual([{ type: 'signed-in', userId: 'user-1' }, { type: 'signed-out' }])
            expect(authApi.logout).toHaveBeenCalledOnce()
            expect(hardNavigate).not.toHaveBeenCalled()
        })

        it('lands a deletion on sign in, with the day for its banner, said once', async () => {
            const store = await signedIn()

            store.getState().logout('account-deleted', undefined, DELETES_AT)
            await vi.runAllTimersAsync()

            expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login')
            expect(store.getState().peekDeletesAt()).toBe(DELETES_AT)
            expect(store.getState().takeSignOutReason()).toBe('account-deleted')
            expect(store.getState().peekDeletesAt()).toBeNull()
        })

        it('keeps the day a refused refresh gives, when another device asked', async () => {
            const store = await signedIn(30)
            authApi.refresh.mockRejectedValue(
                apiError(401, 'AUTH_REFRESH_FAILED', { data: { reason: 'account_deleted', deletesAt: DELETES_AT } })
            )

            await store.getState().getToken()

            expect(store.getState().peekSignOutReason()).toBe('account-deleted')
            expect(store.getState().peekDeletesAt()).toBe(DELETES_AT)
        })

        it('turns waiting when the API says so, but not once signed out', async () => {
            const store = await signedIn()
            store.getState().markPendingDeletion(DELETES_AT)
            expect(store.getState().deletesAt).toBe(DELETES_AT)

            tabs.listener?.({ type: 'signed-out' })
            store.getState().markPendingDeletion(DELETES_AT)
            expect(store.getState().deletesAt).toBeNull()
        })
    })
    it('never lands off-site, however the address is written', async () => {
        const store = await signedIn()

        store.getState().logout(undefined, '/\\evil.example/steal')
        await vi.runAllTimersAsync()

        expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/')
    })

    it('asks the API for one refresh when several requests find the token expiring at once', async () => {
        const store = await signedIn(30)
        authApi.refresh.mockResolvedValue(tokens('fresh-token'))

        const tokensSeen = await Promise.all([store.getState().getToken(), store.getState().refreshToken()])

        expect(tokensSeen).toEqual(['fresh-token', 'fresh-token'])
        expect(authApi.refresh).toHaveBeenCalledOnce()
    })

    it('signs out once when several requests are refused together, with the first reason', async () => {
        const store = await signedIn()

        store.getState().logout('password-changed')
        store.getState().logout('security')
        await vi.runAllTimersAsync()

        expect(authApi.logout).toHaveBeenCalledOnce()
        expect(hardNavigate).toHaveBeenCalledOnce()
        expect(store.getState().peekSignOutReason()).toBe('password-changed')
    })

    it('sends a change still waiting before it forgets the token, with that token', async () => {
        const { onBeforeSignOut, tokenNow } = await import('@/lib/before-sign-out')
        const store = await signedIn()
        const sentWith: (string | undefined)[] = []
        onBeforeSignOut(() => sentWith.push(tokenNow()))

        store.getState().logout()

        expect(sentWith).toEqual(['secret-access-token'])
        expect(store.getState().isAuthenticated).toBe(false)
    })

    describe('the other tabs of this browser (D-63)', () => {
        const DELETES_AT = '2026-10-29T14:47:00.000Z'

        it('loads the page again as the new account when another tab signs in to another one', async () => {
            window.history.pushState({}, '', '/study?tab=a')
            const store = await signedIn()

            tabs.listener?.({ type: 'signed-in', userId: 'user-2' })

            expect(store.getState().isAuthenticated).toBe(false)
            expect(queryClientMock.clear).toHaveBeenCalled()
            // The shared cookie is still there for the reload to take up.
            expect(localStorage.getItem('auth:session')).toBe('1')
            expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/study?tab=a')
            window.history.pushState({}, '', '/')
        })

        it('stays as it is when another tab signs in to the same account', async () => {
            const store = await signedIn()

            tabs.listener?.({ type: 'signed-in', userId: 'user-1' })

            expect(store.getState().isAuthenticated).toBe(true)
            expect(hardNavigate).not.toHaveBeenCalled()
        })

        it('lands where the tab that signed out did, with the same banner and day', async () => {
            const store = await signedIn()

            tabs.listener?.({ type: 'signed-out', reason: 'account-deleted', deletesAt: DELETES_AT })

            expect(store.getState().isAuthenticated).toBe(false)
            expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/login')
            expect(store.getState().peekSignOutReason()).toBe('account-deleted')
            expect(store.getState().peekDeletesAt()).toBe(DELETES_AT)
        })

        it('tells the other tabs why it signed out, and the day for a deletion', async () => {
            const store = await signedIn()
            tabs.told = []

            store.getState().logout('account-deleted', undefined, DELETES_AT)

            expect(tabs.told).toEqual([{ type: 'signed-out', reason: 'account-deleted', deletesAt: DELETES_AT }])
        })

        it('closes its restore dialog when another tab restores the account, and says so when it restores', async () => {
            fetchProfile.mockResolvedValue({ ...PROFILE, deletesAt: DELETES_AT })
            authApi.restoreAccount.mockResolvedValue(undefined)
            const store = await signedIn()

            tabs.listener?.({ type: 'restored' })

            expect(store.getState().deletesAt).toBeNull()
            expect(queryClientMock.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['users', 'profile'] })

            tabs.told = []
            await store.getState().restoreAccount()
            expect(tabs.told).toEqual([{ type: 'restored' }])
        })
    })

    it('keeps the signed-in user in step with the profile query (the username after "complete your account")', async () => {
        fetchProfile.mockResolvedValue({ ...PROFILE, username: undefined, completed: false })
        const store = await signedIn()
        expect(store.getState().user?.username).toBeUndefined()

        cache.listener?.({
            type: 'updated',
            action: { type: 'success' },
            query: { queryKey: ['users', 'profile'], state: { data: { ...PROFILE, username: 'ada' } } }
        })

        expect(store.getState().user?.username).toBe('ada')
    })
})
