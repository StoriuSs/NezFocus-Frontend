import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * The inbox between the API, the socket and a browser (S-NOTI-01,
 * REQ-NOTIF-01 → 03): An mentions Bình in #hoi-dap while Bình is on another
 * page; the rail's "Notifications" counts it at once, the inbox shows who,
 * what and where; opening the row goes to the message, and reading it in
 * the channel marks the item read (D-199 / NOTIF-02). Then three more: ✓
 * marks one, "Mark all read" the rest, and a message An deletes takes its
 * item away while the inbox is open. Task items (M3 L7): a task given to
 * Bình opens over the page from its item, a task deleted takes its items
 * away, and a task due in 2 hours reminds Bình in the inbox and in its
 * channel, whose "View task" opens it (the tasks queue's job, D-95). Server
 * items (M3 L8): a server handed to Bình opens its settings, a timeout its
 * first text channel; kicked while away, his next visit says so in a Toast
 * whose "View" opens the inbox, the kick read there (11 S-MOD-02 › H1, D-201).
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
let binhToken: string
let serverId: string
let channelId: string
let boardId: string

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
    binhToken = binh

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
    // The Study template's #viec-nhom has its Task Board on.
    boardId = server.channels.find((channel) => channel.name === 'viec-nhom')!.id
})

/** An's task in #viec-nhom given to Bình; its id. */
async function giveTask(title: string, dueAt: Date): Promise<string> {
    const task: { id: string } = (
        await ok(
            'POST',
            `channels/${boardId}/tasks`,
            { title, due_at: dueAt.toISOString(), assignee_ids: [binhId] },
            anToken,
            crypto.randomUUID()
        )
    ).data
    return task.id
}

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

test('a task given opens over the page from its item, and a task deleted takes its items away', async ({ browser }) => {
    test.setTimeout(120_000)
    const binh = await openAsBinh(browser)
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible({
        timeout: 20_000
    })

    const taskId = await giveTask('Chuẩn bị demo cuối kỳ', new Date(Date.now() + 3 * 86_400_000))
    const bell = pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' })
    await expect(bell).toBeVisible({ timeout: 15_000 })
    await bell.click()
    const row = inbox(binh.page).getByRole('link', {
        name: /^Unread\. An gave you a task: Chuẩn bị demo cuối kỳ: Due \d\d\/\d\d · \d\d:\d\d\. #viec-nhom, Nhóm đồ án Mobile, \d\d:\d\d$/
    })
    await expect(row).toBeVisible()
    await shoot(binh.page, 'noti01-task-assigned')

    await row.click()
    await expect(inbox(binh.page)).toBeHidden()
    await expect(binh.page).toHaveURL(new RegExp(`/study\\?task=${taskId}$`))
    const detail = binh.page.getByRole('dialog', { name: 'Chuẩn bị demo cuối kỳ' })
    await expect(detail).toBeVisible({ timeout: 15_000 })
    await binh.page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()

    // A second task, then deleted while the inbox is open: its item leaves, and the count with it.
    const second = await giveTask('Làm slide thuyết trình', new Date(Date.now() + 3 * 86_400_000))
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible({
        timeout: 15_000
    })
    await pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' }).click()
    await expect(
        inbox(binh.page).getByRole('link', { name: /An gave you a task: Làm slide thuyết trình/ })
    ).toBeVisible()
    await ok('DELETE', `tasks/${second}`, undefined, anToken)
    await expect(inbox(binh.page).getByRole('link', { name: /Làm slide thuyết trình/ })).toHaveCount(0, {
        timeout: 15_000
    })
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
    await expect(inbox(binh.page).getByRole('link', { name: /Chuẩn bị demo cuối kỳ/ })).toBeVisible()

    expect(binh.problems).toEqual([])
    await binh.context.close()
})

test('a task due in 2 hours reminds in the inbox and in its channel, whose "View task" opens it', async ({
    browser
}) => {
    test.setTimeout(150_000)
    const binh = await openAsBinh(browser)
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications', exact: true })).toBeVisible({
        timeout: 20_000
    })

    // The 2-hour mark 20 seconds from now; the 24-hour one is gone already, so not sent (D-95).
    const taskId = await giveTask('Nộp báo cáo giữa kỳ', new Date(Date.now() + 2 * 3_600_000 + 20_000))
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications, 1 unread' })).toBeVisible({
        timeout: 15_000
    })
    await expect(pages(binh.page).getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible({
        timeout: 60_000
    })
    await pages(binh.page).getByRole('button', { name: 'Notifications, 2 unread' }).click()
    await expect(
        inbox(binh.page).getByRole('link', {
            name: /^Unread\. 2 hours left: Nộp báo cáo giữa kỳ\. #viec-nhom, Nhóm đồ án Mobile, \d\d:\d\d$/
        })
    ).toBeVisible()
    await expect(inbox(binh.page).getByRole('link', { name: /24 hours left/ })).toHaveCount(0)
    await shoot(binh.page, 'noti01-task-reminder')
    await binh.page.keyboard.press('Escape')

    await binh.page.goto(`/channels/${serverId}/${boardId}`)
    const reminder = binh.page.getByRole('article', { name: /^2 hours left: Nộp báo cáo giữa kỳ · Bình, \d\d:\d\d$/ })
    await expect(reminder).toBeVisible({ timeout: 15_000 })
    await shoot(binh.page, 'task01-reminder')
    await reminder.getByRole('button', { name: 'View task' }).click()
    await expect(binh.page).toHaveURL(new RegExp(`/channels/${serverId}/${boardId}\\?task=${taskId}$`))
    await expect(binh.page.getByRole('dialog', { name: 'Nộp báo cáo giữa kỳ' })).toBeVisible({ timeout: 15_000 })

    expect(binh.problems).toEqual([])
    await binh.context.close()
})

test('a handed server and a timeout open their places; kicked while away, the next visit says so (11 › H1)', async ({
    browser
}) => {
    test.setTimeout(120_000)
    // A second server of An's, handed to Bình (D-91: not to one timed out, so before the timeout).
    const guitar: { id: string } = (
        await ok('POST', 'servers', { name: 'CLB Guitar PTIT', template: 'study' }, anToken, crypto.randomUUID())
    ).data
    const invite: { code: string } = (
        await ok(
            'POST',
            `servers/${guitar.id}/invites`,
            { max_age_seconds: null, max_uses: null },
            anToken,
            crypto.randomUUID()
        )
    ).data
    await ok('POST', `invites/${invite.code}/accept`, {}, binhToken)
    await ok('POST', `servers/${guitar.id}/transfer`, { user_id: binhId, password: PASSWORD }, anToken)
    await ok(
        'PATCH',
        `servers/${serverId}/members/${binhId}`,
        { timeout_seconds: 3600, reason: 'Gửi tin liên tục' },
        anToken
    )

    const binh = await openAsBinh(browser)
    const bell = pages(binh.page).getByRole('button', { name: /^Notifications/ })
    await bell.click()
    const handed = inbox(binh.page).getByRole('link', {
        name: /^Unread\. An made you the owner of CLB Guitar PTIT\. CLB Guitar PTIT, \d\d:\d\d$/
    })
    const timedOut = inbox(binh.page).getByRole('link', {
        name: /^Unread\. You are timed out in Nhóm đồ án Mobile until \d\d:\d\d\. You cannot send messages or join rooms yet\. Reason: Gửi tin liên tục\. Nhóm đồ án Mobile, \d\d:\d\d$/
    })
    await expect(handed).toBeVisible({ timeout: 15_000 })
    await expect(timedOut).toBeVisible()
    await shoot(binh.page, 'noti01-server-items')
    await handed.click()
    await expect(binh.page).toHaveURL(new RegExp(`/servers/${guitar.id}/settings`))
    await bell.click()
    await inbox(binh.page)
        .getByRole('link', { name: /You are timed out/ })
        .click()
    await expect(binh.page).toHaveURL(new RegExp(`/channels/${serverId}/[0-9a-f-]{36}$`))
    expect(binh.problems).toEqual([])
    await binh.context.close()

    // No tab of his left: the kick's item is made unread (D-187, D-201). The socket's goodbye
    // reaches the API a moment after the tab closes; the item is checked below, not assumed.
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await ok('DELETE', `servers/${serverId}/members/${binhId}`, { reason: 'Nhắn ngoài chủ đề nhiều lần' }, anToken)
    await expect
        .poll(async () => {
            const inboxNow: { items: { server: { action: string | null } | null; read_at: string | null }[] } = (
                await ok('GET', 'me/notifications', undefined, binhToken)
            ).data
            const kick = inboxNow.items.find((item) => item.server?.action === 'kick')
            return kick ? (kick.read_at === null ? 'unread' : 'read') : 'none'
        })
        .toBe('unread')

    const back = await openAsBinh(browser)
    const toast = back.page.locator('[data-sonner-toast]').filter({ hasText: 'You are no longer in Nhóm đồ án Mobile' })
    await expect(toast).toBeVisible({ timeout: 20_000 })
    await shoot(back.page, 'shell-h1-toast')
    await toast.getByRole('button', { name: 'View' }).click()
    const kicked = inbox(back.page).getByRole('article', {
        name: /You were removed from Nhóm đồ án Mobile\. Reason: Nhắn ngoài chủ đề nhiều lần\. You can come back with a new invite\. \d\d:\d\d$/
    })
    await expect(kicked).toBeVisible()
    // Shown, it is read; nowhere to open, no link (06 › Luật hộp thư).
    await expect(kicked).not.toHaveAccessibleName(/^Unread/)
    await expect(inbox(back.page).getByRole('link', { name: /removed from/ })).toHaveCount(0)
    await expect(inbox(back.page).getByRole('article', { name: /You are timed out/ })).toBeVisible()
    await expect(inbox(back.page).getByRole('link', { name: /You are timed out/ })).toHaveCount(0)
    await shoot(back.page, 'noti01-moderation-kick')

    // Read, the next visit says nothing.
    await back.page.reload()
    await expect(pages(back.page).getByRole('button', { name: /^Notifications/ })).toBeVisible({ timeout: 20_000 })
    await back.page.waitForTimeout(2_000)
    await expect(back.page.getByText('You are no longer in Nhóm đồ án Mobile')).toHaveCount(0)
    expect(back.problems).toEqual([])
    await back.context.close()
})
