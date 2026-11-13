import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Members and bans against the real API (S-SET-03, S-SET-04, REQ-ROLE-04):
 * An times Chi out from the Members page, bans Bình, who can no longer join
 * through the link, then lifts the ban from the Bans page, after which Bình
 * joins again.
 *
 * Needs the API and Mailpit, like invites.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)

let anEmail: string
let binhToken: string
let serverId: string
let inviteCode: string
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

    anEmail = `e2e-mod-an-${browserName}${stamp}@example.test`
    const an = await account(anEmail, 'An', `e2e_ma${stamp}`)
    binhToken = await account(`e2e-mod-binh-${browserName}${stamp}@example.test`, 'Bình', `e2e_mb${stamp}`)
    const chi = await account(`e2e-mod-chi-${browserName}${stamp}@example.test`, 'Chi', `e2e_mc${stamp}`)

    const server: { id: string } = (
        await ok('POST', 'servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, an, crypto.randomUUID())
    ).data
    serverId = server.id
    const invite: { code: string } = (
        await ok(
            'POST',
            `servers/${serverId}/invites`,
            { max_age_seconds: null, max_uses: null },
            an,
            crypto.randomUUID()
        )
    ).data
    inviteCode = invite.code
    for (const token of [binhToken, chi]) await ok('POST', `invites/${inviteCode}/accept`, {}, token)
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

const rowOf = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByText(name, { exact: true }) })

test('times out and bans from Members, and lifts the ban from Bans', async ({ page }) => {
    test.setTimeout(90_000)
    const problems = await watchForProblems(page)
    await signIn(page, anEmail)

    await page.goto(`/servers/${serverId}/settings/members`)
    await expect(page.getByText('3 members')).toBeVisible({ timeout: 20_000 })
    await shoot(page, 'set03-list')

    // Time Chi out for the default hour, with a reason; the row says until when.
    await rowOf(page, 'Chi').getByRole('button', { name: 'Actions for Chi' }).click()
    await page.getByRole('menuitem', { name: 'Time out' }).click()
    const timeout = page.getByRole('dialog', { name: 'Time out Chi' })
    await expect(timeout.getByRole('radio', { name: '1 hour' })).toBeChecked()
    await timeout.getByLabel('Reason (optional)').fill('Gửi tin liên tục')
    await shoot(page, 'set03-timeout-dialog')
    await timeout.getByRole('button', { name: 'Time out' }).click()
    await expect(page.getByText('Timed out Chi for 1 hour')).toBeVisible()
    await expect(rowOf(page, 'Chi').getByText(/^Timed out until/)).toBeVisible()

    // Ban Bình: gone from the list, and the link no longer lets him in.
    await rowOf(page, 'Bình').getByRole('button', { name: 'Actions for Bình' }).click()
    await page.getByRole('menuitem', { name: 'Ban from server' }).click()
    const ban = page.getByRole('dialog', { name: 'Ban Bình from the server?' })
    // A long reason over several lines (about 300 characters), as a moderator writes one.
    const reason = [
        'Bán đề thi có đáp án trong #tai-lieu hai lần dù đã được nhắc ở #thong-bao.',
        'Đăng link quảng cáo khóa học bên ngoài vào #hoi-dap, làm loãng các câu hỏi của mọi người.',
        'Nhắn riêng cho thành viên mới để mời mua tài liệu. Có thể xin bỏ cấm sau kỳ thi cuối kỳ.'
    ].join('\n')
    await ban.getByLabel('Reason (optional)').fill(reason)
    await shoot(page, 'set03-ban-confirm')
    await ban.getByRole('button', { name: 'Ban' }).click()
    await expect(page.getByText('Banned Bình')).toBeVisible()
    await expect(page.getByText('2 members')).toBeVisible()
    const refused = await call('POST', `invites/${inviteCode}/accept`, {}, binhToken)
    expect(refused.status).toBe(403)

    // Bans: the reason and who banned; unban after asking, and the link works again.
    await page.goto(`/servers/${serverId}/settings/bans`)
    const row = rowOf(page, 'Bình')
    await expect(row.getByText('Bán đề thi có đáp án')).toBeVisible({ timeout: 20_000 })
    // Cut on one line: the date, who banned and Unban stay in the row, nothing scrolls sideways.
    await expect(row.getByRole('button', { name: 'Unban' })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
        0
    )
    await shoot(page, 'set04-bans')
    await row.getByRole('button', { name: 'Unban' }).click()
    await page.getByRole('dialog', { name: 'Unban Bình?' }).getByRole('button', { name: 'Unban' }).click()
    await expect(page.getByText('Unbanned Bình')).toBeVisible()
    await expect(page.getByText('No one is banned')).toBeVisible()
    expect((await call('POST', `invites/${inviteCode}/accept`, {}, binhToken)).status).toBe(200)

    expect(problems).toEqual([])
})
