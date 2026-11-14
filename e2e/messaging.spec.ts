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
    await expect(page.getByRole('combobox', { name: `Message #${channelName}` })).toBeFocused({ timeout: 20_000 })
    return { context, page, problems }
}

const log = (page: Page) => page.getByRole('log')
const say = async (page: Page, text: string) => {
    await page.getByRole('combobox', { name: `Message #${channelName}` }).fill(text)
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

test('an edit, a reply and a deletion reach the other browser at once (REQ-MSG-05)', async ({ browser }) => {
    test.setTimeout(90_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    const article = (page: Page, text: string) => log(page).locator('article').filter({ hasText: text }).last()

    await say(an.page, 'Ok, mình vào sớm giữ chỗ')
    await seenOnce(binh.page, 'Ok, mình vào sớm giữ chỗ')

    // ↑ in the empty composer edits An's last message; Bình sees the new text, marked edited.
    await an.page.getByRole('combobox', { name: `Message #${channelName}` }).press('ArrowUp')
    const editor = an.page.getByRole('combobox', { name: 'Edit message' })
    await editor.fill('Mình vào phòng rồi nhé')
    await shoot(an.page, 'chat01-edit-mode')
    await editor.press('Enter')
    // The text and "(edited)" share one paragraph: look for the label in the message.
    await expect(article(binh.page, 'Mình vào phòng rồi nhé').getByText('(edited)')).toBeVisible({ timeout: 15_000 })

    // Bình answers it; An sees whom the reply answers.
    await article(binh.page, 'Mình vào phòng rồi nhé').hover()
    await article(binh.page, 'Mình vào phòng rồi nhé').getByRole('button', { name: 'Reply' }).click()
    await expect(binh.page.getByText('Replying to')).toBeVisible()
    await shoot(binh.page, 'chat01-reply-mode')
    await say(binh.page, 'Mình giữ chỗ cạnh An rồi nè')
    await seenOnce(an.page, 'Mình giữ chỗ cạnh An rồi nè')
    const reply = article(an.page, 'Mình giữ chỗ cạnh An rồi nè')
    await expect(reply.getByText('Mình vào phòng rồi nhé')).toBeVisible()

    // An deletes the original: it leaves Bình's list, and the reply says so.
    const original = an.page.getByRole('article', { name: /^An, .*: Mình vào phòng rồi nhé/ })
    await original.hover()
    await original.getByRole('button', { name: 'More' }).click()
    await shoot(an.page, 'chat03-own')
    await an.page.getByRole('menuitem', { name: 'Delete message' }).click()
    const dialog = an.page.getByRole('dialog', { name: 'Delete message?' })
    await shoot(an.page, 'chat03-delete-confirm')
    await dialog.getByRole('button', { name: 'Delete' }).click()
    await expect(binh.page.getByRole('article', { name: /^An, .*: Mình vào phòng rồi nhé/ })).toHaveCount(0)
    await expect(
        article(binh.page, 'Mình giữ chỗ cạnh An rồi nè').getByText('Original message was deleted')
    ).toBeVisible()

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('a message link opens the message for someone else, lit up; one they cannot see is not found (D-48)', async ({
    browser
}) => {
    test.setTimeout(90_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)

    // Formatting is drawn, not shown as markers (REQ-MSG-02).
    await say(an.page, '**Lời giải câu 3:** đổi sang _tọa độ cực_, đặt `x = r cos φ`')
    const solution = log(an.page).getByRole('article', { name: /Lời giải câu 3: đổi sang tọa độ cực/ })
    await expect(solution.locator('strong')).toHaveText('Lời giải câu 3:')
    await expect(solution.locator('code')).toHaveText('x = r cos φ')
    await shoot(an.page, 'chat01-formatting')
    const id = await solution.getAttribute('data-row-key')
    const origin = new URL(an.page.url()).origin
    const missing = crypto.randomUUID()

    // Bình links it, and a message of a channel An cannot see.
    await say(binh.page, `Xem ở đây nè ${origin}${channelPath}/${id}`)
    await say(binh.page, `Còn đây ${origin}/channels/${channelPath.split('/')[2]}/${missing}/${id}`)
    const chip = an.page.getByRole('link', { name: `#${channelName} › Message` })
    await expect(chip).toBeVisible({ timeout: 15_000 })
    await chip.hover()
    await shoot(an.page, 'chat01-message-link')

    // "Can't view": a Toast, and An stays where she is.
    await an.page.getByRole('button', { name: "Can't view" }).click()
    await expect(an.page.getByText("You can't view this message")).toBeVisible()
    await expect(an.page).toHaveURL(new RegExp(`${channelPath}$`))

    // The chip opens the message in the app, lit up: a fade of its background,
    // kept when less motion is asked for (DESIGN.md: a crossfade, not cut short).
    await an.page.emulateMedia({ reducedMotion: 'reduce' })
    await chip.click()
    await expect(an.page).toHaveURL(new RegExp(`${channelPath}/${id}$`))
    await expect(solution).toHaveAttribute('data-highlight', 'true')
    expect(await solution.evaluate((element) => getComputedStyle(element).animationDuration)).toBe('0.8s')
    await shoot(an.page, 'chat01-highlight')

    // From the address bar, a message of a channel one cannot see: not found, the URL kept (S-MOD-06).
    await binh.page.goto(`/channels/${channelPath.split('/')[2]}/${missing}/${id}`)
    await expect(binh.page.getByRole('heading', { name: "We can't find this page" })).toBeVisible()
    await expect(binh.page).toHaveURL(new RegExp(`/${missing}/${id}$`))
    await shoot(binh.page, 'mod06-not-found')

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('a reaction and a pin reach the other browser at once, with the pinned notice and the pins panel (REQ-MSG-05, 07, 08)', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    const text = 'Đề cương ôn tập giữa kỳ: chương 1 tới 4'
    const article = (page: Page) => page.getByRole('article', { name: new RegExp(`^An, .*: ${text}`) })
    const chip = (page: Page) => article(page).getByRole('button', { name: /^👍,/ })

    await say(an.page, text)
    await seenOnce(binh.page, text)

    // Bình adds 👍 from the toolbar's picker, found by its name; An sees it at once.
    await article(binh.page).hover()
    await article(binh.page).getByRole('button', { name: 'Add reaction' }).first().click()
    const picker = binh.page.getByRole('dialog', { name: 'Pick an emoji' })
    await expect(picker.getByRole('searchbox', { name: 'Search emoji' })).toBeFocused()
    await expect(picker.getByRole('button', { name: 'grinning face', exact: true })).toBeVisible({ timeout: 15_000 })
    await shoot(binh.page, 'chat03-emoji-picker')
    await picker.getByRole('searchbox', { name: 'Search emoji' }).fill('thumbs up')
    await picker.getByRole('button', { name: 'thumbs up', exact: true }).first().click()
    await expect(chip(an.page)).toHaveAccessibleName('👍, 1 person', { timeout: 15_000 })
    await expect(chip(an.page)).toHaveAttribute('aria-pressed', 'false')

    // An clicks the chip: 2 on both sides, and Bình's tooltip names them.
    await chip(an.page).click()
    await expect(chip(an.page)).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(binh.page)).toHaveAccessibleName('👍, 2 people', { timeout: 15_000 })
    await chip(binh.page).hover()
    await expect(binh.page.getByRole('tooltip')).toHaveText('You and An reacted with 👍', { timeout: 15_000 })
    await shoot(binh.page, 'c10-reaction-chips')

    // An (the owner) pins it: both see "An pinned a message · View"; Bình's pins show it.
    await article(an.page).hover()
    await article(an.page).getByRole('button', { name: 'More' }).click()
    await an.page.getByRole('menuitem', { name: 'Pin' }).click()
    const notice = (page: Page) => log(page).getByRole('article', { name: /^An pinned a message/ })
    await expect(notice(binh.page)).toBeVisible({ timeout: 15_000 })
    await expect(notice(an.page)).toBeVisible()
    await binh.page.getByRole('button', { name: 'Pinned messages' }).click()
    const pins = (page: Page) => page.getByRole('complementary', { name: 'Pinned messages' })
    await expect(pins(binh.page).getByRole('button', { name: new RegExp(text) })).toBeVisible({ timeout: 15_000 })
    await shoot(binh.page, 'chat02-pins')

    // View goes to the pinned message, lit up.
    await notice(binh.page).getByRole('button', { name: 'View the pinned message' }).click()
    await expect(article(binh.page)).toHaveAttribute('data-highlight', 'true')

    // An unpins it from a card of the panel: it leaves Bình's panel at once.
    await an.page.getByRole('button', { name: 'Pinned messages' }).click()
    const card = pins(an.page).getByRole('listitem').filter({ hasText: text })
    await card.hover()
    await card.getByRole('button', { name: 'Pinned message options' }).click()
    await an.page.getByRole('menuitem', { name: 'Unpin' }).click()
    await expect(an.page.getByText('Unpinned')).toBeVisible()
    await expect(pins(binh.page).getByText('No pinned messages yet')).toBeVisible({ timeout: 15_000 })
    await shoot(binh.page, 'chat02-pins-empty')

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('a mention picked from the suggestions reaches the other browser, the message marked for them alone (REQ-MSG-03, D-39)', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    const box = an.page.getByRole('combobox', { name: `Message #${channelName}` })

    // An types @ and the start of Bình's name, accents and all: Bình is suggested, An never.
    await box.pressSequentially('Ôn bài nhé @bì')
    const list = an.page.getByRole('listbox', { name: 'Mention suggestions' })
    await expect(list.getByRole('option', { name: /^Bình, / })).toBeVisible({ timeout: 15_000 })
    await expect(list.getByRole('option', { name: /^An, / })).toHaveCount(0)
    await shoot(an.page, 'chat01-mention-suggest')
    await an.page.keyboard.press('Enter')
    await expect(box).toHaveValue('Ôn bài nhé @Bình ')
    await an.page.keyboard.press('Enter')

    // Bình: their own chip, the message about them; An's own message is not about An.
    const article = (page: Page) => log(page).getByRole('article', { name: /Ôn bài nhé @Bình$/ })
    await expect(article(binh.page)).toHaveAttribute('data-related', 'true', { timeout: 15_000 })
    await expect(article(binh.page)).toHaveAccessibleName(/^An, .*, mentions you: Ôn bài nhé @Bình$/)
    await expect(article(binh.page).getByText('@Bình', { exact: true })).toBeVisible()
    await expect(article(an.page)).not.toHaveAttribute('data-related')
    await expect(article(an.page).getByText('@Bình', { exact: true })).toBeVisible()
    await shoot(binh.page, 'chat01-related-to-me')

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
