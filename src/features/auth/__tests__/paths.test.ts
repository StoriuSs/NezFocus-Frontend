import { describe, it, expect } from 'vitest'
import { afterSignIn, safeNext, signInPath, withFlow } from '@/features/auth/lib/paths'

describe('safeNext', () => {
    it('keeps a page on this site, and sends anything that leaves it to the Study page', () => {
        expect(safeNext('/profile?tab=avatar#top')).toBe('/profile?tab=avatar#top')
        for (const offSite of [
            'https://evil.example/profile',
            '//evil.example/profile',
            '/\\evil.example',
            'javascript:alert(1)'
        ]) {
            expect(safeNext(offSite), offSite).toBe('/study')
        }
        expect(safeNext(null)).toBe('/study')
    })

    it('never sends a signed-in person back into the sign-in pages', () => {
        for (const page of ['/login', '/register', '/verify', '/welcome']) expect(safeNext(page), page).toBe('/study')
    })
})

describe('the flow between auth pages (?next, ?invite)', () => {
    it('carries next and invite to the next step, and nothing else', () => {
        expect(withFlow('/verify', '?next=%2Fprofile&invite=abc&method=password')).toBe(
            '/verify?next=%2Fprofile&invite=abc'
        )
        expect(withFlow('/verify', '?method=password')).toBe('/verify')
    })

    it('sends an incomplete account to "complete your account" first, keeping the flow', () => {
        expect(afterSignIn({ completed: false }, '?next=%2Fprofile&invite=abc')).toBe(
            '/welcome?next=%2Fprofile&invite=abc'
        )
    })

    it('sends a completed account to next when it is on this site, otherwise to Study', () => {
        expect(afterSignIn({ completed: true }, '?next=%2Fprofile')).toBe('/profile')
        expect(afterSignIn({ completed: true }, '?next=https%3A%2F%2Fevil.example')).toBe('/study')
        expect(afterSignIn({ completed: true }, '')).toBe('/study')
    })

    it('builds the sign-in path that comes back to a page', () => {
        expect(signInPath('/profile?tab=a')).toBe('/login?next=%2Fprofile%3Ftab%3Da')
        expect(signInPath()).toBe('/login')
    })
})
