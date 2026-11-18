import { expect, test, type Browser, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * The Task Board of a channel between two browsers against the real API and
 * socket (S-TASK-01, S-TASK-03, REQ-TASK-01, REQ-TASK-02): An adds a task
 * due next Friday for Bình, Bình sees it at once and marks it done (its row
 * standing still while the Toast shows), An sees it go to Done; An turns the
 * board off in the channel settings while Bình has it open, and on again;
 * a task's detail (S-TASK-02): Bình opens one from its row and takes it on,
 * An opens it from its link on another page and takes Bình off, Bình told;
 * the To-do page (S-TASK-04): Bình's tasks from two servers in their
 * groups, counted on the rail and in the column, one marked done there.
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

let anEmail: string
let binhEmail: string
let boardPath: string
let anToken: string
let binhToken: string
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

    anEmail = `e2e-task-an-${browserName}${stamp}@example.test`
    binhEmail = `e2e-task-binh-${browserName}${stamp}@example.test`
    const an = await account(anEmail, 'An', `e2e_ta${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_tb${stamp}`)

    // The Study template's #viec-nhom has its Task Board on.
    const server: { id: string; channels: { id: string; name: string }[] } = (
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
    const board = server.channels.find((channel) => channel.name === 'viec-nhom')!
    boardPath = `/channels/${server.id}/${board.id}`
    anToken = an
    binhToken = binh
    boardId = board.id
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

/** A browser of its own, signed in, on #viec-nhom with its Task Board open. */
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
    await page.goto(boardPath)
    const button = page.getByRole('button', { name: 'Task Board' })
    await expect(button).toBeVisible({ timeout: 20_000 })
    await button.click()
    await expect(board(page)).toBeVisible()
    return { context, page, problems }
}

const board = (page: Page) => page.getByRole('complementary', { name: 'Task Board' })
const row = (page: Page, title: string) => board(page).getByRole('button', { name: new RegExp(`^${title}`) })

test('the To-do page of someone with no task has its words in the middle of the content, above its centre', async ({
    browser
}) => {
    // Before any test makes one: An has no task at all.
    const an = await openAs(browser, anEmail)
    await an.page.goto('/tasks')
    const words = an.page.getByRole('main').getByRole('heading', { name: 'No tasks yet' })
    await expect(words).toBeVisible({ timeout: 15_000 })

    // C-17 › a page with nothing else on it: centred across the content area, at about 40% of its height.
    const content = (await an.page.getByRole('main').boundingBox())!
    const box = (await words.boundingBox())!
    expect(Math.abs(box.x + box.width / 2 - (content.x + content.width / 2))).toBeLessThan(8)
    const at = (box.y + box.height / 2 - content.y) / content.height
    expect(at).toBeGreaterThan(0.3)
    expect(at).toBeLessThan(0.5)
    await shoot(an.page, 'task04-empty')

    expect(an.problems).toEqual([])
    await an.context.close()
})

test('a task added for someone reaches them at once, and marking it done reaches the one who added it', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)
    await expect(board(an.page).getByRole('heading', { name: 'No tasks yet' })).toBeVisible()
    await shoot(an.page, 'task01-empty')

    await board(an.page).getByRole('button', { name: 'Add the first task' }).click()
    const dialog = an.page.getByRole('dialog', { name: 'Add task' })
    await dialog.getByRole('textbox', { name: /Title/ }).fill('Nộp báo cáo giữa kỳ')
    await dialog.getByRole('textbox', { name: /Description/ }).fill('Mỗi người viết 2 chương, gửi file chung.')
    await dialog.getByRole('button', { name: /Due/ }).click()
    await an.page.getByRole('button', { name: 'Next Friday' }).click()
    await shoot(an.page, 'task03-due-picker')
    await an.page.getByRole('button', { name: 'Done', exact: true }).click()
    await expect(dialog.getByRole('button', { name: /Due/ })).toContainText('· 23:59')
    await dialog.getByRole('button', { name: /Assigned to/ }).click()
    const people = an.page.getByRole('listbox', { name: 'Assigned to' })
    await people.getByRole('option', { name: /Bình/ }).click()
    await expect(an.page.getByText('1 selected')).toBeVisible()
    await shoot(an.page, 'task03-assignee-picker')
    await an.page.keyboard.press('Escape')
    await expect(dialog.getByRole('button', { name: /Assigned to/ })).toContainText('Bình')
    await shoot(an.page, 'task03-filled')
    await dialog.getByRole('button', { name: 'Add task' }).click()
    await expect(dialog).toBeHidden()
    await expect(an.page.getByText('Added “Nộp báo cáo giữa kỳ”')).toBeVisible()

    // Bình, nobody reloading.
    await expect(row(binh.page, 'Nộp báo cáo giữa kỳ')).toBeVisible({ timeout: 15_000 })
    await expect(board(binh.page).getByRole('heading', { name: 'TO DO — 1' })).toBeVisible()
    await shoot(an.page, 'task01-default')

    // The time of a due always shows (C-28): its line runs the row's whole width, under the
    // avatars, so a long one or the list's scrollbar does not cut it.
    const [dueRight, avatarsRight] = await row(an.page, 'Nộp báo cáo giữa kỳ').evaluate((button) => {
        const time = Array.from(button.querySelectorAll('span')).find(
            (span) => span.children.length === 0 && / · 23:59$/.test(span.textContent ?? '')
        )!
        const avatars = button.querySelector('span[aria-hidden="true"]')!
        return [time.parentElement!.getBoundingClientRect().right, avatars.getBoundingClientRect().right]
    })
    expect(dueRight).toBeGreaterThanOrEqual(avatarsRight - 1)

    // He may change its status, not edit it: only the status in its menu.
    await row(binh.page, 'Nộp báo cáo giữa kỳ').hover()
    await board(binh.page).getByRole('button', { name: 'Options for task Nộp báo cáo giữa kỳ' }).click()
    const menu = binh.page.getByRole('menu')
    await expect(menu.getByRole('menuitemradio')).toHaveCount(3)
    await expect(menu.getByRole('menuitem', { name: 'Edit' })).toHaveCount(0)
    await binh.page.keyboard.press('Escape')

    await board(binh.page).getByRole('button', { name: 'Mark done: Nộp báo cáo giữa kỳ' }).click()
    await expect(binh.page.getByText('Done “Nộp báo cáo giữa kỳ”')).toBeVisible()
    // Standing still while the Toast shows.
    await expect(board(binh.page).getByRole('heading', { name: 'TO DO — 1' })).toBeVisible()
    // An sees it done at once.
    await expect(board(an.page).getByRole('button', { name: 'DONE — 1' })).toBeVisible({ timeout: 15_000 })
    await shoot(an.page, 'task01-done-folded')
    // Bình's row moves once the Toast goes.
    await expect(board(binh.page).getByRole('button', { name: 'DONE — 1' })).toBeVisible({ timeout: 15_000 })

    await board(binh.page).getByRole('button', { name: 'DONE — 1' }).click()
    await expect(row(binh.page, 'Nộp báo cáo giữa kỳ')).toBeVisible()

    // An, who made it, edits it from its menu; Bình sees the new title in his open Done group.
    await board(an.page).getByRole('button', { name: 'DONE — 1' }).click()
    await row(an.page, 'Nộp báo cáo giữa kỳ').hover()
    await board(an.page).getByRole('button', { name: 'Options for task Nộp báo cáo giữa kỳ' }).click()
    await shoot(an.page, 'task01-row-menu')
    await an.page.getByRole('menuitem', { name: 'Edit' }).click()
    const edit = an.page.getByRole('dialog', { name: 'Edit task' })
    await edit.getByRole('textbox', { name: /Title/ }).fill('Nộp báo cáo giữa kỳ (bản cuối)')
    await edit.getByRole('button', { name: 'Save' }).click()
    await expect(edit).toBeHidden()
    await expect(row(binh.page, 'Nộp báo cáo giữa kỳ \\(bản cuối\\)')).toBeVisible({ timeout: 15_000 })

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('turning the board off in the channel settings shows it off to who has it open, and on again', async ({
    browser
}) => {
    test.setTimeout(120_000)
    const an = await openAs(browser, anEmail)
    const binh = await openAs(browser, binhEmail)

    const settings = async (on: boolean) => {
        const channelRow = an.page
            .getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
            .getByRole('link', { name: /^viec-nhom( |$)/ })
            .locator('xpath=..')
        await channelRow.hover()
        await channelRow.getByRole('button', { name: 'Channel settings' }).click()
        const dialog = an.page.getByRole('dialog', { name: 'Channel settings' })
        const toggle = dialog.getByRole('switch', { name: 'Task Board' })
        await toggle.click()
        if (!on) await expect(dialog.getByText(/^1 open task will be hidden/)).toBeVisible()
        if (!on) await shoot(an.page, 'set05-taskboard-off')
        await dialog.getByRole('button', { name: 'Save' }).click()
        await expect(dialog).toBeHidden()
    }

    // One not done, for the warning.
    await board(an.page).getByRole('button', { name: 'Add task' }).click()
    const add = an.page.getByRole('dialog', { name: 'Add task' })
    await add.getByRole('textbox', { name: /Title/ }).fill('Ôn chương 4 — tích phân bội')
    await add.getByRole('button', { name: 'Add task' }).click()
    await expect(row(binh.page, 'Ôn chương 4 — tích phân bội')).toBeVisible({ timeout: 15_000 })

    await settings(false)
    await expect(board(binh.page).getByRole('heading', { name: 'Task Board is off' })).toBeVisible({ timeout: 15_000 })
    // Not a channel manager: nothing to open.
    await expect(board(binh.page).getByRole('button', { name: 'Open channel settings' })).toHaveCount(0)
    await expect(board(an.page).getByRole('button', { name: 'Open channel settings' })).toBeVisible()
    await shoot(binh.page, 'task01-board-off')

    await settings(true)
    // Back as it was.
    await expect(row(binh.page, 'Ôn chương 4 — tích phân bội')).toBeVisible({ timeout: 15_000 })
    await expect(board(binh.page).getByRole('button', { name: 'DONE — 1' })).toBeVisible()

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('a task opens in its detail from its row and from its link on any page, live for both', async ({ browser }) => {
    test.setTimeout(120_000)
    const made: { id: string } = (
        await ok('POST', `channels/${boardId}/tasks`, { title: 'Viết tài liệu API' }, anToken, crypto.randomUUID())
    ).data
    const binh = await openAs(browser, binhEmail)
    const detail = binh.page.getByRole('dialog', { name: 'Viết tài liệu API' })

    // By keys: Enter opens it, Esc closes it and the focus is back on its row (S-TASK-02 › Focus).
    await row(binh.page, 'Viết tài liệu API').focus()
    await binh.page.keyboard.press('Enter')
    await expect(detail).toBeVisible()
    await binh.page.keyboard.press('Escape')
    await expect(detail).toBeHidden()
    await expect(row(binh.page, 'Viết tài liệu API')).toBeFocused()

    await row(binh.page, 'Viết tài liệu API').click()
    await expect(detail).toBeVisible()
    await expect(binh.page).toHaveURL(new RegExp(`\\?task=${made.id}$`))
    // Not on it and not its maker: the status in words, "I'll do it".
    await expect(detail.getByRole('radiogroup')).toHaveCount(0)
    await expect(detail.getByText('You created the task')).toHaveCount(0)
    await expect(detail.getByText('An created the task')).toBeVisible()
    await shoot(binh.page, 'task02-viewer')
    await detail.getByRole('button', { name: "I'll do it" }).click()
    await expect(detail.getByRole('button', { name: 'Leave this task' })).toBeVisible()
    await expect(detail.getByText('You took the task')).toBeVisible()
    await expect(detail.getByRole('radiogroup')).toBeVisible()

    // An, on another page, from its link.
    const an = await openAs(browser, anEmail)
    await an.page.goto(`/study?task=${made.id}`)
    const hers = an.page.getByRole('dialog', { name: 'Viết tài liệu API' })
    await expect(hers).toBeVisible({ timeout: 15_000 })
    await expect(hers.getByText('ASSIGNED — 1')).toBeVisible()
    await shoot(an.page, 'task02-creator')
    await hers.getByRole('button', { name: 'Remove Bình from the task' }).click()
    await expect(hers.getByText('ASSIGNED', { exact: true })).toBeVisible()

    // Bình, his dialog still open: a viewer's again, and told by whom.
    await expect(binh.page.getByText('An removed you from this task')).toBeVisible({ timeout: 15_000 })
    await expect(detail.getByRole('button', { name: "I'll do it" })).toBeVisible()

    // The channel line: to the channel, its board open.
    await hers.getByRole('button', { name: /^# viec-nhom/ }).click()
    await expect(an.page).toHaveURL(new RegExp(`${boardPath}$`))
    await expect(board(an.page)).toBeVisible()
    await expect(hers).toBeHidden()

    expect(an.problems).toEqual([])
    expect(binh.problems).toEqual([])
    await an.context.close()
    await binh.context.close()
})

test('the To-do page gathers the tasks of every server, counts them, and marks one done', async ({ browser }) => {
    test.setTimeout(120_000)
    // Due in 10 minutes: today, or overdue by the time it is read; both count on the rail.
    const binhId: string = ((await ok('GET', 'users/me', undefined, binhToken)).data as { id: string }).id
    await ok(
        'POST',
        `channels/${boardId}/tasks`,
        {
            title: 'Ôn chương 4 tích phân bội',
            due_at: new Date(Date.now() + 10 * 60_000).toISOString(),
            assignee_ids: [binhId]
        },
        anToken,
        crypto.randomUUID()
    )
    const own: { id: string; channels: { id: string; name: string }[] } = (
        await ok('POST', 'servers', { name: 'Nhóm đồ án Mobile', template: 'study' }, binhToken, crypto.randomUUID())
    ).data
    const ownBoard = own.channels.find((channel) => channel.name === 'viec-nhom')!
    await ok(
        'POST',
        `channels/${ownBoard.id}/tasks`,
        { title: 'Làm slide thuyết trình' },
        binhToken,
        crypto.randomUUID()
    )

    const binh = await openAs(browser, binhEmail)
    const todo = binh.page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: /^To-do/ })
    await expect(todo).toHaveAccessibleName('To-do, 1 task overdue or due today', { timeout: 15_000 })
    await todo.click()
    await expect(binh.page).toHaveURL(/\/tasks$/)
    const column = binh.page.getByRole('navigation', { name: 'Filter tasks by server' })
    await expect(column.getByRole('link', { name: 'Nhóm đồ án Mobile, 1 task not done' })).toBeVisible()
    await expect(column.getByRole('link', { name: /^Ôn thi Giải tích 2, 1 task/ })).toBeVisible()
    const page = binh.page.getByRole('main')
    await expect(page.getByRole('heading', { name: /^(TODAY|OVERDUE) — 1$/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'NO DUE DATE — 1' })).toBeVisible()
    await expect(page.getByText('No due date · Nhóm đồ án Mobile › #viec-nhom')).toBeVisible()
    await shoot(binh.page, 'task04-default')

    // One server's.
    await column.getByRole('link', { name: /^Nhóm đồ án Mobile/ }).click()
    await expect(binh.page.getByRole('heading', { level: 1, name: 'To-do · Nhóm đồ án Mobile' })).toBeVisible()
    await expect(page.getByText('Ôn chương 4 tích phân bội')).toBeHidden()
    await shoot(binh.page, 'task04-filter-server')
    await column.getByRole('link', { name: /^All tasks/ }).click()

    // Done here: the row stays while the Toast shows, the rail's count goes at once.
    await page.getByRole('button', { name: 'Mark done: Ôn chương 4 tích phân bội' }).click()
    await expect(binh.page.getByText(/^Done “Ôn chương 4/)).toBeVisible()
    await expect(todo).toHaveAccessibleName('To-do', { timeout: 15_000 })
    await shoot(binh.page, 'task04-marked-done')

    expect(binh.problems).toEqual([])
    await binh.context.close()
})
