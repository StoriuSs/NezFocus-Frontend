import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiError } from '@/test/helpers'

const queryClientMock = { clear: vi.fn(), setQueryData: vi.fn(), invalidateQueries: vi.fn() }
const hardNavigate = vi.fn()
const setErrorTrackingUser = vi.fn()
const authApi = { refresh: vi.fn(), login: vi.fn(), logout: vi.fn() }
const fetchProfile = vi.fn()
const tabs = { told: [] as string[], listener: undefined as undefined | ((message: string) => void) }

vi.mock('@/lib/query-client', () => ({ queryClient: queryClientMock }))
vi.mock('@/lib/navigation', () => ({ hardNavigate }))
vi.mock('@/lib/error-tracking', () => ({ setErrorTrackingUser }))
vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))
vi.mock('@/features/users', () => ({ fetchProfile, userKeys: { profile: () => ['users', 'profile'] } }))
vi.mock('@/features/auth/lib/tab-sync', () => ({
    tellOtherTabs: (message: string) => tabs.told.push(message),
    onOtherTab: (listener: (message: string) => void) => {
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
        for (const fn of [...Object.values(queryClientMock), hardNavigate, setErrorTrackingUser]) {
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
        expect(tabs.told).toEqual(['signed-in'])
    })

    it('ends the session when the refresh is refused, with the reason it gave', async () => {
        const store = await signedIn(30) // within the 60 s margin: getToken refreshes
        authApi.refresh.mockRejectedValue(apiError(401, 'AUTH_TOKEN_REVOKED', { data: { reason: 'password_changed' } }))

        await expect(store.getState().getToken()).resolves.toBeUndefined()

        expect(store.getState().isAuthenticated).toBe(false)
        expect(store.getState().takeSignOutReason()).toBe('password-changed')
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
        expect(tabs.told).toEqual(['signed-out'])
        expect(hardNavigate).toHaveBeenCalledExactlyOnceWith('/')
        await expect(store.getState().getToken()).resolves.toBeUndefined()
    })

    it('follows a sign-out in another tab, without asking the API again', async () => {
        const store = await signedIn()

        tabs.listener?.('signed-out')

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
            tabs.listener?.('signed-out')

            store.getState().markIncomplete()
            expect(store.getState().isComplete).toBe(true)
        })
    })
})
