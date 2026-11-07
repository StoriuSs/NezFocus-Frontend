import { expect, test, type Page } from '@playwright/test'
import {
    apiUrl,
    asOwnClient,
    codeFromEmail,
    emailTo,
    accountMenu,
    openAccountMenuItem,
    submitPatiently,
    watchForProblems
} from './helpers'

/**
 * An account's whole life, in a real browser against the real API: create it
 * with the emailed code (which signs in), complete it (display name, username,
 * password, time zone, terms), stay signed in across a reload, sign in by
 * password and by an emailed code, reset a forgotten password (which signs
 * in), delete the account. Plus the parts only a browser shows: the
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
    const id = `${browserName}${Date.now().toString(36)}`
    email = `e2e-${id}@example.test`
    username = `e2e_${id}`.slice(0, 32)
})

test.beforeEach(async ({ context }) => {
    await asOwnClient(context)
})

/** By password: the page opens on the emailed code (S-AUTH-03, D-68), so change over first when needed. */
async function signIn(page: Page, password: string) {
    // The page has drawn its way by then: the remembered one may be the password already.
    await page.getByLabel('Email').waitFor()
    const passwordField = page.getByLabel('Password', { exact: true })
    if (!(await passwordField.isVisible())) {
        await page.getByRole('button', { name: 'Sign in with password' }).click()
    }
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('create an account: the emailed code signs in, then "complete your account" opens the app', async ({ page }) => {
    const problems = await watchForProblems(page)
    // A visitor at / is sent to sign in (D-127), which links to "Create account".
    await page.goto('/')
    await page.waitForURL(/\/login$/)
    await page.getByRole('link', { name: 'Create an account' }).click()
    await page.waitForURL(/\/register$/)

    // Only the email (D-59): the code goes to it.
    const sentAt = new Date()
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.waitForURL(/\/verify$/)
    await expect(page.getByTestId('sent-to')).toHaveText(email)

    // The sixth digit sends the code by itself; a new address gets a new account.
    await page.getByLabel('6-digit one-time code').fill(await codeFromEmail(email, 'code to create', sentAt))
    await page.waitForURL(/\/welcome$/)

    // Nothing else opens until the account is complete (D-61): the page asked for comes after.
    await page.goto('/settings')
    await page.waitForURL(/\/welcome\?next=%2Fsettings$/)

    await page.getByLabel('Display name').fill('E2E')
    await page.getByLabel('Username').fill(username)
    await expect(page.getByText('Username is available')).toBeVisible()
    await page.getByRole('checkbox').check()

    // The SRS example ontap2026 lacks an upper-case letter and a special
    // character: sending marks those two conditions under the field (C-22).
    await page.getByLabel('Password', { exact: true }).fill('ontap2026')
    await page.getByRole('button', { name: 'Enter NezFocus' }).click()
    await expect(page.getByText("The password doesn't meet the conditions yet")).toBeVisible()
    await expect(page.locator('li[data-state="error"]')).toHaveText([/uppercase/, /special character/])
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)

    // The time zone, searched by city (C-25).
    await page.getByRole('button', { name: 'Time zone' }).click()
    await page.getByRole('combobox', { name: 'Search a city or GMT' }).fill('tokyo')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('button', { name: 'Time zone' })).toHaveText(/GMT\+9 · Tokyo/)

    await page.getByRole('button', { name: 'Enter NezFocus' }).click()
    await page.waitForURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    expect(problems).toEqual([])
})

test('a reload keeps the session; a deep link comes back after sign-in', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/settings')
    await page.waitForURL(/\/login\?next=%2Fsettings/)
    await signIn(page, PASSWORD)
    await page.waitForURL(/\/settings$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()

    // A reload has no access token in memory: only the refresh cookie, sent
    // across origins to the API, can bring the session back.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    await expect(accountMenu(page)).toBeVisible()

    expect(problems).toEqual([])
})

test('sign in with an emailed code: a complete account opens on Study', async ({ page }) => {
    // Room to wait out the one-code-email-a-minute limit (submitPatiently).
    test.setTimeout(120_000)
    const problems = await watchForProblems(page)
    // A browser that has not signed in before opens on the code (D-68).
    await page.goto('/login')
    await expect(page.getByLabel('Password', { exact: true })).toBeHidden()
    await page.getByLabel('Email').fill(email)
    const sentAt = new Date()
    // One code email a minute per address: sign-up's may be that recent.
    await submitPatiently(page, 'Send code')
    await page.waitForURL(/\/verify$/)
    await expect(page.getByTestId('sent-to')).toHaveText(email)

    // No ?next: a complete account lands on Study (D-124).
    await page.getByLabel('6-digit one-time code').fill(await codeFromEmail(email, 'sign-in code', sentAt))
    await page.waitForURL((url) => url.pathname === '/study')
    await expect(accountMenu(page)).toBeVisible()
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
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('link', { name: 'Forgot password?' }).click()
    await expect(page.getByLabel('Email')).toHaveValue(email)
    const sentAt = new Date()
    // One code email a minute per address: sign-up's may be that recent.
    await submitPatiently(page, 'Send code')
    await page.waitForURL(/\/reset-password$/)
    // The same words for every address (NFR-SEC-05).
    await expect(page.getByTestId('sent-to')).toContainText(`If ${email} has a NezFocus account`)

    // Six digits do not send by themselves here: the new password comes next (S-AUTH-04).
    await page.getByLabel('6-digit one-time code').fill(await codeFromEmail(email, 'Reset', sentAt))
    await page.getByLabel('New password').fill(RESET_PASSWORD)
    await page.getByRole('button', { name: 'Set password', exact: true }).click()

    // Signed in by the reset itself.
    await page.waitForURL((url) => url.pathname === '/study')
    await expect(page.getByText('New password set. Your other devices were signed out.')).toBeVisible()
    await expect(accountMenu(page)).toBeVisible()
    await page.reload()
    await expect(accountMenu(page)).toBeVisible()

    // In a browser with no session, the old password is refused and the new one signs in.
    // (Not by signing out here: that reloads the page, racing the next goto.)
    const elsewhere = await browser.newContext({ baseURL })
    await asOwnClient(elsewhere)
    const other = await elsewhere.newPage()
    await other.goto('/login')
    await signIn(other, PASSWORD)
    await expect(other.getByText('Incorrect email or password.')).toBeVisible()
    await signIn(other, RESET_PASSWORD)
    await expect(accountMenu(other)).toBeVisible()
    await elsewhere.close()
    expect(problems).toEqual([])
})

test('delete the account: signed out, and the account is gone', async ({ page }) => {
    const problems = await watchForProblems(page)
    await page.goto('/login')
    await signIn(page, RESET_PASSWORD)
    await openAccountMenuItem(page, /view and edit your profile$/)

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
    await page.waitForURL(/\/login$/, { timeout: 15_000 })
    await expect(page.getByText('Your account was deleted.')).toBeVisible()
    await emailTo(email, 'account was deleted', deletedAt)

    await page.goto('/login')
    await signIn(page, RESET_PASSWORD)
    await expect(page.getByText('Incorrect email or password.')).toBeVisible()
    expect(problems).toEqual([])
})
