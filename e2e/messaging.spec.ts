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
let otherPath: string

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
    const [text, other] = server.channels.filter((channel) => channel.type === 'text')
    channelPath = `/channels/${server.id}/${text!.id}`
    channelName = text!.name
    otherPath = `/channels/${server.id}/${other!.id}`
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

test('a mention in another channel is a badge on the channel, the server and the tab title; reading it in one tab clears it in the other (REQ-MSG-09, D-46)', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    // An reads another channel, in two tabs.
    await an.page.goto(otherPath)
    const second = await an.context.newPage()
    await second.goto(otherPath)
    const channels = (page: Page) => page.getByRole('navigation', { name: /^Channels of / })
    const servers = (page: Page) => page.getByRole('navigation', { name: 'Servers' })

    const box = binh.page.getByRole('combobox', { name: `Message #${channelName}` })
    await box.pressSequentially('Mai ôn chương 3 nhé @an')
    await expect(
        binh.page.getByRole('listbox', { name: 'Mention suggestions' }).getByRole('option', { name: /^An, / })
    ).toBeVisible({ timeout: 15_000 })
    await binh.page.keyboard.press('Enter')
    await binh.page.keyboard.press('Enter')

    for (const page of [an.page, second]) {
        await expect(channels(page).getByRole('link', { name: `${channelName}, 1 unread mention of you` })).toBeVisible(
            {
                timeout: 15_000
            }
        )
        await expect(
            servers(page).getByRole('link', { name: 'Ôn thi Giải tích 2, 1 unread mention of you' })
        ).toBeVisible()
        await expect(page).toHaveTitle(/^\(1\) /)
    }
    await shoot(an.page, 'shell01-mention-badge')

    // An opens it in the first tab: "New" above Bình's message, read once seen.
    await an.page.bringToFront()
    await channels(an.page)
        .getByRole('link', { name: new RegExp(`^${channelName}, `) })
        .click()
    await expect(log(an.page).getByRole('separator', { name: /New$/ })).toBeVisible({ timeout: 15_000 })
    await expect(log(an.page).getByText('Mai ôn chương 3 nhé', { exact: false })).toBeVisible()
    await shoot(an.page, 'chat01-new-divider')

    // The other tab loses the badge within 2 seconds of the read (REQ-MSG-09); the title its number.
    await expect(channels(second).getByRole('link', { name: channelName, exact: true })).toBeVisible({ timeout: 4_000 })
    await expect(second).not.toHaveTitle(/^\(/)
    await expect(an.page).not.toHaveTitle(/^\(/)
    // "New" stays until An leaves the channel (C-10).
    await expect(log(an.page).getByRole('separator', { name: /New$/ })).toBeVisible()

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('who is online and who is typing reach the other browser: the member panel, invisible, the typing line, @here (REQ-AUTH-07, MSG-06, D-166, D-175)', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    const panel = an.page.getByRole('complementary', { name: 'Members' })
    const onlineGroup = panel.getByRole('region', { name: /^Online — / })
    const offlineGroup = panel.getByRole('region', { name: /^Offline — / })

    // Open at 1440 (S-SHELL-01): Bình, connected, is online for An.
    await expect(onlineGroup.getByText('Bình', { exact: true })).toBeVisible({ timeout: 15_000 })
    await shoot(an.page, 'shell01-member-panel')
    // The pins hide the members while open; closed, the members are back (one panel at a time, C-08).
    const pins = an.page.getByRole('button', { name: 'Pinned messages' })
    await pins.click()
    await expect(panel).toHaveCount(0)
    await pins.click()
    await expect(panel).toBeVisible()

    // Bình types: An sees it under the messages within a moment, gone once the message comes.
    const typing = an.page.getByText('Bình is typing…')
    await binh.page.getByRole('combobox', { name: `Message #${channelName}` }).pressSequentially('Ai còn thức')
    await expect(typing).toBeVisible({ timeout: 5_000 })
    await shoot(an.page, 'chat01-typing')
    await binh.page.keyboard.press('Enter')
    await seenOnce(an.page, 'Ai còn thức')
    await expect(typing).toHaveCount(0)

    // Bình goes invisible: offline for An, at once; then online again.
    const statusOf = async (status: string) => {
        await binh.page.getByRole('button', { name: /^Bình, .* — open your menu$/ }).click()
        await binh.page.getByRole('menuitem', { name: /^(Online|Away|Do not disturb|Invisible)/ }).click()
        await binh.page.getByRole('menuitemradio', { name: new RegExp(`^${status}`) }).click()
    }
    await statusOf('Invisible')
    await expect(offlineGroup.getByText('Bình', { exact: true })).toBeVisible({ timeout: 5_000 })
    await expect(binh.page.getByRole('button', { name: 'Bình, Invisible — open your menu' })).toBeVisible()
    await statusOf('Online')
    await expect(onlineGroup.getByText('Bình', { exact: true })).toBeVisible({ timeout: 5_000 })

    // An, the owner, may use @here: it reaches Bình, online, and marks the message for them.
    await say(an.page, '@here họp nhóm 21:00')
    const article = log(binh.page).getByRole('article', { name: /@here họp nhóm 21:00$/ })
    await expect(article).toHaveAttribute('data-related', 'true', { timeout: 15_000 })

    expect([...an.problems, ...binh.problems]).toEqual([])
    await an.context.close()
    await binh.context.close()
})

/** A real PNG of 480 × 300, drawn by the browser itself: for the storage, the check and the thumbnail to go through for real. */
async function drawnPng(page: Page): Promise<Buffer> {
    const url = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 480
        canvas.height = 300
        const context = canvas.getContext('2d')!
        const fill = context.createLinearGradient(0, 0, 480, 300)
        fill.addColorStop(0, '#f6f1e3')
        fill.addColorStop(1, '#d9cfb8')
        context.fillStyle = fill
        context.fillRect(0, 0, 480, 300)
        context.fillStyle = '#2b3a67'
        context.font = '28px serif'
        context.fillText('∫∫ f(x, y) dA = 20 sin θ', 40, 160)
        return canvas.toDataURL('image/png')
    })
    return Buffer.from(url.split(',')[1]!, 'base64')
}

test('files go from the browser to the storage, are checked, and reach the other browser; one not what its name says is refused before sending (REQ-MSG-04, D-93, D-165)', async ({
    browser
}) => {
    test.setTimeout(90_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    const tray = an.page.getByRole('list', { name: 'Files to send' })

    await an.page.locator('input[type=file]').setInputFiles([
        { name: 'cau4.png', mimeType: 'image/png', buffer: await drawnPng(an.page) },
        { name: 'de-giua-ky.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%nezfocus e2e\n') }
    ])
    await expect(tray.getByRole('listitem')).toHaveCount(2)
    // Uploaded to the storage and checked: the line under the tray goes.
    await expect(an.page.getByText(/^Uploading \d\/2$/)).toHaveCount(0, { timeout: 30_000 })
    await shoot(an.page, 'chat04-ready')
    await say(an.page, 'Bài giải câu 4')

    const image = log(binh.page).getByRole('img', { name: 'Image cau4.png' })
    await expect(image).toBeVisible({ timeout: 15_000 })
    // The thumbnail loads from the storage, through its signed link.
    await expect
        .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15_000 })
        .toBeGreaterThan(0)
    await expect(log(binh.page).getByRole('button', { name: 'Download de-giua-ky.pdf' })).toBeVisible()
    await shoot(binh.page, 'chat04-sent')

    // Named .png, but not an image: refused after the upload, before any message.
    await an.page.locator('input[type=file]').setInputFiles({
        name: 'cong-thuc.png',
        mimeType: 'image/png',
        buffer: Buffer.from('MZ this is not an image')
    })
    await expect(tray.getByText("Can't send", { exact: true })).toBeVisible({ timeout: 30_000 })
    await say(an.page, 'Gửi thử')
    await expect(
        an.page.getByRole('alert').filter({ hasText: 'Remove or retry the files in error to send' })
    ).toBeVisible()
    await shoot(an.page, 'chat04-content-mismatch')
    await expect(log(binh.page).getByText('Gửi thử', { exact: true })).toHaveCount(0)

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('files dropped on the page go to the tray; an image and a PDF of a message open in the viewer, which closes back to them (S-CHAT-04, C-12, C-42)', async ({
    browser
}) => {
    test.setTimeout(90_000)
    const an = await openAs(browser, anEmail)
    const tray = an.page.getByRole('list', { name: 'Files to send' })
    // The content column: from the Header down to the composer.
    const column = an.page.locator('section').filter({ has: log(an.page) })
    // A drag of two files, as the browser makes one.
    const files = await an.page.evaluateHandle(
        (png) => {
            const transfer = new DataTransfer()
            const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0))
            transfer.items.add(new File([bytes], 'cau4-2.png', { type: 'image/png' }))
            transfer.items.add(new File(['%PDF-1.4\n%nezfocus e2e\n'], 'de-giua-ky.pdf', { type: 'application/pdf' }))
            return transfer
        },
        (await drawnPng(an.page)).toString('base64')
    )

    await column.dispatchEvent('dragenter', { dataTransfer: files })
    await expect(an.page.getByText(/^Drop files to send to #/)).toBeVisible()
    await expect(an.page.getByText('Up to 10 files, 25 MB each')).toBeVisible()
    await shoot(an.page, 'chat04-drop-target')
    await column.dispatchEvent('drop', { dataTransfer: files })
    await expect(an.page.getByText(/^Drop files to send to #/)).toBeHidden()
    await expect(tray.getByRole('listitem')).toHaveCount(2)
    await expect(an.page.getByText(/^Uploading \d\/2$/)).toHaveCount(0, { timeout: 30_000 })
    await say(an.page, 'Kéo thả hai tệp')

    const opener = log(an.page).getByRole('button', { name: 'Image cau4-2.png' })
    await opener.click()
    const viewer = an.page.getByRole('dialog', { name: /^Image cau4-2\.png from / })
    await expect(viewer).toBeVisible()
    // The image itself, from the storage through its signed link.
    await expect
        .poll(
            () =>
                viewer
                    .getByRole('img', { name: 'Image cau4-2.png' })
                    .evaluate((img: HTMLImageElement) => img.naturalWidth),
            {
                timeout: 15_000
            }
        )
        .toBe(480)
    await shoot(an.page, 'chat04-image-viewer')
    await an.page.keyboard.press('Escape')
    await expect(viewer).toBeHidden()
    await expect(opener).toBeFocused()

    await log(an.page).getByRole('button', { name: 'View de-giua-ky.pdf' }).click()
    const fileViewer = an.page.getByRole('dialog', { name: /^File de-giua-ky\.pdf from / })
    await expect(fileViewer).toBeVisible()
    // The browser's PDF viewer, or what a browser without one says.
    await expect(
        fileViewer.locator('iframe').or(fileViewer.getByText("This browser can't show this file"))
    ).toBeVisible()
    await shoot(an.page, 'chat04-file-viewer')
    await fileViewer.getByRole('button', { name: 'Close' }).click()
    await expect(fileViewer).toBeHidden()

    expect(an.problems).toEqual([])
    await an.context.close()
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
