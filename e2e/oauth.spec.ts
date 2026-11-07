import { expect, test } from '@playwright/test'
import { apiUrl, asOwnClient, watchForProblems } from './helpers'

/**
 * Signing in with Google, as far as a test can go without a Google account:
 * the button, the API's redirect to Google, and the page Google's return
 * lands on. The sign-in at Google itself is a manual test (docs/auth/in-the-code.md#tests).
 *
 * Needs the API with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set; skipped
 * when it does not offer Google.
 */
test.beforeEach(async ({ context }) => {
    await asOwnClient(context)
    const answer = await fetch(`${apiUrl}/auth/options`).catch(() => null)
    const providers = answer?.ok ? ((await answer.json()) as { data: { providers: string[] } }).data.providers : []
    test.skip(!providers.includes('google'), 'The API does not offer Google sign-in (GOOGLE_CLIENT_ID unset)')
})

test('"Continue with Google" goes through the API to Google, remembering where it was heading', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/settings/account')
    await page.waitForURL(/\/login\?next=%2Fsettings%2Faccount/)

    const google = page.getByRole('link', { name: 'Continue with Google' })
    // It waits on the API (/auth/options): slower than the form in a cold browser.
    await expect(google).toHaveAttribute('href', `${apiUrl}/auth/google?redirect=%2Fsettings%2Faccount`, {
        timeout: 15_000
    })

    // Where the API sends the browser: Google, with PKCE, and a cookie for the way back.
    const redirect = await page.request.get((await google.getAttribute('href'))!, { maxRedirects: 0 })
    expect(redirect.status()).toBe(302)
    const location = new URL(redirect.headers()['location'])
    expect(location.origin).toBe('https://accounts.google.com')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('redirect_uri')).toBe(`${apiUrl}/auth/google/callback`)
    expect(redirect.headers()['set-cookie']).toMatch(/oauth_state=.*HttpOnly/i)
    expect(problems).toEqual([])
})
