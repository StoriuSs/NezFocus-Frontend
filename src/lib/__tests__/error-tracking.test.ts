import { describe, expect, it } from 'vitest'
import type { ErrorEvent } from '@sentry/react'
import { scrubEvent } from '@/lib/error-tracking'

describe('scrubEvent', () => {
    it('redacts tokens and OAuth parameters from the request, breadcrumbs, extra data and contexts', () => {
        const scrubbed = scrubEvent({
            type: undefined,
            request: {
                url: 'https://app.example.com/profile?tab=1&access_token=abc#state=s&session_state=x&code=secret-code',
                headers: { Referer: 'https://app.example.com/?code=secret-code&state=s', 'User-Agent': 'UA' },
                query_string: 'code=secret-code&tab=1',
                cookies: { session: 'c' }
            },
            breadcrumbs: [
                { category: 'navigation', data: { from: '/#code=secret-code', to: '/profile' } },
                { category: 'xhr', data: { url: 'https://api.example.com/api/v1/users?token=t', method: 'GET' } },
                { category: 'console', message: 'redirect to https://auth/cb?code=secret-code done' }
            ],
            extra: { request: { headers: { Authorization: 'Bearer eyJ' } } },
            contexts: { form: { password: 'p', displayName: 'Alice' } }
        } as ErrorEvent)

        expect(scrubbed.request).toEqual({
            url: 'https://app.example.com/profile?tab=1&access_token=%5BREDACTED%5D',
            headers: {
                Referer: 'https://app.example.com/?code=%5BREDACTED%5D&state=%5BREDACTED%5D',
                'User-Agent': 'UA'
            },
            query_string: 'code=%5BREDACTED%5D&tab=1',
            cookies: {}
        })
        expect(scrubbed.breadcrumbs?.[1]?.data?.url).toBe('https://api.example.com/api/v1/users?token=%5BREDACTED%5D')
        expect(scrubbed.extra).toEqual({ request: { headers: { Authorization: '[REDACTED]' } } })
        expect(scrubbed.contexts).toEqual({ form: { password: '[REDACTED]', displayName: 'Alice' } })
        expect(JSON.stringify(scrubbed)).not.toMatch(/secret-code|eyJ|session_state/)
    })
})
