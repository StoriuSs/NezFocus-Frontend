import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Voice rooms (M4 L3a, L3b, REQ-VC-01 → VC-03), two people in their own
 * browsers with a fake microphone and camera: joining from the preview page
 * with the camera on, who is in the room live in the channel list and the
 * room (D-205), the mic and camera (D-206), a picture zoomed in, the dock
 * away from the room, leaving, a reload joining again with both off (D-51)
 * and the same account in a second tab (`other-tab`). The room's chat (M4
 * L6b, S-ROOM-08): read and written without joining, no pins (D-213), a
 * mention there opening the chat from the inbox. Then M4's "done when" with
 * three people at once: they hear each other, a camera, a shared screen, a
 * moderator's mute, a closed tab leaving the room. With E2E_SHOTS naming a
 * folder, pictures of the pages for the frame compare.
 *
 * Needs the API with LiveKit (the backend's `pnpm test:services:up` starts
 * it, its webhook to the API) and Mailpit, like messaging.spec.ts.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
const ROOM = 'Phòng học im lặng'
const SHOTS = process.env.E2E_SHOTS

/** A picture of the page for the frame compare, when E2E_SHOTS names a folder. */
const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

let anEmail: string
let binhEmail: string
let chiEmail: string
let roomPath: string
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

    anEmail = `e2e-voice-an-${browserName}${stamp}@example.test`
    binhEmail = `e2e-voice-binh-${browserName}${stamp}@example.test`
    const an = await account(anEmail, 'An', `e2e_va${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_vb${stamp}`)
    chiEmail = `e2e-voice-chi-${browserName}${stamp}@example.test`
    const chi = await account(chiEmail, 'Chi', `e2e_vc${stamp}`)

    const server: { id: string; channels: { id: string; type: string; name: string }[] } = (
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
    await ok('POST', `invites/${invite.code}/accept`, {}, chi)
    const room = server.channels.find((channel) => channel.type === 'voice' && channel.name === ROOM)
    const first = server.channels.find((channel) => channel.type === 'text' && channel.name === 'hoi-dap')
    roomPath = `/channels/${server.id}/${room!.id}`
    firstPath = `/channels/${server.id}/${first!.id}`
})

/** Someone's own browser, signed in, at `path`. */
async function openAs(browser: Browser, email: string, path: string) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' })
    await asOwnClient(context)
    const page = await context.newPage()
    const problems = await watchForProblems(page)
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.goto(path)
    return { context, page, problems }
}

const grid = (page: Page) => page.getByRole('list', { name: 'People in the room' })
const channelList = (page: Page) => page.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
const OTHER_TAB = "You're in this room in another tab or on another device"
/** The width of the picture a <video> plays: 0 until frames arrive. */
const pictureWidth = (video: ReturnType<Page['locator']>) => video.evaluate((one: HTMLVideoElement) => one.videoWidth)

/**
 * How loud the quietest sound this page plays is, over a second and a half:
 * each <audio> LiveKit plays a remote mic in is read through an analyser, and
 * the fake microphone beeps, so a sound that arrives is above 0.
 */
const quietestSound = (page: Page) =>
    page.evaluate(async () => {
        const context = new AudioContext()
        await context.resume()
        const analysers = Array.from(document.querySelectorAll<HTMLAudioElement>('body > audio'), (audio) => {
            const analyser = context.createAnalyser()
            context.createMediaStreamSource(audio.srcObject as MediaStream).connect(analyser)
            return analyser
        })
        const loudest = analysers.map(() => 0)
        const samples = new Uint8Array(2048)
        for (let round = 0; round < 30; round++) {
            await new Promise((done) => setTimeout(done, 50))
            analysers.forEach((analyser, index) => {
                analyser.getByteTimeDomainData(samples)
                for (const sample of samples) loudest[index] = Math.max(loudest[index], Math.abs(sample - 128))
            })
        }
        await context.close()
        return analysers.length === 0 ? 0 : Math.min(...loudest)
    })

test('joining, the mic, the dock and leaving show live to everyone who views the room', async ({ browser }) => {
    const an = await openAs(browser, anEmail, roomPath)
    const binh = await openAs(browser, binhEmail, firstPath)

    await expect(an.page.getByText('No one is in the room')).toBeVisible({ timeout: 20_000 })
    // The camera on before joining: one's own tile plays its picture (D-53), and the room gets it (REQ-VC-03).
    await an.page.getByRole('button', { name: 'Turn on camera' }).click()
    await expect(an.page.getByRole('button', { name: 'Turn off camera' })).toBeVisible()
    await expect.poll(() => pictureWidth(an.page.getByTestId('own-picture'))).toBeGreaterThan(0)
    await an.page.getByRole('button', { name: 'Join room' }).click()
    await expect(grid(an.page).getByRole('button', { name: 'You, mic off, camera on, press to zoom in' })).toBeVisible({
        timeout: 15_000
    })

    // Bình sees An under the room in the list, then on the preview page.
    await expect(channelList(binh.page).getByRole('listitem', { name: 'An, camera on' })).toBeVisible({
        timeout: 15_000
    })
    await binh.page.goto(roomPath)
    await expect(binh.page.getByText('1 person in the room')).toBeVisible({ timeout: 20_000 })
    await binh.page.getByRole('button', { name: 'Join room' }).click()
    await expect(grid(binh.page).getByRole('button', { name: /^An, mic off, camera on/ })).toBeVisible({
        timeout: 15_000
    })
    await expect(grid(an.page).getByRole('button', { name: /^Bình, mic off/ })).toBeVisible({ timeout: 15_000 })

    // Bình zooms in on An's picture, and back to the grid with Esc (C-20, 07 câu L3b-a).
    await grid(binh.page).getByRole('button', { name: /^An,/ }).click()
    const zoomed = binh.page.getByRole('group', { name: 'An, zoomed in' })
    await expect(zoomed).toBeVisible()
    // The whole stage, not a strip: what is left of 900 under the Header and above the controls.
    expect((await zoomed.boundingBox())?.height).toBeGreaterThan(500)
    await expect.poll(() => pictureWidth(zoomed.locator('video'))).toBeGreaterThan(0)
    await binh.page.keyboard.press('Escape')
    await expect(grid(binh.page)).toBeVisible()

    // An's mic on: Bình's tile of An and the channel list say so (D-206).
    await an.page.getByRole('button', { name: 'Unmute (Ctrl Shift M)' }).click()
    await expect(an.page.getByRole('button', { name: 'Mute (Ctrl Shift M)' })).toBeVisible()
    await expect(grid(binh.page).getByRole('button', { name: /^An, mic on/ })).toBeVisible({ timeout: 15_000 })
    await expect(channelList(binh.page).getByRole('listitem', { name: 'An, camera on, mic on' })).toBeVisible({
        timeout: 15_000
    })

    // Away from the room, An has the dock; leaving there takes An off Bình's room.
    await channelList(an.page).getByRole('link', { name: 'hoi-dap' }).click()
    const dock = an.page.getByRole('region', { name: 'In a room' })
    await expect(dock.getByText(ROOM)).toBeVisible()

    // Below 1024 the dock is a strip across the window: the sheets stop above it, its buttons in reach (M4 A3).
    await an.page.setViewportSize({ width: 900, height: 900 })
    await expect(dock.getByRole('button', { name: 'Leave room' })).toBeVisible()
    const stripTop = (await dock.boundingBox())?.y ?? 0
    const bottomOf = async (sheet: Locator) => {
        const box = await sheet.boundingBox()
        return (box?.y ?? 0) + (box?.height ?? Infinity)
    }
    // Open at 1440 (a text channel's default), the Members panel stays open as a sheet (M3 A3).
    const members = an.page.getByRole('complementary', { name: 'Members' })
    await expect(members).toBeVisible()
    expect(await bottomOf(members)).toBeLessThanOrEqual(stripTop)
    await an.page.keyboard.press('Escape')
    await expect(members).toBeHidden()
    await an.page.getByRole('button', { name: 'Open navigation' }).click()
    const sheet = an.page.locator('#shell-list')
    await expect(sheet).toBeVisible()
    expect(await bottomOf(sheet)).toBeLessThanOrEqual(stripTop)
    await an.page.keyboard.press('Escape')
    await expect(sheet).toBeHidden()
    await an.page.setViewportSize({ width: 1440, height: 900 })

    await dock.getByRole('button', { name: 'Leave room' }).click()
    await expect(an.page.getByText(`Left ${ROOM}`)).toBeVisible()
    await expect(dock).toBeHidden()
    await expect(grid(binh.page).getByRole('listitem')).toHaveCount(1, { timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Leave room' }).click()

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test("a moderator mutes, unmutes and disconnects someone, LiveKit taking the mic's sound for real (D-207, D-208)", async ({
    browser
}) => {
    const an = await openAs(browser, anEmail, roomPath)
    const binh = await openAs(browser, binhEmail, roomPath)
    await an.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
    await expect(grid(an.page).getByRole('button', { name: 'You, mic off' })).toBeVisible({ timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
    await binh.page.getByRole('button', { name: 'Unmute (Ctrl Shift M)' }).click()
    await expect(grid(an.page).getByRole('button', { name: /^Bình, mic on/ })).toBeVisible({ timeout: 15_000 })
    // Each sound An hears plays in an <audio> of its own: Bình's mic is one.
    const sounds = an.page.locator('body > audio')
    await expect(sounds).toHaveCount(1, { timeout: 15_000 })

    // An (the owner) mutes Bình from the tile's ⋯ (ROOM-EDGE mod-menu-tile).
    await grid(an.page)
        .getByRole('button', { name: /^Bình,/ })
        .hover()
    await grid(an.page).getByRole('button', { name: 'Manage Bình' }).click()
    await an.page.getByRole('menuitem', { name: 'Mute' }).click()
    await expect(binh.page.locator('[data-sonner-toast]').getByText('A moderator muted your mic')).toBeVisible({
        timeout: 15_000
    })
    await expect(binh.page.getByRole('button', { name: 'A moderator muted your mic' })).toBeDisabled()
    await expect(binh.page.getByText('Muted', { exact: true })).toBeVisible()
    // LiveKit took the track: An no longer gets any sound from Bình, and no one sees Bình speaking.
    await expect(sounds).toHaveCount(0, { timeout: 15_000 })
    await expect(grid(an.page).getByRole('button', { name: /^Bình,.*speaking/ })).toHaveCount(0, { timeout: 5_000 })
    await expect(grid(binh.page).getByRole('button', { name: /^You,.*speaking/ })).toHaveCount(0, { timeout: 5_000 })
    await expect(channelList(an.page).getByRole('listitem', { name: 'Bình, muted by a moderator' })).toBeVisible({
        timeout: 15_000
    })

    // Unmuted from the channel list's row (mod-menu-row): Bình may speak again, the mic still off until pressed.
    await channelList(an.page).getByRole('button', { name: 'Manage Bình' }).click()
    await an.page.getByRole('menuitem', { name: 'Unmute' }).click()
    await expect(binh.page.getByText('You can turn your mic on again')).toBeVisible({ timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Unmute (Ctrl Shift M)' }).click()
    await expect(sounds).toHaveCount(1, { timeout: 15_000 })

    // Disconnected: back on the preview page, told so, free to join again (ROOM-EDGE disconnected-by-mod).
    await grid(an.page)
        .getByRole('button', { name: /^Bình,/ })
        .hover()
    await grid(an.page).getByRole('button', { name: 'Manage Bình' }).click()
    await an.page.getByRole('menuitem', { name: 'Disconnect from room' }).click()
    await expect(binh.page.getByText('You were disconnected from the room')).toBeVisible({ timeout: 15_000 })
    await expect(binh.page.getByRole('button', { name: 'Join room' })).toBeEnabled()
    await expect(grid(an.page).getByRole('listitem')).toHaveCount(1, { timeout: 15_000 })
    await an.page.getByRole('button', { name: 'Leave room' }).click()

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('a reload joins the room again with the mic and camera off; a second tab offers to join there instead', async ({
    browser
}) => {
    const binh = await openAs(browser, binhEmail, roomPath)
    await binh.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
    await expect(grid(binh.page).getByRole('button', { name: 'You, mic off' })).toBeVisible({ timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Turn on camera' }).click()
    await expect(grid(binh.page).getByRole('button', { name: /^You, mic off, camera on/ })).toBeVisible()

    await binh.page.reload()
    await expect(binh.page.getByText(`Back in ${ROOM} · your mic is off`)).toBeVisible({ timeout: 20_000 })
    await expect(binh.page.getByRole('button', { name: 'Leave room' })).toBeVisible()
    await expect(binh.page.getByRole('button', { name: 'Turn on camera' })).toBeVisible()

    const second = await binh.context.newPage()
    await second.goto(roomPath)
    await expect(second.getByText(OTHER_TAB)).toBeVisible({ timeout: 20_000 })
    await second.getByRole('button', { name: 'Join here instead' }).click()
    await expect(grid(second).getByRole('button', { name: 'You, mic off' })).toBeVisible({ timeout: 15_000 })
    // The first tab is put out of the room (VC-02) and says the account is in it elsewhere.
    await expect(binh.page.getByText(OTHER_TAB)).toBeVisible({ timeout: 15_000 })
    await second.getByRole('button', { name: 'Leave room' }).click()

    expect(binh.problems).toEqual([])
    await binh.context.close()
})

test('a shared screen takes the stage for the others; of two pressed at once, LiveKit stops the later (D-101, S-ROOM-07)', async ({
    browser
}) => {
    const an = await openAs(browser, anEmail, roomPath)
    const binh = await openAs(browser, binhEmail, roomPath)
    await an.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
    await expect(grid(an.page).getByRole('button', { name: 'You, mic off' })).toBeVisible({ timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
    await expect(grid(an.page).getByRole('button', { name: /^Bình, mic off/ })).toBeVisible({ timeout: 15_000 })

    // An shares: An has the card, Bình the screen with its label, Share disabled saying who (sharing-self, viewing-voice).
    await an.page.getByRole('button', { name: 'Share your screen' }).click()
    await expect(an.page.getByText("You're sharing your screen")).toBeVisible({ timeout: 15_000 })
    const shown = binh.page.getByRole('group', { name: "An's screen" })
    await expect(shown).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => pictureWidth(shown.locator('video')), { timeout: 15_000 }).toBeGreaterThan(0)
    await expect(shown.getByText("Loading An's screen…")).toBeHidden()
    await expect(binh.page.getByRole('button', { name: 'An is sharing their screen' })).toHaveAttribute(
        'aria-disabled',
        'true'
    )
    const strip = grid(binh.page)
    await expect(strip.getByRole('button', { name: /^An, .*sharing their screen/ })).toBeVisible()
    expect((await strip.getByRole('listitem').first().boundingBox())?.width).toBe(146)
    await expect(channelList(binh.page).getByRole('listitem', { name: /^An, sharing their screen/ })).toBeVisible({
        timeout: 15_000
    })

    // Bình watches full screen; the share stopping takes Bình out of it (07 ROOM-EDGE).
    await shown.hover()
    await shown.getByRole('button', { name: 'Full screen' }).click()
    await expect.poll(() => binh.page.evaluate(() => document.fullscreenElement !== null)).toBe(true)
    await expect(shown.getByRole('button', { name: 'Exit full screen' })).toBeVisible()

    // Stopped from the card: everyone back to the grid.
    await an.page.getByRole('button', { name: 'Stop sharing' }).first().click()
    await expect(shown).toBeHidden({ timeout: 15_000 })
    await expect.poll(() => binh.page.evaluate(() => document.fullscreenElement)).toBeNull()
    await expect(binh.page.getByRole('button', { name: 'Share your screen' })).not.toHaveAttribute('aria-disabled')
    await expect(channelList(binh.page).getByRole('listitem', { name: /sharing their screen/ })).toHaveCount(0, {
        timeout: 15_000
    })

    // Both press at once: one screen stays, the other is stopped and told who came first (share-race).
    await Promise.all([
        an.page.getByRole('button', { name: 'Share your screen' }).click(),
        binh.page.getByRole('button', { name: 'Share your screen' }).click()
    ])
    const race = /started sharing their screen before you$/
    await expect
        .poll(async () => (await an.page.getByText(race).count()) + (await binh.page.getByText(race).count()), {
            timeout: 20_000
        })
        .toBe(1)
    const anLost = (await an.page.getByText(race).count()) === 1
    const [winner, loser, winnerName] = anLost ? [binh, an, 'Bình'] : [an, binh, 'An']
    await expect(loser.page.getByText(`${winnerName} started sharing their screen before you`)).toBeVisible()
    await expect(winner.page.getByText("You're sharing your screen")).toBeVisible()
    await expect(loser.page.getByRole('group', { name: `${winnerName}'s screen` })).toBeVisible({ timeout: 15_000 })
    await expect(loser.page.getByRole('button', { name: `${winnerName} is sharing their screen` })).toHaveAttribute(
        'aria-disabled',
        'true'
    )
    // The later screen is gone from LiveKit for real: the one who came first sees no screen but their own card.
    await expect(winner.page.getByRole('group', { name: /'s screen$/ })).toHaveCount(0)
    await expect(grid(winner.page).getByRole('button', { name: /sharing their screen/ })).toHaveCount(1)

    await winner.page.getByRole('button', { name: 'Stop sharing' }).first().click()
    await expect(loser.page.getByRole('button', { name: 'Share your screen' })).not.toHaveAttribute('aria-disabled', {
        timeout: 15_000
    })
    await an.page.getByRole('button', { name: 'Leave room' }).click()
    await binh.page.getByRole('button', { name: 'Leave room' }).click()

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test("a room's chat is read and written without joining; a mention there reaches the inbox, which opens the chat at it (S-ROOM-08, D-213)", async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail, roomPath)
    const binh = await openAs(browser, binhEmail, firstPath)

    // An, not in the room, opens its chat from [💬] at the end of the Header: the room named, no "#".
    await an.page.getByRole('button', { name: 'Room chat' }).click()
    const chat = an.page.getByRole('complementary', { name: 'Room chat' })
    await expect(chat.getByRole('heading', { name: `Welcome to ${ROOM}` })).toBeVisible({ timeout: 15_000 })
    const box = chat.getByRole('combobox', { name: `Message ${ROOM}` })
    await box.pressSequentially('Tối nay ôn chương 3 nhé @bì')
    const suggestions = an.page.getByRole('listbox', { name: 'Mention suggestions' })
    await expect(suggestions.getByRole('option', { name: /^Bình, / })).toBeVisible({ timeout: 15_000 })
    await an.page.keyboard.press('Enter')
    await an.page.keyboard.press('Enter')
    const sent = (page: Page) =>
        page
            .getByRole('complementary', { name: 'Room chat' })
            .getByRole('article', { name: /Tối nay ôn chương 3 nhé @Bình$/ })
    await expect(sent(an.page)).toBeVisible({ timeout: 15_000 })
    // Written from outside: the way in is still there.
    await expect(an.page.getByRole('button', { name: 'Join room' })).toBeVisible()
    await shoot(an.page, 'room08-not-in-room')

    // No pins in a room's chat, even for the owner (D-213).
    await sent(an.page).hover()
    await sent(an.page).getByRole('button', { name: 'More' }).click()
    const menu = an.page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Delete message' })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Pin' })).toHaveCount(0)
    await an.page.keyboard.press('Escape')

    // Bình, in another channel: the room's row counts the mention, and the inbox names the room with no "#".
    await expect(channelList(binh.page).getByRole('link', { name: `${ROOM}, 1 unread mention of you` })).toBeVisible({
        timeout: 15_000
    })
    await binh.page.getByRole('button', { name: 'Notifications, 1 unread' }).click()
    const row = binh.page.getByRole('dialog', { name: 'Notifications' }).getByRole('link', {
        name: new RegExp(
            `^Unread\\. An mentioned you: Tối nay ôn chương 3 nhé @Bình\\. ${ROOM}, Ôn thi Giải tích 2, \\d\\d:\\d\\d$`
        )
    })
    await row.click()
    // The room's page, its chat open at the message.
    await binh.page.waitForURL(new RegExp(`${roomPath}/`))
    await expect(sent(binh.page)).toBeVisible({ timeout: 15_000 })
    await expect(binh.page.getByRole('button', { name: 'Room chat' })).toHaveAttribute('aria-pressed', 'true')
    await expect(channelList(binh.page).getByRole('link', { name: ROOM, exact: true })).toBeVisible({ timeout: 15_000 })

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('three people in one room hear each other, see a camera and a screen; a moderator mutes one; a closed tab leaves the room (M4 done when)', async ({
    browser
}) => {
    test.setTimeout(180_000)
    const an = await openAs(browser, anEmail, roomPath)
    const binh = await openAs(browser, binhEmail, roomPath)
    const chi = await openAs(browser, chiEmail, roomPath)
    const everyone = [an, binh, chi]
    for (const one of everyone) {
        await one.page.getByRole('button', { name: 'Join room' }).click({ timeout: 20_000 })
        await expect(grid(one.page).getByRole('button', { name: 'You, mic off' })).toBeVisible({ timeout: 15_000 })
    }
    for (const one of everyone) await expect(grid(one.page).getByRole('listitem')).toHaveCount(3, { timeout: 15_000 })

    // Talking: everyone's mic on, each plays the other two, and their sound arrives (REQ-VC-01, VC-03).
    for (const one of everyone) await one.page.getByRole('button', { name: 'Unmute (Ctrl Shift M)' }).click()
    for (const one of everyone) {
        await expect(one.page.locator('body > audio')).toHaveCount(2, { timeout: 15_000 })
        await expect.poll(() => quietestSound(one.page), { timeout: 20_000 }).toBeGreaterThan(0)
    }

    // Chi's camera: the other two see the picture on Chi's tile.
    await chi.page.getByRole('button', { name: 'Turn on camera' }).click()
    for (const one of [an, binh]) {
        const tile = grid(one.page).getByRole('button', { name: /^Chi, mic on, camera on/ })
        await expect(tile).toBeVisible({ timeout: 15_000 })
        await expect.poll(() => pictureWidth(tile.locator('video')), { timeout: 15_000 }).toBeGreaterThan(0)
    }

    // Bình shares a screen: the other two see it on the stage (VC-05), then it stops.
    await binh.page.getByRole('button', { name: 'Share your screen' }).click()
    await expect(binh.page.getByText("You're sharing your screen")).toBeVisible({ timeout: 15_000 })
    for (const one of [an, chi]) {
        const shown = one.page.getByRole('group', { name: "Bình's screen" })
        await expect(shown).toBeVisible({ timeout: 15_000 })
        await expect.poll(() => pictureWidth(shown.locator('video')), { timeout: 15_000 }).toBeGreaterThan(0)
    }
    await binh.page.getByRole('button', { name: 'Stop sharing' }).first().click()
    for (const one of [an, chi]) await expect(one.page.getByRole('group', { name: "Bình's screen" })).toBeHidden()

    // An, the owner, mutes Chi: Chi is told, and neither An nor Bình gets Chi's sound any more (VC-04, D-207).
    await grid(an.page).getByRole('button', { name: /^Chi,/ }).hover()
    await grid(an.page).getByRole('button', { name: 'Manage Chi' }).click()
    await an.page.getByRole('menuitem', { name: 'Mute' }).click()
    await expect(chi.page.locator('[data-sonner-toast]').getByText('A moderator muted your mic')).toBeVisible({
        timeout: 15_000
    })
    for (const one of [an, binh]) {
        await expect(one.page.locator('body > audio')).toHaveCount(1, { timeout: 15_000 })
        await expect(grid(one.page).getByRole('button', { name: /^Chi, muted by a moderator/ })).toBeVisible({
            timeout: 15_000
        })
    }

    // Chi closes the tab without leaving: Chi goes from the room and from the list under it (REQ-VC-01).
    await expect(channelList(an.page).getByRole('listitem', { name: /^Chi,/ })).toHaveCount(1)
    await chi.page.close()
    for (const one of [an, binh]) {
        await expect(grid(one.page).getByRole('listitem')).toHaveCount(2, { timeout: 30_000 })
        await expect(channelList(one.page).getByRole('listitem', { name: /^Chi,/ })).toHaveCount(0, { timeout: 30_000 })
    }
    await an.page.getByRole('button', { name: 'Leave room' }).click()
    await binh.page.getByRole('button', { name: 'Leave room' }).click()

    for (const one of everyone) expect(one.problems).toEqual([])
    for (const one of everyone) await one.context.close()
})
