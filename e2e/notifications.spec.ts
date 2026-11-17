import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * The inbox between the API, the socket and a browser (S-NOTI-01,
 * REQ-NOTIF-01 → 03): An mentions Bình in #hoi-dap while Bình is on another
 * page; the rail's "Notifications" counts it at once, the inbox shows who,
 * what and where; opening the row goes to the message, and reading it in
 * the channel marks the item read (D-199 / NOTIF-02). Then three more: ✓
 * marks one, "Mark all read" the rest, and a message An deletes takes its
 * item away while the inbox is open.
 *
 * Needs the API (with Redis, for the socket) and Mailpit, like
 * messaging.spec.ts. With E2E_SHOTS set to a folder, it also saves the
 * screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`

let anToken: string
let binhEmail: string
let binhId: string
let serverId: string
let channelId: string

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
    return response.status === 204 ? { data: undefined as never } : ((await response.json()) as { data: never })
}

/** An's message in #hoi-dap; its id. */
async function send(content: string): Promise<string> {
    const message: { id: string } = (
        await ok(
            'POST',
            `channels/${channelId}/messages`,
            { content, nonce: crypto.randomUUID() },
            anToken,
            crypto.randomUUID()
        )
    ).data
    return message.id
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

    binhEmail = `e2e-noti-binh-${browserName}${stamp}@example.test`
    anToken = await account(`e2e-noti-an-${browserName}${stamp}@example.test`, 'An', `e2e_na${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_nb${stamp}`)
    binhId = ((await ok('GET', 'users/me', undefined, binh)).data as { id: string }).id

    const server: { id: string; channels: { id: string; name: string }[] } = (
        await ok('POST', 'servers', { name: 'Nhóm đồ án Mobile', template: 'study' }, anToken, crypto.randomUUID())
    ).data
    const invite: { code: string } = (
        await ok(
            'POST',
            `servers/${server.id}/invites`,
            { max_age_seconds: null, max_uses: null },
            anToken,
            crypto.randomUUID()
        )
    ).data
    await ok('POST', `invites/${invite.code}/accept`, {}, binh)
    serverId = server.id
    channelId = server.channels.find((channel) => channel.name === 'hoi-dap')!.id
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** Bình in a browser of his own, signed in, on the Study page. */
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
    return { context, page, problems }
}

const pages = (page: Page) => page.getByRole('navigation', { name: 'Pages' })
const inbox = (page: Page) => page.getByRole('dialog', { name: 'Notifications' })

test('a mention reaches the inbox at once, and reading the message in its channel marks it read', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const binh = await openAsBinh(browser)
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible({
        timeout: 20_000
    })

    const messageId = await send(`<@${binhId}> bring the laptop tomorrow`)

    const bell = pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' })
    await expect(bell).toBeVisible({ timeout: 15_000 })
    await bell.click()
    const row = inbox(binh.page).getByRole('link', {
        name: /^Unread\. An mentioned you: @Bình bring the laptop tomorrow\. #hoi-dap, Nhóm đồ án Mobile, \d\d:\d\d$/
    })
    await expect(row).toBeFocused()
    await expect(inbox(binh.page).getByRole('heading', { name: 'Today' })).toBeVisible()
    await shoot(binh.page, 'noti01-default')

    await row.click()
    await expect(inbox(binh.page)).toBeHidden()
    await binh.page.waitForURL(new RegExp(`/channels/${serverId}/${channelId}`))
    await expect(binh.page.getByText('bring the laptop tomorrow')).toBeVisible()
    // Read in the channel (and from the click): no count left.
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible({
        timeout: 15_000
    })

    await pages(binh.page).getByRole('button', { name: 'Notifications', exact: true }).click()
    await expect(inbox(binh.page).getByRole('link', { name: /^An mentioned you/ })).toBeVisible()
    await expect(inbox(binh.page).getByRole('button', { name: 'Mark every notification as read' })).toHaveCount(0)
    await binh.page.keyboard.press('Escape')
    await expect(inbox(binh.page)).toBeHidden()

    expect(messageId).toBeTruthy()
    expect(binh.problems).toEqual([])
    await binh.context.close()
})

test('✓ marks one item read, "Mark all read" the rest, and a deleted message takes its item away', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const binh = await openAsBinh(browser)
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible({
        timeout: 20_000
    })

    await send(`<@${binhId}> the slides are in the drive`)
    await send(`@everyone meeting at 21:00`)
    const gone = await send(`<@${binhId}> ignore this one`)

    const bell = pages(binh.page).getByRole('button', { name: 'Notifications, 3 unread' })
    await expect(bell).toBeVisible({ timeout: 15_000 })
    await bell.click()
    await expect(
        inbox(binh.page).getByRole('link', { name: /^Unread\. An mentioned @everyone: @everyone meeting/ })
    ).toBeVisible()

    const slides = inbox(binh.page).getByRole('article', { name: /An mentioned you: @Bình the slides/ })
    await slides.hover()
    await shoot(binh.page, 'noti01-hover')
    await slides.getByRole('button', { name: 'Mark as read' }).click()
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible()
    await expect(inbox(binh.page)).toBeVisible()

    await ok('DELETE', `messages/${gone}`, undefined, anToken)
    await expect(inbox(binh.page).getByRole('link', { name: /ignore this one/ })).toHaveCount(0, { timeout: 15_000 })
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible()

    await inbox(binh.page).getByRole('button', { name: 'Mark every notification as read' }).click()
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await expect(inbox(binh.page).getByRole('link', { name: /^Unread\./ })).toHaveCount(0)
    await expect(inbox(binh.page).getByText("That's every notification from the last 90 days")).toBeVisible()
    await shoot(binh.page, 'noti01-all-read')

    expect(binh.problems).toEqual([])
    await binh.context.close()
})
