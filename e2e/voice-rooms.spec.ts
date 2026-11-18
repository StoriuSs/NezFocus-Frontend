import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Voice rooms (M4 L3a, L3b, REQ-VC-01 → VC-03), two people in their own
 * browsers with a fake microphone and camera: joining from the preview page
 * with the camera on, who is in the room live in the channel list and the
 * room (D-205), the mic and camera (D-206), a picture zoomed in, the dock
 * away from the room, leaving, a reload joining again with both off (D-51)
 * and the same account in a second tab (`other-tab`).
 *
 * Needs the API with LiveKit (the backend's `pnpm test:services:up` starts
 * it, its webhook to the API) and Mailpit, like messaging.spec.ts.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
const ROOM = 'Phòng học im lặng'

let anEmail: string
let binhEmail: string
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
