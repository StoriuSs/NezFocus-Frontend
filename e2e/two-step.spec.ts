import { expect, test, type Page } from '@playwright/test'
import * as OTPAuth from 'otpauth'
import {
    apiUrl,
    asOwnClient,
    codeFromEmail,
    emailTo,
    openAccountMenuItem,
    requireTestableTurnstile,
    solveTurnstile,
    watchForProblems
} from './helpers'

/**
 * Two-step sign-in in a real browser against the real API: turn it on in
 * settings (the QR code's key, a code from an "app", the recovery codes), then
 * sign in with a code. Turning it off with a code, and the recovery codes'
 * rules, are covered by the unit tests and the API's own tests.
 *
 * The authenticator app is otpauth, computing codes from the key the page
 * shows, as an app would from the QR code. Needs what e2e/account.spec.ts
 * needs (docs/e2e-testing.md).
 */
// Room to wait for the app's next 30-second code: the API takes each code once.
test.describe.configure({ timeout: 120_000 })

const PASSWORD = 'Harbour-Lantern-42'

let email: string
let secret: string
/** The last 30-second step a code was used in: the API accepts each code once. */
let lastStep = 0

test.beforeAll(async ({ browserName }) => {
    const live = await fetch(`${apiUrl}/health/live`).catch(() => null)
    if (!live?.ok) {
        throw new Error(`The API is not answering at ${apiUrl}/health/live. Start it (pnpm docker:dev in the API).`)
    }
    await requireTestableTurnstile()
    email = `e2e-2fa-${browserName}${Date.now().toString(36)}@example.test`
})

test.beforeEach(async ({ context }) => {
    await asOwnClient(context)
})

/** The next code the "app" shows, from a 30-second step no earlier code used. */
async function appCode(page: Page): Promise<string> {
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30 })
    let step = Math.floor(Date.now() / 30_000)
    if (step <= lastStep) {
        await page.waitForTimeout((lastStep + 1) * 30_000 - Date.now() + 500)
        step = Math.floor(Date.now() / 30_000)
    }
    lastStep = step
    return totp.generate()
}

async function signInWithPassword(page: Page, password = PASSWORD) {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await solveTurnstile(page)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** From a page other than home: signing out ends with a full page load of `/`, which must finish first. */
async function signOut(page: Page) {
    expect(new URL(page.url()).pathname).not.toBe('/')
    await openAccountMenuItem(page, 'Log out')
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
}

test('turn two-step sign-in on; signing in then asks for a code and comes back to where it was heading', async ({
    page
}) => {
    const problems = await watchForProblems(page)
    await page.goto('/sign-up')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await solveTurnstile(page, { always: true })
    const sentAt = new Date()
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL(/\/verify-email$/)
    await page.getByLabel('Code').fill(await codeFromEmail(email, 'Verify', sentAt))
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/')

    // A new account chooses a username first (e2e/account.spec.ts tests that part).
    const prompt = page.getByRole('dialog', { name: 'Choose your username' })
    await prompt.getByLabel('Username').fill(`e2e_2fa_${Date.now().toString(36)}`.slice(0, 25))
    const confirm = prompt.getByRole('button', { name: 'Confirm Username' })
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(prompt).toBeHidden()

    // On: the key the QR code holds, a code from the "app", the recovery codes once.
    await openAccountMenuItem(page, 'Settings')
    await page.getByRole('button', { name: 'Turn on' }).click()
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible()
    secret = ((await page.locator('code').textContent()) ?? '').replace(/\s/g, '')
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/)
    const turnedOnAt = new Date()
    await page.getByLabel('Code from the app').fill(await appCode(page))
    await page.getByRole('button', { name: 'Turn on' }).click()
    const list = page.getByRole('list', { name: 'Recovery codes' })
    await expect(list.getByRole('listitem')).toHaveCount(10)
    const recoveryCodes = (await list.getByRole('listitem').allTextContents()).map((code) => code.trim())
    await page.getByRole('button', { name: "I've saved them" }).click()
    await expect(page.getByText('10 recovery codes left.')).toBeVisible()
    await emailTo(email, 'Two-step verification was turned on', turnedOnAt)

    // The password alone no longer signs in: the code page asks, keeping the deep link.
    await signOut(page)
    await page.goto('/settings')
    await page.waitForURL(/\/sign-in\?redirect=%2Fsettings/)
    await signInWithPassword(page)
    await page.waitForURL(/\/sign-in\/two-step\?redirect=%2Fsettings$/)

    await page.getByLabel('Code from the app').fill('000000')
    await page.getByRole('button', { name: 'Verify' }).click()
    await expect(page.getByText(/That code isn't right\. \d tries? left\./)).toBeVisible()

    await page.getByLabel('Code from the app').fill(await appCode(page))
    await page.getByRole('button', { name: 'Verify' }).click()
    await page.waitForURL(/\/settings$/)
    // The session is a real one: it survives a reload, through the refresh cookie.
    await page.reload()
    await expect(page.getByText('10 recovery codes left.')).toBeVisible()

    // Leave nothing behind: the account goes, with a recovery code as the second proof.
    await openAccountMenuItem(page, 'Profile')
    await page.getByRole('button', { name: 'Delete Account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account' })
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await dialog.getByLabel('Code from the app, or a recovery code').fill(recoveryCodes[0])
    await dialog.getByRole('button', { name: 'Delete my account' }).click()
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible({ timeout: 15_000 })
    expect(problems).toEqual([])
})
