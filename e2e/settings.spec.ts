import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * The account's settings pages (S-ME-04 → S-ME-06, REQ-AUTH-08, D-37): what
 * is chosen in one tab shows in the others at once, and in another browser
 * once signed in there; the time zone changes once a day. Each device is a
 * browser context of its own; tabs of one device are pages of one context.
 *
 * Needs the API and Mailpit, like account.spec.ts.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'

let email: string

/** A completed account, made through the API: this spec is about what comes after. */
test.beforeAll(async ({ browserName }) => {
    email = `e2e-settings-${browserName}${Date.now().toString(36)}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const post = async (path: string, body: object, token?: string) => {
        const response = await fetch(`${apiUrl}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Origin: 'http://localhost:3001',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(body)
        })
        expect(response.ok, `POST ${path}: ${response.status}`).toBe(true)
        return (await response.json()) as { data: { access_token: string } | null }
    }
    const sentAt = new Date()
    await post('auth/email-code', { email })
    const verified = await post('auth/email-code/verify', { email, code: await codeFromEmail(email, 'code', sentAt) })
    await post(
        'auth/complete-account',
        {
            display_name: 'E2E',
            username: `e2e_t${Date.now().toString(36)}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        verified.data!.access_token
    )
})

/** A device (its own browser context) signed in by password, on `path`. */
async function device(browser: Browser, path: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext()
    await asOwnClient(context)
    const page = await context.newPage()
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.goto(path)
    return { context, page }
}

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'))

test('theme and language: every tab follows at once, another browser once signed in', async ({ browser }) => {
    const { context, page } = await device(browser, '/settings/appearance')
    const problems = await watchForProblems(page)
    const otherTab = await context.newPage()
    await otherTab.goto('/study')
    await expect(page.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')

    await page.getByRole('radio', { name: 'Dark' }).click()
    await page.getByRole('radio', { name: 'Tiếng Việt' }).click()

    await expect(page.getByRole('heading', { name: 'Ngôn ngữ', exact: true })).toBeVisible()
    expect(await isDark(page)).toBe(true)
    await expect.poll(() => isDark(otherTab)).toBe(true)
    await expect(otherTab.locator('html')).toHaveAttribute('lang', 'vi')

    // A browser that has never seen the choice: its sign-in page is in English, then the account's take over.
    const elsewhere = await device(browser, '/settings/appearance')
    await expect(elsewhere.page.getByRole('radio', { name: 'Tối' })).toHaveAttribute('aria-checked', 'true')
    expect(await isDark(elsewhere.page)).toBe(true)

    // Back to English for the tests after this one.
    await page.getByRole('radio', { name: 'English' }).click()
    await expect(page.getByRole('heading', { name: 'Language', exact: true })).toBeVisible()
    expect(problems).toEqual([])
    await elsewhere.context.close()
    await context.close()
})

test('the time zone asks first, then waits 24 hours; a device that did not know is told', async ({ browser }) => {
    const { context, page } = await device(browser, '/settings/appearance')
    // Another device, on the page already: it still thinks the zone may change.
    const other = await device(browser, '/settings/appearance')
    await expect(other.page.getByRole('button', { name: 'Time zone' })).toBeEnabled()

    await page.getByRole('button', { name: 'Time zone' }).click()
    await page.getByRole('combobox', { name: 'Search a city or GMT' }).fill('tokyo')
    await page.keyboard.press('Enter')
    const ask = page.getByRole('dialog', { name: /Change your time zone to GMT\+9\s·\sTokyo\?/ })
    await ask.getByRole('button', { name: 'Change time zone' }).click()

    await expect(ask).toBeHidden()
    await expect(page.getByRole('button', { name: 'Time zone' })).toHaveText('GMT+9 · Tokyo')
    await expect(page.getByRole('button', { name: 'Time zone' })).toBeDisabled()
    await expect(page.getByText(/You can change it again after \d\d:\d\d on \d\d\/\d\d \(GMT\+9\)/)).toBeVisible()

    await other.page.getByRole('button', { name: 'Time zone' }).click()
    await other.page.getByRole('combobox', { name: 'Search a city or GMT' }).fill('paris')
    await other.page.keyboard.press('Enter')
    await other.page.getByRole('button', { name: 'Change time zone' }).click()

    await expect(other.page.getByRole('button', { name: 'Time zone' })).toBeDisabled()
    await expect(other.page.getByRole('button', { name: 'Time zone' })).toHaveText('GMT+9 · Tokyo')
    await expect(other.page.getByText(/You can change it again after .* \(GMT\+9\)/)).toBeVisible()
    await other.context.close()
    await context.close()
})

test('the switches of Notifications and Privacy are kept by the account', async ({ browser }) => {
    const { context, page } = await device(browser, '/settings/notifications')
    const problems = await watchForProblems(page)

    const saved = () =>
        page.waitForResponse(
            (answer) => answer.url().endsWith('/users/me/settings') && answer.request().method() === 'PATCH'
        )

    await page.getByRole('button', { name: 'Play sample' }).click()
    let save = saved()
    await page.getByRole('switch', { name: 'Phase change sound' }).click()
    await expect(page.getByRole('switch', { name: 'Phase change sound' })).toHaveAttribute('aria-checked', 'false')
    expect((await save).ok()).toBe(true)

    await page.getByRole('link', { name: 'Privacy' }).click()
    save = saved()
    await page.getByRole('switch', { name: 'Show study activity' }).click()
    await expect(
        page.getByText("No one sees that you're studying or which room you're in.", { exact: false })
    ).toBeVisible()
    expect((await save).ok()).toBe(true)

    await page.reload()
    await expect(page.getByRole('switch', { name: 'Show study activity' })).toHaveAttribute('aria-checked', 'false')
    await page.goto('/settings/notifications')
    await expect(page.getByRole('switch', { name: 'Phase change sound' })).toHaveAttribute('aria-checked', 'false')
    expect(problems).toEqual([])
    await context.close()
})
