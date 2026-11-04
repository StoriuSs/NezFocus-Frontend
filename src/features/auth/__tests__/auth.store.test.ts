import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiError } from '@/test/helpers'

const queryClientMock = { clear: vi.fn(), setQueryData: vi.fn() }
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

const PROFILE = { id: 'user-1', email: 'ada@example.test', username: 'ada', roles: ['user'] }
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
        for (const fn of [queryClientMock.clear, queryClientMock.setQueryData, hardNavigate, setErrorTrackingUser]) {
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
})
