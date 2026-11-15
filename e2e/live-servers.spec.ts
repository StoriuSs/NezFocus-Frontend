import { expect, test, type Browser } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * A server kept live through the socket (D-178): what An changes reaches
 * Bình's open browser without a reload. A channel An makes shows up in
 * Bình's list; deleted while Bình has it open, Bình goes to the first text
 * channel and is told (02 `channel-removed`). Someone kicked is in
 * membership.spec.ts.
 *
 * Needs the API and Mailpit, like messaging.spec.ts.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`

let anToken: string
let binhEmail: string
let serverId: string
let firstPath: string

async function ok(method: string, path: string, body?: object, token?: string, key?: string) {
    const response = await fetch(`${apiUrl}/${path}`, {
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

    binhEmail = `e2e-live-binh-${browserName}${stamp}@example.test`
    anToken = await account(`e2e-live-an-${browserName}${stamp}@example.test`, 'An', `e2e_la${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_lb${stamp}`)

    const server: { id: string; channels: { id: string; type: string }[] } = (
        await ok('POST', 'servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, anToken, crypto.randomUUID())
    ).data
    serverId = server.id
    const invite: { code: string } = (
        await ok(
            'POST',
            `servers/${serverId}/invites`,
            { max_age_seconds: null, max_uses: null },
            anToken,
            crypto.randomUUID()
        )
    ).data
    await ok('POST', `invites/${invite.code}/accept`, {}, binh)
    const first = server.channels.find((channel) => channel.type === 'text')
    firstPath = `/channels/${serverId}/${first!.id}`
})

/** Bình's own browser, signed in, on the server's first text channel. */
async function openAsBinh(browser: Browser) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
    await asOwnClient(context)
    const page = await context.newPage()
    const problems = await watchForProblems(page)
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(binhEmail)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.goto(firstPath)
    await expect(page.getByRole('log')).toBeVisible({ timeout: 20_000 })
    return { context, page, problems }
}

test('a channel made shows up at once; deleted while open, it goes to the first text channel and says so', async ({
    browser
}) => {
    const { context, page, problems } = await openAsBinh(browser)
    const channels = page.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })

    const made: { id: string } = (
        await ok(
            'POST',
            `servers/${serverId}/channels`,
            { type: 'text', name: 'de-cuong-l9a', is_private: false, view_role_ids: [] },
            anToken,
            crypto.randomUUID()
        )
    ).data
    await channels.getByRole('link', { name: 'de-cuong-l9a' }).click({ timeout: 5000 })
    await expect(page).toHaveURL(new RegExp(`/channels/${serverId}/${made.id}$`))

    await ok('DELETE', `servers/${serverId}/channels/${made.id}`, undefined, anToken)

    await expect(page.getByText('This channel is no longer available')).toBeVisible({ timeout: 5000 })
    await expect(page).toHaveURL(new RegExp(`${firstPath}$`))
    await expect(channels.getByRole('link', { name: 'de-cuong-l9a' })).toHaveCount(0)
    expect(problems).toEqual([])
    await context.close()
})
