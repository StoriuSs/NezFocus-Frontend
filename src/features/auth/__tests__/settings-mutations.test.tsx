import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { apiError } from '@/test/helpers'

const authApi = { disableTwoFactor: vi.fn(), deleteAccount: vi.fn() }
vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))

const { useDisableTwoFactor } = await import('@/features/auth/api/useDisableTwoFactor')
const { useDeleteAccount } = await import('@/features/auth/api/useDeleteAccount')
const { authKeys } = await import('@/features/auth/api/keys')

/** A client the test can look into, with invalidateQueries watched. */
function withClient() {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidated = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const keys = () => invalidated.mock.calls.map(([filters]) => filters?.queryKey)
    return { wrapper, keys }
}

/**
 * The settings mutations keep the page's picture of the account current: after
 * a change, and when the API says the account changed meanwhile (in another tab).
 */
describe('settings mutations', () => {
    beforeEach(() => {
        authApi.disableTwoFactor.mockReset()
        authApi.deleteAccount.mockReset()
    })

    it('reloads the two-step status after turning it off', async () => {
        authApi.disableTwoFactor.mockResolvedValue(undefined)
        const { wrapper, keys } = withClient()
        const { result } = renderHook(() => useDisableTwoFactor(), { wrapper })

        await act(() => result.current.mutateAsync('123456'))

        expect(keys()).toEqual([authKeys.twoFactorStatus()])
    })

    it('reloads it when it was already off, and not for a wrong code', async () => {
        const { wrapper, keys } = withClient()
        const { result } = renderHook(() => useDisableTwoFactor(), { wrapper })

        authApi.disableTwoFactor.mockRejectedValueOnce(apiError(400, 'AUTH_TWO_FACTOR_CODE_INVALID'))
        await act(() => result.current.mutateAsync('000000').catch(() => {}))
        expect(keys()).toEqual([])

        authApi.disableTwoFactor.mockRejectedValueOnce(apiError(409, 'AUTH_TWO_FACTOR_NOT_ON'))
        await act(() => result.current.mutateAsync('123456').catch(() => {}))
        expect(keys()).toEqual([authKeys.twoFactorStatus()])
    })

    it('reads again what the account needs when deleting it asked for more proof', async () => {
        authApi.deleteAccount.mockRejectedValue(apiError(400, 'AUTH_CONFIRMATION_REQUIRED'))
        const { wrapper, keys } = withClient()
        const { result } = renderHook(() => useDeleteAccount(), { wrapper })

        await act(() => result.current.mutateAsync({ password: 'Harbour-Lantern-42' }).catch(() => {}))

        expect(keys()).toEqual([authKeys.signInMethods(), authKeys.twoFactorStatus()])
    })
})
