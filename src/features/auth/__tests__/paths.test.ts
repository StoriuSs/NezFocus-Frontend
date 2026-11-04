import { describe, it, expect } from 'vitest'
import { safeRedirect } from '@/features/auth/lib/paths'

describe('safeRedirect', () => {
    it('keeps a page on this site, and sends anything that leaves it home', () => {
        expect(safeRedirect('/profile?tab=avatar#top')).toBe('/profile?tab=avatar#top')
        for (const offSite of [
            'https://evil.example/profile',
            '//evil.example/profile',
            '/\\evil.example',
            'javascript:alert(1)'
        ]) {
            expect(safeRedirect(offSite), offSite).toBe('/')
        }
    })
})
