import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * The chat part of M1 against the real API (M2 L10a): "X joined the server"
 * in the welcome channel as someone joins (REQ-SRV-01, D-83, D-180), the
 * composer shut while timed out, until when, and open again by itself once
 * the timeout ends, the draft back (02 `timed-out`, C-12 `disabled`), and
 * shut in a channel only moderators post in (02 `managers-only`).
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
let dungToken: string
let chiId: string
let serverId: string
let inviteCode: string
const channels: Record<string, string> = {}
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

    anEmail = `e2e-lock-an-${browserName}${stamp}@example.test`
    chiEmail = `e2e-lock-chi-${browserName}${stamp}@example.test`
    anToken = await account(anEmail, 'An', `e2e_la${stamp}`)
    const chi = await account(chiEmail, 'Chi', `e2e_lc${stamp}`)
    dungToken = await account(`e2e-lock-dung-${browserName}${stamp}@example.test`, 'Dũng', `e2e_ld${stamp}`)

    const server: { id: string; channels: { id: string; name: string }[] } = (
        await ok('POST', 'servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, anToken, crypto.randomUUID())
    ).data
    serverId = server.id
    for (const channel of server.channels) channels[channel.name] = channel.id
    inviteCode = (
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
    await ok('POST', `invites/${inviteCode}/accept`, {}, chi)
    chiId = ((await ok('GET', 'users/me', undefined, chi)).data as { id: string }).id
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A browser of its own, signed in, on a channel of the server. */
async function openAs(browser: Browser, email: string, channel: string) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
    await asOwnClient(context)
    const page = await context.newPage()
    const problems = await watchForProblems(page)
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.goto(`/channels/${serverId}/${channels[channel]}`)
    await expect(page.getByRole('log')).toBeVisible({ timeout: 20_000 })
    return { context, page, problems }
}

test('someone joining is told in the welcome channel, to everyone there at once (D-83, D-180)', async ({ browser }) => {
    test.setTimeout(60_000)
    const an = await openAs(browser, anEmail, 'chao-mung')
    await expect(an.page.getByRole('log').getByRole('article', { name: /^Chi joined the server/ })).toBeVisible()

    await ok('POST', `invites/${inviteCode}/accept`, {}, dungToken)

    await expect(an.page.getByRole('log').getByRole('article', { name: /^Dũng joined the server/ })).toBeVisible({
        timeout: 5000
    })
    await shoot(an.page, 'chat01-joined')
    expect(an.problems).toEqual([])
    await an.context.close()
})

test('a timeout shuts the composer at once, says until when, and it opens again by itself, the draft back', async ({
    browser
}) => {
    test.setTimeout(150_000)
    const chi = await openAs(browser, chiEmail, 'hoi-dap')
    const box = chi.page.getByRole('combobox', { name: 'Message #hoi-dap' })
    await box.fill('Câu 5 đổi biến thế nào')

    await ok('PATCH', `servers/${serverId}/members/${chiId}`, { timeout_seconds: 60, reason: null }, anToken)

    const shut = chi.page.getByText(/^You're timed out until \d\d:\d\d · you can't send messages yet$/)
    await expect(shut).toBeVisible({ timeout: 5000 })
    await expect(box).toHaveCount(0)
    await shoot(chi.page, 'chat01-timed-out')

    // No event when a timeout ends: the page reads the server again at its end.
    await expect(box).toHaveValue('Câu 5 đổi biến thế nào', { timeout: 75_000 })
    await expect(shut).toHaveCount(0)
    expect(chi.problems).toEqual([])
    await chi.context.close()
})

test('a channel only moderators post in shuts the composer, saying so', async ({ browser }) => {
    test.setTimeout(60_000)
    const chi = await openAs(browser, chiEmail, 'thong-bao')

    // Shown in place of the box; the drop overlay, hidden until files are dragged, has the same words.
    await expect(
        chi.page.getByText('Only moderators can send messages in this channel').filter({ visible: true })
    ).toBeVisible()
    await expect(chi.page.getByRole('combobox', { name: 'Message #thong-bao' })).toHaveCount(0)
    await shoot(chi.page, 'chat01-managers-only')
    expect(chi.problems).toEqual([])
    await chi.context.close()
})
