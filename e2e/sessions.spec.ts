import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, openAccountMenuItem, watchForProblems } from './helpers'

/**
 * The list of sessions on the account page (S-ME-03, REQ-AUTH-03, D-75,
 * D-138), with several devices signed in to one account at once. Each device
 * is a browser context of its own: its own cookies, so its own session, and
 * its own client address (asOwnClient). What the API returns and enforces is
 * covered by its tests; here, what each device sees.
 *
 * Needs the API and Mailpit, like account.spec.ts.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const NEW_PASSWORD = 'Kettle-Moss-Meadow-5'
const RESET_PASSWORD = 'Reset-Kettle-Moss-5'
const FIREFOX_UBUNTU = 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'
const SAFARI_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15'

let email: string
let password = PASSWORD

/** A completed account, made through the API: this spec is about what comes after. */
test.beforeAll(async ({ browserName }) => {
    email = `e2e-sessions-${browserName}${Date.now().toString(36)}@example.test`
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
            username: `e2e_s${Date.now().toString(36)}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        verified.data!.access_token
    )
})

/** A device signed in to the account by password, on its own browser context. */
async function device(browser: Browser, userAgent?: string): Promise<Page> {
    const context = await browser.newContext(userAgent ? { userAgent } : {})
    await asOwnClient(context)
    const page = await context.newPage()
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    return page
}

const sessionsOf = (page: Page) => page.getByRole('region', { name: 'Sessions' }).getByRole('listitem')

/** The account page, its list of sessions loaded. */
async function openAccount(page: Page) {
    await page.goto('/settings/account')
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible()
    await expect(sessionsOf(page).first()).toContainText('This device')
}

/** The tab hidden and shown again, as when the person comes back to it. */
async function comeBackToTab(page: Page) {
    await page.evaluate(() => {
        const set = (state: string) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
            document.dispatchEvent(new Event('visibilitychange', { bubbles: true }))
        }
        set('hidden')
        set('visible')
    })
}

/**
 * Where a device whose session ended lands, and what it is told (D-65,
 * D-75), found out while the app is open: its next request. (A reload finds
 * out too, but says nothing for an ending that reads like an expiry.)
 */
async function expectSentToSignIn(page: Page, banner: string) {
    await openAccountMenuItem(page, 'Settings')
    await page.waitForURL(/\/login/)
    await expect(page.getByText(banner)).toBeVisible()
}

test('/settings opens the account page, and one Back leaves the settings', async ({ browser }) => {
    const page = await device(browser)
    const problems = await watchForProblems(page)

    await page.goto('/settings')
    await page.waitForURL(/\/settings\/account$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible()
    await page.goBack()
    await page.waitForURL(/\/study$/)
    expect(problems).toEqual([])
    await page.context().close()
})

test('lists this device first, the others by name with their last use, and a new one when the tab comes back', async ({
    browser
}) => {
    const laptop = await device(browser)
    const firefox = await device(browser, FIREFOX_UBUNTU)
    await openAccount(laptop)

    const rows = sessionsOf(laptop)
    await expect(rows.first()).toContainText('This device')
    await expect(rows.first()).toContainText(/Active now · IP 198\.51\.x\.x/)
    await expect(rows.first().getByRole('button')).toHaveCount(0)
    const firefoxRow = rows.filter({ hasText: 'Firefox · Ubuntu' })
    await expect(firefoxRow).toContainText(/Today \d\d:\d\d · IP 198\.51\.x\.x/)
    await expect(firefoxRow.getByRole('button', { name: 'Sign out Firefox · Ubuntu' })).toBeVisible()

    // Another device signs in while this page is open: it shows once the tab is back in view.
    const safari = await device(browser, SAFARI_MAC)
    await expect(rows.filter({ hasText: 'Safari · macOS' })).toHaveCount(0)
    await comeBackToTab(laptop)
    await expect(rows.filter({ hasText: 'Safari · macOS' })).toHaveCount(1)

    for (const page of [laptop, firefox, safari]) await page.context().close()
})

test('signs out one device without asking; that device is sent to sign in with the plain sentence', async ({
    browser
}) => {
    const laptop = await device(browser)
    const firefox = await device(browser, FIREFOX_UBUNTU)
    await openAccount(laptop)
    // Earlier tests left Firefox sessions too: sign out every one, the open device's among them.
    const firefoxRows = sessionsOf(laptop).filter({ hasText: 'Firefox · Ubuntu' })
    for (let left = await firefoxRows.count(); left > 0; left--) {
        await firefoxRows.first().getByRole('button', { name: 'Sign out Firefox · Ubuntu' }).click()
        await expect(firefoxRows).toHaveCount(left - 1)
    }

    // No question asked, and a toast naming the device.
    await expect(laptop.getByRole('dialog')).toHaveCount(0)
    await expect(laptop.getByText('Signed out Firefox · Ubuntu').first()).toBeVisible()
    await expectSentToSignIn(firefox, 'Your session has ended · sign in again to continue')

    for (const page of [laptop, firefox]) await page.context().close()
})

test('signs out the other devices after asking; they are told which button did it, this one stays', async ({
    browser
}) => {
    const laptop = await device(browser)
    const firefox = await device(browser, FIREFOX_UBUNTU)
    await openAccount(laptop)
    const others = (await sessionsOf(laptop).count()) - 1
    expect(others).toBeGreaterThanOrEqual(1)

    // Cancelled: nothing changes.
    await laptop.getByRole('button', { name: 'Sign out the other devices' }).click()
    const dialog = laptop.getByRole('dialog')
    await expect(dialog).toContainText(`Sign out ${others} other device${others === 1 ? '' : 's'}?`)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(sessionsOf(laptop)).toHaveCount(others + 1)

    await laptop.getByRole('button', { name: 'Sign out the other devices' }).click()
    await dialog.getByRole('button', { name: 'Sign out', exact: true }).click()

    await expect(laptop.getByText(`Signed out ${others} other device${others === 1 ? '' : 's'}`)).toBeVisible()
    await expect(sessionsOf(laptop)).toHaveCount(1)
    await expect(laptop.getByText('Only this device is signed in.')).toBeVisible()
    await expect(laptop.getByRole('button', { name: 'Sign out the other devices' })).toHaveCount(0)
    await expectSentToSignIn(firefox, 'One of your devices chose "Sign out the other devices" · sign in again')
    // This device carries on.
    await laptop.reload()
    await expect(sessionsOf(laptop).first()).toContainText('This device')

    for (const page of [laptop, firefox]) await page.context().close()
})

test('changing the password in its dialog leaves only this device in the list', async ({ browser }) => {
    const laptop = await device(browser)
    const firefox = await device(browser, FIREFOX_UBUNTU)
    await openAccount(laptop)
    await expect(sessionsOf(laptop).filter({ hasText: 'Firefox · Ubuntu' }).first()).toBeVisible()

    await laptop.getByRole('button', { name: 'Change password' }).click()
    const dialog = laptop.getByRole('dialog', { name: 'Change password' })
    await dialog.getByLabel('Current password').fill(password)
    await dialog.getByLabel('New password').fill(NEW_PASSWORD)
    await dialog.getByRole('button', { name: 'Change password' }).click()
    password = NEW_PASSWORD

    await expect(dialog).toHaveCount(0)
    await expect(laptop.getByText('Password changed. Other devices have been signed out.')).toBeVisible()
    await expect(sessionsOf(laptop)).toHaveCount(1)
    await expect(sessionsOf(laptop).first()).toContainText('This device')
    await expectSentToSignIn(
        firefox,
        'Your password was just changed on another device · sign in with the new password'
    )

    for (const page of [laptop, firefox]) await page.context().close()
})

test('a forgotten current password is reset by code in the dialog; both tabs here carry on, other devices do not', async ({
    browser
}) => {
    test.slow() // may wait out the minute between code emails
    const laptop = await device(browser)
    // A second tab of the same browser: the same cookie, so the same session.
    const secondTab = await laptop.context().newPage()
    await secondTab.goto('/study')
    await expect(secondTab.getByRole('button', { name: /open your menu$/ })).toBeVisible()
    const firefox = await device(browser, FIREFOX_UBUNTU)
    await openAccount(laptop)

    await laptop.getByRole('button', { name: 'Change password' }).click()
    let sentAt = new Date()
    await laptop.getByRole('dialog').getByRole('button', { name: 'Forgot password?' }).click()
    const dialog = laptop.getByRole('dialog', { name: 'Choose a new password' })
    await expect(dialog.getByText(`We sent a 6-digit one-time code to ${email}.`)).toBeVisible()
    // The account's first code went out under a minute ago (D-136): the dialog
    // says so and counts down; then "Send again".
    const tooSoon = dialog.getByText(/We just sent a code to this email/)
    if (await tooSoon.isVisible()) {
        const sendAgain = dialog.getByRole('button', { name: 'Send again' })
        await expect(sendAgain).toBeEnabled({ timeout: 65_000 })
        sentAt = new Date()
        await sendAgain.click()
        await expect(tooSoon).toHaveCount(0)
    }
    await dialog.getByLabel('6-digit one-time code').fill(await codeFromEmail(email, 'Reset', sentAt))
    await dialog.getByLabel('New password').fill(RESET_PASSWORD)
    await dialog.getByRole('button', { name: 'Set password' }).click()
    password = RESET_PASSWORD

    // Every earlier session ended, this one too; the new one carries on here unseen (D-62).
    await expect(dialog).toHaveCount(0)
    await expect(laptop.getByText('New password set. Your other devices were signed out.')).toBeVisible()
    await expect(sessionsOf(laptop)).toHaveCount(1)
    // The other tab finds its session ended and takes up the new one from the cookie (D-74).
    await openAccountMenuItem(secondTab, 'Settings')
    await expect(secondTab.getByRole('heading', { level: 1, name: 'Account' })).toBeVisible()
    await expect(sessionsOf(secondTab)).toHaveCount(1)
    // Which left this tab's session alone.
    await laptop.reload()
    await expect(sessionsOf(laptop).first()).toContainText('This device')
    await expectSentToSignIn(
        firefox,
        'Your password was just changed on another device · sign in with the new password'
    )

    for (const page of [laptop, firefox]) await page.context().close()
})
