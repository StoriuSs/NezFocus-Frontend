import { describe, it, expect, vi, beforeEach } from 'vitest'
import i18n from '@/i18n'

const post = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ default: { post } }))

import { authApi } from '../api/auth.api'
import { trackSignOut } from '../lib/sign-out-in-flight'

const PUBLIC = expect.objectContaining({ skipAuth: true, withCredentials: true })

describe('authApi', () => {
    beforeEach(async () => {
        post.mockReset().mockResolvedValue({ data: { data: { accessToken: 'a' } } })
        await i18n.changeLanguage('vi')
    })

    it('asks for a code in the language on screen, without a bearer token (D-132)', async () => {
        await authApi.sendEmailCode('an.nguyen@gmail.com')
        expect(post).toHaveBeenLastCalledWith(
            '/auth/email-code',
            { email: 'an.nguyen@gmail.com', language: 'vi' },
            PUBLIC
        )

        await i18n.changeLanguage('en')
        await authApi.forgotPassword('an.nguyen@gmail.com')
        expect(post).toHaveBeenLastCalledWith(
            '/auth/forgot-password',
            { email: 'an.nguyen@gmail.com', language: 'en' },
            PUBLIC
        )
    })

    it('signs in with the code alone, and keeps what it says about the account', async () => {
        const answer = {
            accessToken: 'a',
            tokenType: 'Bearer',
            expiresIn: 900,
            account: { created: true, completed: false }
        }
        post.mockResolvedValue({ data: { data: answer } })

        await expect(authApi.verifyEmailCode('an.nguyen@gmail.com', '482913')).resolves.toEqual(answer)
        expect(post).toHaveBeenLastCalledWith(
            '/auth/email-code/verify',
            { email: 'an.nguyen@gmail.com', code: '482913' },
            PUBLIC
        )
    })

    it('completes the account with the bearer token, saving the language on screen (D-64)', async () => {
        const form = {
            displayName: 'An',
            username: 'an.nguyen',
            password: 'Ontap2026!',
            timezone: 'Asia/Ho_Chi_Minh',
            termsAccepted: true
        }
        await authApi.completeAccount(form)

        expect(post).toHaveBeenLastCalledWith('/auth/complete-account', { ...form, language: 'vi' })
    })

    it('deletes the account with its password, asking for the email in the language on screen', async () => {
        await authApi.deleteAccount('Ontap2026!')
        expect(post).toHaveBeenLastCalledWith(
            '/auth/account/delete',
            { password: 'Ontap2026!', language: 'vi' },
            { withCredentials: true }
        )
    })
    it('waits for a sign-out still on its way before a request that sets the cookie', async () => {
        // "Not now" in the restore dialog, then signing in again at once: the
        // sign-out's answer clears the cookie, and must not clear the new one.
        let answer: () => void = () => undefined
        trackSignOut(new Promise<void>((resolve) => (answer = resolve)))

        const signingIn = authApi.login('an.nguyen@gmail.com', 'Harbour-Lantern-42')
        await Promise.resolve()
        expect(post).not.toHaveBeenCalled()

        answer()
        await signingIn
        expect(post).toHaveBeenCalledWith('/auth/login', expect.anything(), PUBLIC)
    })
})
