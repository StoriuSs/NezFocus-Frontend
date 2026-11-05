import { describe, it, expect, vi } from 'vitest'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ default: { post } }))

import { authApi } from '../api/auth.api'

describe('authApi', () => {
    it('confirms an address with the code and the password chosen at sign-up', async () => {
        post.mockResolvedValue({ data: { data: { accessToken: 'a' } } })

        await authApi.verifyEmail('ada@example.test', '123456', 'Harbour-Lantern-42')

        expect(post).toHaveBeenCalledWith(
            '/auth/verify-email',
            { email: 'ada@example.test', code: '123456', password: 'Harbour-Lantern-42' },
            expect.objectContaining({ skipAuth: true, withCredentials: true })
        )
    })

    it.each([
        ['/auth/login', () => authApi.login('ada@example.test', 'Harbour-Lantern-42')],
        ['/auth/register', () => authApi.register('ada@example.test', 'Harbour-Lantern-42')],
        ['/auth/forgot-password', () => authApi.forgotPassword('ada@example.test')]
    ])('sends %s the address (and password) without a bearer token, with the cookie', async (path, call) => {
        post.mockResolvedValue({ data: { data: { accessToken: 'a' } } })

        await call()

        const body = path === '/auth/forgot-password' ? {} : { password: 'Harbour-Lantern-42' }
        expect(post).toHaveBeenLastCalledWith(
            path,
            { email: 'ada@example.test', ...body },
            expect.objectContaining({ skipAuth: true, withCredentials: true })
        )
    })
})
