import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Invites against the real API (UF-03, S-SRV-02, S-SRV-03, S-SET-04, M1
 * Kiểm 1): An makes a Study Server and copies a link from "Invite people";
 * Bình, without an account, opens it with the welcome channel as its target,
 * signs up through the waiting invite, finishes the account, joins, and lands
 * in that channel. An then finds the link, used once, on the Invites page.
 *
 * Needs the API and Mailpit, like servers.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)

let ownerEmail: string

test.beforeAll(async ({ browserName }) => {
    ownerEmail = `e2e-invites-an-${browserName}${stamp}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const post = async (path: string, body: object, token?: string, key?: string) => {
        const response = await fetch(`${apiUrl}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Origin: 'http://localhost:3001',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(key ? { 'Idempotency-Key': key } : {})
            },
            body: JSON.stringify(body)
        })
        expect(response.ok, `POST ${path}: ${response.status}`).toBe(true)
        return (await response.json()) as { data: { access_token: string } | null }
    }
    const sentAt = new Date()
    await post('auth/email-code', { email: ownerEmail })
    const verified = await post('auth/email-code/verify', {
        email: ownerEmail,
        code: await codeFromEmail(ownerEmail, 'code', sentAt)
    })
    const token = verified.data!.access_token
    await post(
        'auth/complete-account',
        {
            display_name: 'An',
            username: `e2e_i${stamp}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        token
    )
    await post('servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, token, crypto.randomUUID())
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function signInAsAn(page: Page) {
    await asOwnClient(page.context())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(ownerEmail)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Servers' })

test('a friend without an account signs up through the link and lands in its channel', async ({ browser }) => {
    // Two people, a sign-up with an emailed code: longer than one page's test.
    test.setTimeout(120_000)
    // An copies a link from the server menu.
    const owner = await browser.newPage()
    const ownerProblems = await watchForProblems(owner)
    await signInAsAn(owner)
    await rail(owner).getByRole('link', { name: 'Ôn thi Giải tích 2' }).click({ button: 'right' })
    await owner.getByRole('menuitem', { name: 'Invite people' }).click()
    const panel = owner.getByRole('dialog', { name: 'Invite friends to Ôn thi Giải tích 2' })
    const link = panel.getByRole('textbox', { name: 'Invite link' })
    await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9]{8}$/)
    await expect(panel.getByText('Expires in 7 days · no limit on uses')).toBeVisible()
    await shoot(owner, 'srv02-default')
    const code = (await link.inputValue()).split('/invite/')[1]!

    // Change settings in place: the same unlimited settings cannot be asked again.
    await panel.getByRole('button', { name: 'Change settings' }).click()
    const settings = owner.getByRole('dialog', { name: 'Invite link settings' })
    await expect(settings.getByRole('button', { name: 'Create a new link' })).toBeDisabled()
    await settings.getByRole('combobox', { name: 'Max number of uses' }).click()
    await owner.getByRole('option', { name: '10 uses' }).click()
    await expect(settings.getByRole('button', { name: 'Create a new link' })).toBeEnabled()
    await shoot(owner, 'srv02-edit-settings')
    await settings.getByRole('button', { name: 'Back' }).click()
    await expect(link).toHaveValue(new RegExp(`/invite/${code}$`))
    await panel.getByRole('button', { name: 'Done' }).click()

    // The welcome channel (opened first in a Study Server) as the link's target.
    await rail(owner).getByRole('link', { name: 'Ôn thi Giải tích 2' }).click()
    await owner.waitForURL(/\/channels\/[^/]+\/[^/]+$/)
    await expect(owner.getByRole('heading', { level: 1, name: 'chao-mung' })).toBeVisible()
    const [, serverId, channelId] = new URL(owner.url()).pathname.split('/').filter(Boolean)

    // Bình, signed out, in another browser.
    const guestContext = await browser.newContext()
    await asOwnClient(guestContext)
    const guest = await guestContext.newPage()
    const guestProblems = await watchForProblems(guest)
    await guest.setViewportSize({ width: 1440, height: 900 })
    await guest.goto(`/invite/${code}?channel=${channelId}`)
    // The first visit compiles this page in the dev server: allow for it.
    await expect(guest.getByRole('heading', { level: 1, name: 'An invited you to' })).toBeVisible({ timeout: 20_000 })
    await expect(guest.getByText('1 member')).toBeVisible()
    await expect(guest.getByText('#chao-mung')).toBeVisible()
    await expect(guest).toHaveTitle('Ôn thi Giải tích 2 · NezFocus')
    await shoot(guest, 'srv03-guest')

    await guest.getByRole('link', { name: 'Create an account to join' }).click()
    await guest.waitForURL(/\/register\?/)
    await expect(guest.getByText(/Your invite to Ôn thi Giải tích 2 is waiting/)).toBeVisible()
    await shoot(guest, 'auth01-from-invite')
    const guestEmail = `e2e-invites-binh-${stamp}@example.test`
    const sentAt = new Date()
    await guest.getByLabel('Email').fill(guestEmail)
    await guest.getByRole('button', { name: 'Continue', exact: true }).click()
    await guest.waitForURL(/\/verify\?/)
    await guest.getByLabel('6-digit one-time code').fill(await codeFromEmail(guestEmail, 'code to create', sentAt))
    await guest.waitForURL(/\/welcome\?/)
    await expect(guest.getByText(/finish your account to join/)).toBeVisible()
    await guest.getByLabel('Display name').fill('Bình')
    await guest.getByLabel('Username').fill(`e2e_b${stamp}`)
    await guest.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await guest.getByRole('checkbox').check()
    await guest.getByRole('button', { name: 'Enter NezFocus' }).click()

    // Back at the invite, now as a dialog over the app.
    const join = guest.getByRole('dialog', { name: 'An invited you to' })
    await expect(join.getByRole('button', { name: 'Join' })).toBeFocused()
    await shoot(guest, 'srv03-signed-in')
    await join.getByRole('button', { name: 'Join' }).click()
    await guest.waitForURL(new RegExp(`/channels/${serverId}/${channelId}$`))
    await expect(rail(guest).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute('aria-current', 'page')

    // Opening the link again: already a member, no dialog.
    await guest.goto(`/invite/${code}`)
    await expect(guest.getByText("You're already in Ôn thi Giải tích 2")).toBeVisible()
    await guest.waitForURL(new RegExp(`/channels/${serverId}`))

    // An finds the link on the Invites page, used once, and revokes it.
    await owner.goto(`/servers/${serverId}/settings/invites`)
    const row = owner.getByRole('row').filter({ hasText: code })
    await expect(row.getByText('1 / ∞')).toBeVisible()
    await shoot(owner, 'set04-invites')
    await row.getByRole('button', { name: 'Revoke' }).click()
    await owner
        .getByRole('dialog', { name: `Revoke invite ${code}?` })
        .getByRole('button', { name: 'Revoke' })
        .click()
    await expect(owner.getByText('Invite revoked')).toBeVisible()
    await expect(row).toBeHidden()

    // The revoked link no longer opens.
    await guestContext.clearCookies()
    const stranger = await browser.newPage()
    await asOwnClient(stranger.context())
    await stranger.goto(`/invite/${code}`)
    await expect(stranger.getByRole('heading', { level: 1, name: 'This invite is no longer valid' })).toBeVisible()
    await shoot(stranger, 'srv03-expired')

    expect(ownerProblems).toEqual([])
    expect(guestProblems).toEqual([])
    await guestContext.close()
})
