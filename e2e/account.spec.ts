import { expect, test, type Page } from '@playwright/test'
import {
    apiUrl,
    asOwnClient,
    codeFromEmail,
    emailTo,
    openAccountMenuItem,
    requireTestableTurnstile,
    solveTurnstile,
    submitPatiently,
    watchForProblems
} from './helpers'

/**
 * An account's whole life, in a real browser against the real API: sign up,
 * confirm the address with the emailed code (which signs in), choose a
 * username, stay signed in across a reload, reset a forgotten password (which
 * signs in), delete the account. Plus the parts only a browser shows: the
 * refresh cookie crossing origins, and a deep link coming back after sign-in.
 *
 * Needs the API (E2E_API_URL, default http://localhost:8888/api/v1) and the
 * Mailpit it sends email to (E2E_MAILPIT_URL, default http://localhost:8025):
 * `pnpm docker:dev` in the API repository starts both. Each browser project
 * makes its own account.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const RESET_PASSWORD = 'Reset-Kettle-Moss-5'

let email: string
let username: string

test.beforeAll(async ({ browserName }) => {
    const live = await fetch(`${apiUrl}/health/live`).catch(() => null)
    if (!live?.ok) {
        throw new Error(`The API is not answering at ${apiUrl}/health/live. Start it (pnpm docker:dev in the API).`)
    }
    await requireTestableTurnstile()
    const id = `${browserName}${Date.now().toString(36)}`
    email = `e2e-${id}@example.test`
    username = `e2e_${id}`.slice(0, 25)
})

test.beforeEach(async ({ context }) => {
    await asOwnClient(context)
})

async function signIn(page: Page, password: string) {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('sign up, confirm the address (which signs in), choose a username', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/')
    await page.getByRole('link', { name: 'Get Started' }).click()

    // A common password passes every rule the browser checks; the API refuses it.
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill('Password1!')
    await page.getByLabel('Confirm password').fill('Password1!')
    await solveTurnstile(page, { always: true })
    await page.getByRole('button', { name: 'Create account' }).click()
    await expect(page.getByText('Not a common password', { exact: false })).toBeVisible()

    const sentAt = new Date()
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirm password').fill(PASSWORD)
    await solveTurnstile(page, { always: true })
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.waitForURL(/\/verify-email$/)
    // The address is shown, not editable: the code belongs to that account.
    await expect(page.getByTestId('sent-to')).toHaveText(email)
    await expect(page.getByLabel('Email')).toHaveCount(0)

    // Signing in before confirming leads back here, not to a dead end.
    await page.goto('/sign-in')
    await signIn(page, PASSWORD)
    await page.waitForURL(/\/verify-email$/)
    await expect(page.getByText("Your email isn't confirmed yet")).toBeVisible()

    // The right code signs in: no password to type again.
    await page.getByLabel('Code').fill(await codeFromEmail(email, 'Verify', sentAt))
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText('Your email is confirmed. Welcome!')).toBeVisible()

    const prompt = page.getByRole('dialog', { name: 'Choose your username' })
    await expect(prompt).toBeVisible()
    await prompt.getByLabel('Username').fill(username)
    const confirm = prompt.getByRole('button', { name: 'Confirm Username' })
    await expect(confirm).toBeEnabled() // the availability check answered
    await confirm.click()
    await expect(prompt).toBeHidden()
    expect(problems).toEqual([])
})

test('a reload keeps the session; a deep link comes back after sign-in', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/settings')
    await page.waitForURL(/\/sign-in\?redirect=%2Fsettings/)
    await signIn(page, PASSWORD)
    await page.waitForURL(/\/settings$/)
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // A reload has no access token in memory: only the refresh cookie, sent
    // across origins to the API, can bring the session back.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()

    expect(problems).toEqual([])
})

test('reset a forgotten password with an emailed code; the old one no longer works', async ({
    page,
    browser,
    baseURL
}) => {
    // Room to wait out the one-code-email-a-minute limit (submitPatiently).
    test.setTimeout(120_000)
    const problems = await watchForProblems(page)
    await page.goto('/sign-in')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('link', { name: 'Forgot your password?' }).click()
    await expect(page.getByLabel('Email')).toHaveValue(email)
    const sentAt = new Date()
    // One code email a minute per address: sign-up's may be that recent.
    await submitPatiently(page, 'Send code')
    await page.waitForURL(/\/reset-password$/)
    await expect(page.getByTestId('sent-to')).toHaveText(email)

    await page.getByLabel('Code').fill(await codeFromEmail(email, 'Reset', sentAt))
    await page.getByLabel('New password').fill(RESET_PASSWORD)
    await page.getByLabel('Confirm password').fill(RESET_PASSWORD)
    await page.getByRole('button', { name: 'Change password', exact: true }).click()

    // Signed in by the reset itself.
    await page.waitForURL((url) => url.pathname === '/')
    await expect(page.getByText("Password changed. You're signed in")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible()

    // In a browser with no session, the old password is refused and the new one signs in.
    // (Not by signing out here: that reloads the page, racing the next goto.)
    const elsewhere = await browser.newContext({ baseURL })
    await asOwnClient(elsewhere)
    const other = await elsewhere.newPage()
    await other.goto('/sign-in')
    await signIn(other, PASSWORD)
    await expect(other.getByText('Incorrect email or password.')).toBeVisible()
    await signIn(other, RESET_PASSWORD)
    await expect(other.getByRole('button', { name: 'Account menu' })).toBeVisible()
    await elsewhere.close()
    expect(problems).toEqual([])
})

test('delete the account: signed out, and the account is gone', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/sign-in')
    await signIn(page, RESET_PASSWORD)
    await openAccountMenuItem(page, 'Profile')

    await page.getByRole('button', { name: 'Delete Account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account' })
    // Proof first: the password, and a wrong one is refused.
    const confirmDelete = dialog.getByRole('button', { name: 'Delete my account' })
    await expect(confirmDelete).toBeDisabled()
    await dialog.getByLabel('Password', { exact: true }).fill('Wrong-Password-1')
    await confirmDelete.click()
    await expect(dialog.getByText("That password isn't right.")).toBeVisible()
    const deletedAt = new Date()
    await dialog.getByLabel('Password', { exact: true }).fill(RESET_PASSWORD)
    await confirmDelete.click()
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Your account was deleted.')).toBeVisible()
    await emailTo(email, 'account was deleted', deletedAt)

    await page.goto('/sign-in')
    await signIn(page, RESET_PASSWORD)
    await expect(page.getByText('Incorrect email or password.')).toBeVisible()
    expect(problems).toEqual([])
})
