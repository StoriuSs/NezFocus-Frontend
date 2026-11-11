import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, emailTo, watchForProblems } from './helpers'

/**
 * Deleting an account waits 14 days (REQ-AUTH-09, D-141): asking ends every
 * session, on this device and the others, and each lands on sign in with the
 * day it goes. Signing in again stops at a dialog that offers to restore it:
 * "Not now" leaves it waiting and signed out, "Restore account" carries on
 * into the app. Each device is a browser context of its own.
 *
 * First, the servers it owns (S-ME-03, D-76, D-121): one Bình is in has to be
 * handed over before any password; the one only it is in is named as going
 * with the account.
 *
 * Needs the API and Mailpit, like account.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

let email: string

/** A completed account, made through the API: this spec is about what comes after. */
test.beforeAll(async ({ browserName }) => {
    email = `e2e-deletion-${browserName}${Date.now().toString(36)}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const post = async <T>(path: string, body: object, token?: string): Promise<T> => {
        const response = await fetch(`${apiUrl}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Origin: 'http://localhost:3001',
                // Creating a server or an invite asks for one; the rest ignore it.
                'Idempotency-Key': crypto.randomUUID(),
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(body)
        })
        expect(response.ok, `POST ${path}: ${response.status}`).toBe(true)
        return ((await response.json()) as { data: T }).data
    }
    const account = async (address: string, displayName: string) => {
        const sentAt = new Date()
        await post('auth/email-code', { email: address })
        const verified = await post<{ access_token: string }>('auth/email-code/verify', {
            email: address,
            code: await codeFromEmail(address, 'code', sentAt)
        })
        await post(
            'auth/complete-account',
            {
                display_name: displayName,
                username: `e2e_d${Math.random().toString(36).slice(2, 10)}`,
                password: PASSWORD,
                timezone: 'Asia/Ho_Chi_Minh',
                language: 'en',
                terms_accepted: true
            },
            verified.access_token
        )
        return verified.access_token
    }
    const token = await account(email, 'E2E')
    const binh = await account(`e2e-deletion-binh-${browserName}${Date.now().toString(36)}@example.test`, 'Bình')
    const server = async (name: string) =>
        (await post<{ id: string }>('servers', { name, template: 'study' }, token)).id
    const shared = await server('Ôn thi Giải tích 2')
    await server('CLB Guitar PTIT')
    const invite = await post<{ code: string }>(
        `servers/${shared}/invites`,
        { max_age_seconds: null, max_uses: null },
        token
    )
    await post(`invites/${invite.code}/accept`, {}, binh)
})

/** A device (its own browser context) on the sign-in page, by password. */
async function device(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext()
    await asOwnClient(context)
    const page = await context.newPage()
    await page.goto('/login?method=password')
    return { context, page }
}

async function signIn(page: Page) {
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

/** dd/mm/yyyy, 14 days from now, in the account's zone: what the pages show. */
function inFourteenDays(): string {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
    return parts
}

test('owning a server with others in it, one hands it over first; one only they are in is named', async ({
    browser
}) => {
    test.setTimeout(90_000)
    const { context, page } = await device(browser)
    await signIn(page)
    await page.waitForURL(/\/study$/)
    const problems = await watchForProblems(page)

    await page.goto('/settings/account')
    await page.getByRole('button', { name: 'Delete account' }).click()
    const blocked = page.getByRole('dialog', { name: 'Hand over your servers first' })
    await expect(blocked).toContainText('You own 1 server that has other members.')
    const row = blocked.getByRole('button', { name: /Ôn thi Giải tích 2/ })
    await expect(row).toContainText('2 members')
    await page.setViewportSize({ width: 1440, height: 900 })
    await shoot(page, 'me03-delete-blocked-owner')
    await row.click()

    const picker = page.getByRole('dialog', { name: 'Transfer ownership' })
    await picker.getByRole('button', { name: /Bình/ }).click({ timeout: 20_000 })
    const password = page.getByRole('dialog', { name: 'Transfer ownership to Bình?' })
    await password.getByLabel('Your password').fill(PASSWORD)
    await password.getByRole('button', { name: 'Transfer ownership' }).click()
    await expect(page.getByText('Bình now owns the server')).toBeVisible()

    await page.getByRole('button', { name: 'Delete account' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog).toContainText(
        'The server only you are in is deleted with your account: CLB Guitar PTIT. Its invite links stop working now.'
    )
    await shoot(page, 'me03-delete-confirm-alone')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    expect(problems).toEqual([])
    await context.close()
})

test('asking to delete signs out here and on the other device, both told the day it goes', async ({ browser }) => {
    const here = await device(browser)
    const other = await device(browser)
    await signIn(other.page)
    await other.page.waitForURL(/\/study$/)
    await signIn(here.page)
    await here.page.waitForURL(/\/study$/)
    const problems = await watchForProblems(here.page)
    const day = inFourteenDays()

    await here.page.goto('/settings/account')
    await here.page.getByRole('button', { name: 'Delete account' }).click()
    const dialog = here.page.getByRole('dialog', { name: 'Delete your account?' })
    await expect(dialog).toContainText(`deleted for good on ${day}`)
    const askedAt = new Date()
    await dialog.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await dialog.getByRole('button', { name: 'Delete account' }).click()

    const banner = `Your account will be deleted for good on ${day} · sign in before then to restore it`
    await here.page.waitForURL(/\/login$/)
    await expect(here.page.getByText(banner)).toBeVisible()
    expect((await emailTo(email, 'will be deleted on', askedAt)).Text).toContain(day)

    // The other device finds out at its next request.
    await other.page.goto('/settings/account')
    await expect(other.page.getByText(banner)).toBeVisible()

    expect(problems).toEqual([])
    await here.context.close()
    await other.context.close()
})

test('signing in again stops at the restore dialog: "Not now" leaves it waiting, "Restore" carries on', async ({
    browser
}) => {
    const { context, page } = await device(browser)
    await signIn(page)

    const dialog = page.getByRole('dialog', { name: 'Your account is waiting to be deleted' })
    await expect(dialog).toContainText(`deleted for good on ${inFourteenDays()} (14 days left)`)
    await dialog.getByRole('button', { name: 'Not now' }).click()

    // Signed out, the page as it was typed.
    await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/\/login\?method=password$/)
    await expect(page.getByLabel('Email')).toHaveValue(email)
    await page.goto('/settings/account')
    await expect(page).toHaveURL(/\/login\?next=/)

    await signIn(page)
    await page
        .getByRole('dialog', { name: 'Your account is waiting to be deleted' })
        .getByRole('button', {
            name: 'Restore account'
        })
        .click()

    await page.waitForURL(/\/settings\/account$/)
    await expect(page.getByText('Account restored')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible()
    await context.close()
})
