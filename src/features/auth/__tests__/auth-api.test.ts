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
})
