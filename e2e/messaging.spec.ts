import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Chat between two browsers against the real API and socket (REQ-MSG-01,
 * S-CHAT-01, M2 "Xong khi"): An and Bình, each in a browser of their own,
 * open the same channel and see each other's messages without reloading;
 * Bình loses the network, An keeps writing, Bình writes too, and once the
 * network is back nothing is lost and nothing shows twice.
 *
 * Needs the API (with Redis, for the socket) and Mailpit, like
 * invites.spec.ts. With E2E_SHOTS set to a folder, it also saves the screens
 * compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`

let anEmail: string
let binhEmail: string
let channelPath: string
let channelName: string

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

    anEmail = `e2e-msg-an-${browserName}${stamp}@example.test`
    binhEmail = `e2e-msg-binh-${browserName}${stamp}@example.test`
    const an = await account(anEmail, 'An', `e2e_sa${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_sb${stamp}`)

    const server: { id: string; channels: { id: string; name: string; type: string }[] } = (
        await ok('POST', 'servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, an, crypto.randomUUID())
    ).data
    const invite: { code: string } = (
        await ok(
            'POST',
            `servers/${server.id}/invites`,
            { max_age_seconds: null, max_uses: null },
            an,
            crypto.randomUUID()
        )
    ).data
    await ok('POST', `invites/${invite.code}/accept`, {}, binh)
    const text = server.channels.find((channel) => channel.type === 'text')!
    channelPath = `/channels/${server.id}/${text.id}`
    channelName = text.name
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A browser of its own, signed in, on the channel. */
async function openAs(browser: Browser, email: string) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
    await asOwnClient(context)
    const page = await context.newPage()
    const problems = await watchForProblems(page)
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.goto(channelPath)
    await expect(page.getByRole('textbox', { name: `Message #${channelName}` })).toBeFocused({ timeout: 20_000 })
    return { context, page, problems }
}

const log = (page: Page) => page.getByRole('log')
const say = async (page: Page, text: string) => {
    await page.getByRole('textbox', { name: `Message #${channelName}` }).fill(text)
    await page.keyboard.press('Enter')
}
/** The message `text` shows exactly once in the list, saved (not faded, nothing under it). */
const seenOnce = async (page: Page, text: string) => {
    await expect(log(page).getByText(text, { exact: true })).toHaveCount(1, { timeout: 15_000 })
    await expect(log(page).locator('article[aria-busy]')).toHaveCount(0)
}

test("two browsers see each other's messages at once, and none is lost or doubled across a lost network", async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    await expect(log(an.page).getByRole('heading', { name: `Welcome to #${channelName}` })).toBeVisible()
    await shoot(an.page, 'chat01-empty')

    // Back and forth, nobody reloading.
    await say(an.page, 'Mọi người ơi, câu 3 đề giữa kỳ năm ngoái giải thế nào vậy?')
    await seenOnce(an.page, 'Mọi người ơi, câu 3 đề giữa kỳ năm ngoái giải thế nào vậy?')
    await seenOnce(binh.page, 'Mọi người ơi, câu 3 đề giữa kỳ năm ngoái giải thế nào vậy?')
    await say(binh.page, 'Đổi sang tọa độ cực rồi tính tích phân kép là ra nhé')
    await seenOnce(an.page, 'Đổi sang tọa độ cực rồi tính tích phân kép là ra nhé')
    await expect(log(an.page).getByRole('separator', { name: 'Today' })).toBeVisible()
    await shoot(an.page, 'chat01-default')

    // Bình loses the network; An goes on writing; Bình writes too.
    await binh.context.setOffline(true)
    await say(an.page, 'Câu 4 đổi cận thế nào vậy mọi người?')
    await say(an.page, 'Mình kẹt ở bước tìm miền D.')
    await say(binh.page, 'Mình mất mạng, có lại sẽ gửi')
    await expect(log(binh.page).getByText("Will send when you're back online")).toBeVisible()
    await shoot(binh.page, 'chat01-waiting')

    // Back online: Bình's message goes, An's two arrive, each once.
    await binh.context.setOffline(false)
    for (const page of [an.page, binh.page]) {
        await seenOnce(page, 'Mình mất mạng, có lại sẽ gửi')
        await seenOnce(page, 'Câu 4 đổi cận thế nào vậy mọi người?')
        await seenOnce(page, 'Mình kẹt ở bước tìm miền D.')
    }

    // A reload reads the same history: the order both saw.
    await binh.page.reload()
    await seenOnce(binh.page, 'Mình kẹt ở bước tìm miền D.')
    const order = await log(binh.page).locator('article p').allTextContents()
    expect(order).toEqual([
        'Mọi người ơi, câu 3 đề giữa kỳ năm ngoái giải thế nào vậy?',
        'Đổi sang tọa độ cực rồi tính tích phân kép là ra nhé',
        'Câu 4 đổi cận thế nào vậy mọi người?',
        'Mình kẹt ở bước tìm miền D.',
        'Mình mất mạng, có lại sẽ gửi'
    ])

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('messages past 5 in 5 seconds wait, then go by themselves, each once and in order', async ({ browser }) => {
    test.setTimeout(60_000)
    const an = await openAs(browser, anEmail)
    for (let i = 1; i <= 6; i++) await say(an.page, `Tin nhanh ${i}`)

    // The window may still count earlier messages, so one or more wait.
    await expect(
        log(an.page)
            .getByText(/You're sending too fast · sending again in \d+ seconds?/)
            .first()
    ).toBeVisible()
    await shoot(an.page, 'chat01-rate-limited')
    for (let i = 1; i <= 6; i++) await seenOnce(an.page, `Tin nhanh ${i}`)
    // In the order typed: one waiting out the limit is never overtaken.
    const quick = (await log(an.page).locator('article p').allTextContents()).filter((text) =>
        text.startsWith('Tin nhanh')
    )
    expect(quick).toEqual([1, 2, 3, 4, 5, 6].map((i) => `Tin nhanh ${i}`))
    expect(an.problems).toEqual([])
    await an.context.close()
})
