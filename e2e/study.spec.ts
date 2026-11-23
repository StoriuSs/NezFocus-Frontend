import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Study sessions (M5): the milestone's "done when" in a study room, three
 * people in their own browsers. An joins, starts five seconds later, Bình
 * joins twelve seconds in and sees thirteen left, An leaves forty seconds in
 * with 35 counted and Bình in control, and once Bình leaves too the empty room
 * ends the session by itself; Chi sees the room on the Study page all along,
 * and opening it from there as it ends is told so. An's camera on, the ring
 * shows An's own picture under it, nobody else's (D-56).
 * Then studying alone (S-STUDY-01, 02): a cycle of one's own, pause and
 * resume, the break over and Keep going, the 10-minute wait ending it, and a
 * Solo stopped by joining a shared session (D-103). The Stats page lists
 * what each studied (S-STUDY-03).
 *
 * The minutes are short: the API runs with STUDY_MINUTE_MS=1000, a study
 * minute a second (D-221), so a 25-minute focus lasts 25 seconds. Against an
 * API with real minutes the tests fail at once, saying so. Seconds studied are real
 * seconds, so every total here is under a minute.
 *
 * Needs the API with LiveKit and Mailpit, like voice-rooms.spec.ts; Chromium
 * only (Firefox's fake devices do not reach LiveKit in Docker, M4 A3), so the
 * Firefox project leaves it out (playwright.config.ts).
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const stamp = Date.now().toString(36)
const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
const SERVER = 'Ôn thi Giải tích 2'
const ROOM = 'Phòng học im lặng'
const OTHER_ROOM = 'Phòng thảo luận nhóm'
const ZONE = 'Asia/Ho_Chi_Minh'
const SHOTS = process.env.E2E_SHOTS

/** A picture of the page for the frame compare, when E2E_SHOTS names a folder. */
const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

interface Session {
    id: string
    status: string
    phase: string
    phase_started_at: string
    phase_ends_at: string | null
    started_at: string
    host_id: string | null
}
interface ServerChannel {
    id: string
    type: string
    name: string
    focus_session?: Session | null
}
interface HistoryLine {
    kind: string
    room_name: string | null
    seconds: number
}

let serverId: string
let roomPath: string
let otherRoomPath: string
const people: Record<'an' | 'binh' | 'chi', { email: string; token: string; id: string }> = {} as never

async function call(method: string, path: string, token?: string, body?: object, key?: string) {
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
    return ((await response.json()) as { data: unknown }).data
}

test.beforeAll(async ({ browserName }) => {
    const account = async (who: 'an' | 'binh' | 'chi', displayName: string) => {
        const email = `e2e-study-${who}-${browserName}${stamp}@example.test`
        const sentAt = new Date()
        await call('POST', 'auth/email-code', undefined, { email })
        const { access_token: token } = (await call('POST', 'auth/email-code/verify', undefined, {
            email,
            code: await codeFromEmail(email, 'code', sentAt)
        })) as { access_token: string }
        await call('POST', 'auth/complete-account', token, {
            display_name: displayName,
            username: `e2e_s${who.slice(0, 2)}${stamp}`,
            password: PASSWORD,
            timezone: ZONE,
            language: 'en',
            terms_accepted: true
        })
        const { id } = (await call('GET', 'users/me', token)) as { id: string }
        people[who] = { email, token, id }
    }
    await account('an', 'An')
    await account('binh', 'Bình')
    await account('chi', 'Chi')

    const server = (await call(
        'POST',
        'servers',
        people.an.token,
        { name: SERVER, template: 'study' },
        crypto.randomUUID()
    )) as { id: string; channels: ServerChannel[] }
    const invite = (await call(
        'POST',
        `servers/${server.id}/invites`,
        people.an.token,
        { max_age_seconds: null, max_uses: null },
        crypto.randomUUID()
    )) as { code: string }
    await call('POST', `invites/${invite.code}/accept`, people.binh.token, {})
    await call('POST', `invites/${invite.code}/accept`, people.chi.token, {})
    const room = (name: string) => server.channels.find((channel) => channel.type === 'voice' && channel.name === name)
    serverId = server.id
    roomPath = `/channels/${server.id}/${room(ROOM)!.id}`
    otherRoomPath = `/channels/${server.id}/${room(OTHER_ROOM)!.id}`
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
    if (path !== '/study') await page.goto(path)
    return { context, page, problems }
}

/** The session of a room, as `GET /servers/{id}` has it. */
async function sessionOf(roomName: string): Promise<Session | null> {
    const server = (await call('GET', `servers/${serverId}`, people.an.token)) as { channels: ServerChannel[] }
    return server.channels.find((channel) => channel.name === roomName)?.focus_session ?? null
}

/** Fails at once, saying why, when a study minute is a real minute: the API was not started for these tests. */
function needShortMinutes(session: Session, focusMinutes: number) {
    const length = Date.parse(session.phase_ends_at!) - Date.parse(session.phase_started_at)
    expect(length, 'Start the API with STUDY_MINUTE_MS=1000 (docs/e2e-testing.md)').toBeLessThanOrEqual(
        focusMinutes * 1000 + 500
    )
}

/** The seconds the ring's clock shows ("00:13" is 13). */
async function clockSeconds(page: Page): Promise<number> {
    const text = (await page.getByRole('timer').locator('span.font-numeric').textContent()) ?? ''
    const [minutes, seconds] = text.split(':').map(Number)
    return minutes * 60 + seconds
}

/**
 * Waits until `seconds` after `from`, a time of this machine taken as the
 * session started: never compared with the API's clock, which may differ.
 */
async function waitUntil(page: Page, from: number, seconds: number) {
    await page.waitForTimeout(Math.max(0, from + seconds * 1000 - Date.now()))
}

/** Today in the accounts' zone, for the history of this week. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date())

async function historyOf(who: 'an' | 'binh' | 'chi'): Promise<HistoryLine[]> {
    const page = (await call('GET', `me/study-sessions?view=week&date=${today()}`, people[who].token)) as {
        items: HistoryLine[]
    }
    return page.items
}

const liveRoom = (page: Page, room: string) => page.getByRole('link', { name: new RegExp(`^${room}, ${SERVER}, `) })

test('M5 done when: a session started, joined late, handed over and ended by an empty room', async ({ browser }) => {
    test.setTimeout(150_000)
    const an = await openAs(browser, people.an.email, roomPath)
    const chi = await openAs(browser, people.chi.email, '/study')
    await expect(chi.page.getByText('No room is studying yet')).toBeVisible({ timeout: 20_000 })

    // 19:55, An joins; 20:00, An starts the room's 25/5.
    await an.page.getByRole('button', { name: 'Join room' }).click()
    await expect(an.page.getByRole('button', { name: 'Leave room' })).toBeVisible({ timeout: 15_000 })
    const start = an.page.getByRole('button', { name: 'Start a 25 minute focus' })
    await expect(start).toBeVisible({ timeout: 15_000 })
    // An's camera on: the ring shows An's own picture under it, playing (07 camera-on, D-56).
    await an.page.getByRole('button', { name: 'Turn on camera' }).click()
    const own = an.page.locator('video')
    await expect(own).toHaveCount(1, { timeout: 15_000 })
    await expect.poll(() => own.evaluate((video: HTMLVideoElement) => video.videoWidth)).toBeGreaterThan(0)
    await an.page.waitForTimeout(3000)
    await start.click()
    await expect(an.page.getByRole('timer')).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })
    const startedAt = Date.now()
    await shoot(an.page, 'camera-on')
    let session: Session | null = null
    await expect.poll(async () => (session = await sessionOf(ROOM))).not.toBeNull()
    needShortMinutes(session!, 25)
    expect(session!.host_id).toBe(people.an.id)

    // Chi, on the Study page, sees the room studying (S-STUDY-01, D-103).
    await expect(liveRoom(chi.page, ROOM)).toBeVisible({ timeout: 15_000 })
    await expect(liveRoom(chi.page, ROOM)).toHaveAccessibleName(/, Focus · .+, 1 person$/)

    // 20:12, Bình joins and sees 13 left of the focus, An in control (REQ-STUDY-02).
    await waitUntil(an.page, startedAt, 11)
    const binh = await openAs(browser, people.binh.email, roomPath)
    await expect(binh.page.getByText('An is in control')).toBeVisible({ timeout: 15_000 })
    await binh.page.getByRole('button', { name: 'Join room' }).click()
    // In the room, not its preview page: that one has a clock of its own.
    await expect(binh.page.getByRole('button', { name: 'Leave room' })).toBeVisible({ timeout: 15_000 })
    await expect(binh.page.getByRole('timer')).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })
    const elapsed = (Date.now() - startedAt) / 1000
    const left = await clockSeconds(binh.page)
    expect(Math.abs(left - (25 - elapsed))).toBeLessThanOrEqual(1.5)
    await expect(liveRoom(chi.page, ROOM)).toHaveAccessibleName(/, 2 people$/, { timeout: 15_000 })

    // The break and the next focus come by themselves, at the same time for both.
    await expect(binh.page.getByRole('timer')).toHaveAccessibleName(/^Short break, /, { timeout: 20_000 })
    await expect(an.page.getByRole('timer')).toHaveAccessibleName(/^Short break, /)
    await expect(binh.page.getByRole('timer')).toHaveAccessibleName(/^Focus, round 2, /, { timeout: 10_000 })

    // 20:40, An leaves, told who will be in control (D-44); Bình is told it is them (REQ-STUDY-03).
    await waitUntil(an.page, startedAt, 40)
    await an.page.getByRole('button', { name: 'Leave room' }).click()
    const ask = an.page.getByRole('dialog', { name: 'Leave the room?' })
    await expect(ask.getByText('Bình will be in control of the study session.')).toBeVisible()
    await ask.getByRole('button', { name: 'Leave room' }).click()
    await expect(an.page.getByText(`Left ${ROOM}`)).toBeVisible()
    await expect(binh.page.getByText('An left the room · you are in control of the study session')).toBeVisible({
        timeout: 15_000
    })
    await expect.poll(async () => (await sessionOf(ROOM))?.host_id).toBe(people.binh.id)

    // An's 35 counted: the focus 20:00-20:25 and 20:30-20:40, not the break nor 19:55-20:00 (REQ-STUDY-04).
    await expect
        .poll(async () => (await historyOf('an')).find((line) => line.room_name === ROOM)?.seconds ?? 0, {
            timeout: 15_000
        })
        .toBeGreaterThanOrEqual(34)
    expect((await historyOf('an')).find((line) => line.room_name === ROOM)?.seconds).toBeLessThanOrEqual(37)

    // Bình leaves too: the room is empty, and 5 minutes on the session ends by itself.
    await binh.page.getByRole('button', { name: 'Leave room' }).click()
    const binhAsk = binh.page.getByRole('dialog', { name: 'Leave the room?' })
    await expect(binhAsk.getByText('The study session keeps running, with no one in control.')).toBeVisible()
    await binhAsk.getByRole('button', { name: 'Leave room' }).click()
    await expect(binh.page.getByText(`Left ${ROOM}`)).toBeVisible()
    const emptyFrom = Date.now()
    // Chi opens it from the Study page meanwhile: the preview page, then told it ended (08 room-ended-on-join).
    await liveRoom(chi.page, ROOM).click()
    await expect(chi.page.getByRole('button', { name: 'Join room' })).toBeVisible({ timeout: 15_000 })
    await expect(chi.page.getByText(/^The study session just ended at \d{2}:\d{2}$/)).toBeVisible({
        timeout: 20_000
    })
    expect(Date.now() - emptyFrom).toBeGreaterThanOrEqual(4000)
    await expect(chi.page.getByText('The room is empty')).toBeVisible()
    await shoot(chi.page, 'room-ended-on-join')
    expect(await sessionOf(ROOM)).toBeNull()
    await chi.page.goto('/study')
    await expect(chi.page.getByText('No room is studying yet')).toBeVisible({ timeout: 15_000 })

    // An's Stats page: the room's line this week (C-47).
    await an.page.goto('/study/stats')
    const history = an.page.getByRole('region', { name: 'Session history' })
    await expect(history.getByText(`${ROOM} · ${SERVER}`)).toBeVisible({ timeout: 15_000 })
    await expect(history.getByText('under 1 minute')).toBeVisible()

    for (const one of [an, binh, chi]) expect(one.problems).toEqual([])
    for (const one of [an, binh, chi]) await one.context.close()
})

test('studying alone: a cycle of ones own, a pause, Keep going, the wait running out, a shared session taking over', async ({
    browser
}) => {
    test.setTimeout(150_000)
    const chi = await openAs(browser, people.chi.email, '/study/solo')

    // A 5/1 cycle of Chi's own (S-STUDY-01 `cycle-dialog`).
    await chi.page.getByRole('button', { name: 'Another cycle' }).click()
    const dialog = chi.page.getByRole('dialog', { name: 'Study alone' })
    await dialog.getByRole('radio', { name: 'Custom' }).click()
    await dialog.getByLabel('Focus (5–120)').fill('5')
    await dialog.getByLabel('Short break (1–30)').fill('1')
    await dialog.getByRole('button', { name: 'Start', exact: true }).click()
    const timer = chi.page.getByRole('timer')
    await expect(timer).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })
    const solo = (await call('GET', 'me/solo-session', people.chi.token)) as { session: Session | null }
    needShortMinutes(solo.session!, 5)

    // Paused, the clock stands still; resumed, it goes on.
    await chi.page.getByRole('button', { name: 'Pause (Space)' }).click()
    await expect(timer).toHaveAccessibleName(/^Paused, round 1, /)
    const still = await clockSeconds(chi.page)
    await chi.page.waitForTimeout(1500)
    expect(await clockSeconds(chi.page)).toBe(still)
    await chi.page.getByRole('button', { name: 'Resume (Space)' }).click()
    await expect(timer).toHaveAccessibleName(/^Focus, round 1, /)

    // The break, then "Break over" until Keep going starts round 2 (REQ-STUDY-05).
    await expect(timer).toHaveAccessibleName(/^Short break, /, { timeout: 10_000 })
    const keepGoing = chi.page.getByRole('button', { name: 'Keep going' })
    await expect(keepGoing).toBeVisible({ timeout: 10_000 })
    await expect(timer).toHaveAccessibleName(/^Break over, /)
    await keepGoing.click()
    await expect(timer).toHaveAccessibleName(/^Focus, round 2, /)

    // Not pressed this time: 10 minutes on, and not before, the session ends by itself.
    await expect(keepGoing).toBeVisible({ timeout: 15_000 })
    const waitFrom = Date.now()
    await expect(chi.page.getByText(/^The session ended at .+ because you did not press Keep going$/)).toBeVisible({
        timeout: 15_000
    })
    expect(Date.now() - waitFrom).toBeGreaterThanOrEqual(9000)

    // Studying alone again, Chi joins a room with a shared session: asked first, then the Solo ends (D-103).
    await chi.page.getByRole('button', { name: 'Start a 5 minute focus' }).click()
    await expect(timer).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })
    const an = await openAs(browser, people.an.email, otherRoomPath)
    await an.page.getByRole('button', { name: 'Join room' }).click()
    await expect(an.page.getByRole('button', { name: 'Leave room' })).toBeVisible({ timeout: 15_000 })
    await an.page.getByRole('button', { name: 'Start a 25 minute focus' }).click()
    await expect(an.page.getByRole('timer')).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })

    await chi.page.goto(otherRoomPath)
    await chi.page.getByRole('button', { name: 'Join room' }).click()
    const yieldAsk = chi.page.getByRole('dialog', { name: 'Join the room and stop studying alone?' })
    await expect(yieldAsk).toBeVisible()
    await yieldAsk.getByRole('button', { name: 'Join room' }).click()
    await expect(chi.page.getByRole('button', { name: 'Leave room' })).toBeVisible({ timeout: 15_000 })
    await expect(chi.page.getByRole('timer')).toHaveAccessibleName(/^Focus, round 1, /, { timeout: 15_000 })
    await expect
        .poll(async () => ((await call('GET', 'me/solo-session', people.chi.token)) as { session: unknown }).session)
        .toBeNull()

    // A few seconds in the room: a stay needs a counted second to be a line of the history (D-230).
    await chi.page.waitForTimeout(3000)
    await chi.page.getByRole('button', { name: 'Leave room' }).click()
    await expect(chi.page.getByText(`Left ${OTHER_ROOM}`)).toBeVisible()
    // An, the Host and now alone, leaves: the empty room ends the session.
    await an.page.getByRole('button', { name: 'Leave room' }).click()
    await an.page.getByRole('dialog', { name: 'Leave the room?' }).getByRole('button', { name: 'Leave room' }).click()
    await expect(an.page.getByText(`Left ${OTHER_ROOM}`)).toBeVisible()
    await expect.poll(() => sessionOf(OTHER_ROOM), { timeout: 20_000 }).toBeNull()

    // Chi's Stats page: the two Solo sessions and the room (C-47, D-230).
    const lines = await historyOf('chi')
    expect(lines.filter((line) => line.kind === 'solo')).toHaveLength(2)
    await chi.page.goto('/study/stats')
    const history = chi.page.getByRole('region', { name: 'Session history' })
    await expect(history.getByText('Solo study')).toHaveCount(2, { timeout: 15_000 })
    await expect(history.getByText(`${OTHER_ROOM} · ${SERVER}`)).toBeVisible()

    expect(chi.problems).toEqual([])
    expect(an.problems).toEqual([])
    await chi.context.close()
    await an.context.close()
})
