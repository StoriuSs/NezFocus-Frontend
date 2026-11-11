import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Leaving, handing over and deleting a server against the real API
 * (03 S-SRV-04, 04 S-SET-07, D-143): Chi, kicked while her page is open,
 * hears she is no longer in it once the tab comes back; An, the owner, is
 * told to hand ÔT over first, gives it to Bình with her password, then
 * leaves; and deletes the server she is alone in, whose link stops working.
 *
 * Needs the API and Mailpit, like invites.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)

let anEmail: string
let chiEmail: string
let anToken: string
let binhToken: string
let otId: string
let ndId: string
let ndInvite: string
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`

async function call(method: string, path: string, body?: object, token?: string, key?: string) {
    return fetch(`${apiUrl}/${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': ip,
            Origin: 'http://localhost:3001',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(key ? { 'Idempotency-Key': key } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    })
}

async function ok(method: string, path: string, body?: object, token?: string, key?: string) {
    const response = await call(method, path, body, token, key)
    expect(response.ok, `${method} ${path}: ${response.status}`).toBe(true)
    return (await response.json()) as { data: never }
}

test.beforeAll(async ({ browserName }) => {
    const account = async (email: string, displayName: string, username: string) => {
        const sentAt = new Date()
        await ok('POST', 'auth/email-code', { email })
        const verified: { access_token: string } = (
            await ok('POST', 'auth/email-code/verify', { email, code: await codeFromEmail(email, 'code', sentAt) })
        ).data
        await ok(
            'POST',
            'auth/complete-account',
            {
                display_name: displayName,
                username,
                password: PASSWORD,
                timezone: 'Asia/Ho_Chi_Minh',
                language: 'en',
                terms_accepted: true
            },
            verified.access_token
        )
        return verified.access_token
    }
    const server = async (name: string) =>
        (
            (await ok('POST', 'servers', { name, template: 'study' }, anToken, crypto.randomUUID())).data as {
                id: string
            }
        ).id
    const invite = async (serverId: string) =>
        (
            (
                await ok(
                    'POST',
                    `servers/${serverId}/invites`,
                    { max_age_seconds: null, max_uses: null },
                    anToken,
                    crypto.randomUUID()
                )
            ).data as { code: string }
        ).code

    anEmail = `e2e-mem-an-${browserName}${stamp}@example.test`
    chiEmail = `e2e-mem-chi-${browserName}${stamp}@example.test`
    anToken = await account(anEmail, 'An', `e2e_wa${stamp}`)
    binhToken = await account(`e2e-mem-binh-${browserName}${stamp}@example.test`, 'Bình', `e2e_wb${stamp}`)
    const chi = await account(chiEmail, 'Chi', `e2e_wc${stamp}`)

    otId = await server('Ôn thi Giải tích 2')
    ndId = await server('Nhóm Đề cương')
    const otInvite = await invite(otId)
    ndInvite = await invite(ndId)
    for (const token of [binhToken, chi]) await ok('POST', `invites/${otInvite}/accept`, {}, token)
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function signIn(page: Page, email: string) {
    await asOwnClient(page.context())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
}

test('someone kicked while the page is open hears it when the tab comes back (D-143)', async ({ page }) => {
    test.setTimeout(60_000)
    const problems = await watchForProblems(page)
    await signIn(page, chiEmail)
    await page.goto(`/channels/${otId}`)
    await expect(page.getByRole('button', { name: 'Ôn thi Giải tích 2' })).toBeVisible({ timeout: 20_000 })

    const members: { items: { user_id: string; display_name: string }[] } = (
        await ok('GET', `servers/${otId}/members?q=Chi`, undefined, anToken)
    ).data
    const chiId = members.items.find((member) => member.display_name === 'Chi')!.user_id
    await ok('DELETE', `servers/${otId}/members/${chiId}`, {}, anToken)

    // The tab coming back into view reads the list again (no live updates until M2).
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange', { bubbles: true })))
    await expect(page.getByText('You are no longer in Ôn thi Giải tích 2')).toBeVisible()
    await page.waitForURL(/\/study$/)
    expect(problems.filter((problem) => !problem.includes('404'))).toEqual([])
})

test('the owner hands the server over with her password, then leaves it', async ({ page }) => {
    test.setTimeout(90_000)
    const problems = await watchForProblems(page)
    await signIn(page, anEmail)
    await page.goto(`/channels/${otId}`)

    await page.getByRole('button', { name: 'Ôn thi Giải tích 2' }).click()
    await page.getByRole('menuitem', { name: 'Leave server' }).click()
    const blocked = page.getByRole('dialog', { name: 'Transfer ownership before leaving' })
    await shoot(page, 'srv04-owner-cannot-leave')
    await blocked.getByRole('button', { name: 'Transfer ownership' }).click()

    const picker = page.getByRole('dialog', { name: 'Transfer ownership' })
    await expect(picker.getByRole('button', { name: /Bình/ })).toBeVisible({ timeout: 20_000 })
    // Chi was kicked: only Bình is left to choose.
    await expect(picker.getByRole('button', { name: /Chi/ })).toHaveCount(0)
    await shoot(page, 'set07-transfer-picker')
    await picker.getByRole('button', { name: /Bình/ }).click()

    const password = page.getByRole('dialog', { name: 'Transfer ownership to Bình?' })
    await password.getByLabel('Your password').fill(PASSWORD)
    await shoot(page, 'set07-transfer-password')
    await password.getByRole('button', { name: 'Transfer ownership' }).click()
    await expect(page.getByText('Bình now owns the server')).toBeVisible()

    const leave = page.getByRole('dialog', { name: 'Leave Ôn thi Giải tích 2?' })
    await shoot(page, 'srv04-leave-confirm')
    await leave.getByRole('button', { name: 'Leave server' }).click()
    await expect(page.getByText('Left Ôn thi Giải tích 2')).toBeVisible()
    await page.waitForURL(new RegExp(`/channels/${ndId}`))

    const binhServers: { servers: { id: string; is_owner: boolean }[] } = (
        await ok('GET', 'servers', undefined, binhToken)
    ).data
    expect(binhServers.servers.find((server) => server.id === otId)?.is_owner).toBe(true)
    expect(problems).toEqual([])
})

test('the owner deletes a server by typing its name, and its link stops working', async ({ page }) => {
    test.setTimeout(60_000)
    const problems = await watchForProblems(page)
    await signIn(page, anEmail)
    await page.goto(`/servers/${ndId}/settings/overview`)

    await page.getByRole('button', { name: 'Delete server' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete Nhóm Đề cương?' })
    const submit = dialog.getByRole('button', { name: 'Delete server' })
    await expect(submit).toBeDisabled()
    await dialog.getByLabel('Type Nhóm Đề cương to confirm').fill('nhom de cuong')
    await shoot(page, 'set07-delete-type-name')
    await submit.click()

    await expect(page.getByText('Deleted Nhóm Đề cương')).toBeVisible()
    // Her last server: the Study page and its "no server yet".
    await page.waitForURL(/\/study$/)
    expect((await call('POST', `invites/${ndInvite}/accept`, {}, binhToken)).status).toBe(410)
    expect(problems).toEqual([])
})
