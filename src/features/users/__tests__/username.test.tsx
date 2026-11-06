import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiError } from '@/test/helpers'

const api = { get: vi.fn(), post: vi.fn() }
vi.mock('@/lib/api', () => ({ default: api }))

const { USERNAME_MAX_LENGTH, USERNAME_PATTERN, useUsernameAvailability } =
    await import('@/features/users/api/useUsernameAvailability')
const { useSetUsername } = await import('@/features/users/api/useSetUsername')
const { userKeys } = await import('@/features/users/api/keys')

/** A client the test can look into, unlike queryWrapper's. */
function withClient() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, wrapper }
}

// SRS REQ-AUTH-01, the same cases as the API's username.rules.spec.ts.
describe('the username rule', () => {
    it('allows 2 to 32 characters', () => {
        expect(USERNAME_MAX_LENGTH).toBe(32)
    })

    it.each(['ab', 'a'.repeat(32), 'nez.focus_2', 'an.h', '_x', '42'])('accepts %s', (username) => {
        expect(USERNAME_PATTERN.test(username)).toBe(true)
    })

    it.each(['a', 'a'.repeat(33), 'Anh', 'an h', 'an-h', 'đức', 'a/b', 'anh@nez'])('refuses %s', (username) => {
        expect(USERNAME_PATTERN.test(username)).toBe(false)
    })
})

describe('checking a username as it is typed', () => {
    beforeEach(() => {
        api.get.mockReset()
        api.get.mockResolvedValue({ data: { data: { available: true } } })
    })

    it('answers only for the name in the field, never with the previous name’s answer', async () => {
        const { wrapper } = withClient()
        const { result, rerender } = renderHook(({ name }) => useUsernameAvailability(name), {
            wrapper,
            initialProps: { name: 'alice' }
        })

        expect(result.current.isAvailable).toBeNull()
        await waitFor(() => expect(result.current.isAvailable).toBe(true))

        // One more letter: "alice" was free, which says nothing about "alicex".
        rerender({ name: 'alicex' })
        expect(result.current.isAvailable).toBeNull()
        expect(result.current.isChecking).toBe(true)
        await waitFor(() => expect(result.current.isAvailable).toBe(true))

        expect(api.get.mock.calls.map(([url]) => url)).toEqual([
            '/users/username-available/alice',
            '/users/username-available/alicex'
        ])
    })

    it('does not ask about a name the API would refuse anyway', () => {
        const { wrapper } = withClient()
        const { result } = renderHook(() => useUsernameAvailability('No Spaces'), { wrapper })

        expect(result.current).toMatchObject({ isValid: false, isChecking: false, isAvailable: null })
        expect(api.get).not.toHaveBeenCalled()
    })
})

describe('setting the username', () => {
    // Braces: a function returned from beforeEach is run as its teardown,
    // and mockReset() returns the mock.
    beforeEach(() => {
        api.post.mockReset()
    })

    it('shows the name as taken when someone got it after it was checked', async () => {
        api.post.mockRejectedValue(apiError(409, 'USERNAME_CONFLICT'))
        const { client, wrapper } = withClient()
        client.setQueryData(userKeys.usernameAvailability('ada'), true)
        const { result } = renderHook(() => useSetUsername(), { wrapper })

        await act(() => result.current.mutateAsync('ada').catch(() => {}))

        expect(client.getQueryData(userKeys.usernameAvailability('ada'))).toBe(false)
    })

    it('reloads the profile when the username was already set, in another tab say', async () => {
        api.post.mockRejectedValue(apiError(400, 'USERNAME_ALREADY_SET'))
        const { client, wrapper } = withClient()
        const invalidate = vi.spyOn(client, 'invalidateQueries')
        const { result } = renderHook(() => useSetUsername(), { wrapper })

        await act(() => result.current.mutateAsync('ada').catch(() => {}))

        expect(invalidate).toHaveBeenCalledWith({ queryKey: userKeys.profile() })
    })
})
