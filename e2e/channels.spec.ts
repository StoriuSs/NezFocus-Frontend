import { expect, test, type Locator, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Categories and channels against the real API (S-SRV-04, S-SRV-05,
 * S-SET-05, S-SRV-06, REQ-SRV-02): the server menu, a channel created and
 * opened, made private, renamed and deleted; a category created; a channel
 * dragged with the mouse, kept after a reload.
 *
 * Needs the API and Mailpit, like servers.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS

let email: string

/** A completed account owning one Study Server, made through the API. */
test.beforeAll(async ({ browserName }) => {
    email = `e2e-channels-${browserName}${Date.now().toString(36)}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const post = async (path: string, body: object, token?: string, key?: string) => {
        const response = await fetch(`${apiUrl}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Origin: 'http://localhost:3001',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(key ? { 'Idempotency-Key': key } : {})
            },
            body: JSON.stringify(body)
        })
        expect(response.ok, `POST ${path}: ${response.status}`).toBe(true)
        return (await response.json()) as { data: { access_token: string } | null }
    }
    const sentAt = new Date()
    await post('auth/email-code', { email })
    const verified = await post('auth/email-code/verify', { email, code: await codeFromEmail(email, 'code', sentAt) })
    const token = verified.data!.access_token
    await post(
        'auth/complete-account',
        {
            display_name: 'An',
            username: `e2e_c${Date.now().toString(36)}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        token
    )
    await post('servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, token, crypto.randomUUID())
})

async function openServer(page: Page) {
    await asOwnClient(page.context())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
    await page.getByRole('navigation', { name: 'Servers' }).getByRole('link', { name: 'Ôn thi Giải tích 2' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'chao-mung' })).toBeVisible()
}

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    // Let colour transitions finish: a tick drawn mid-fade looks unticked.
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const channels = (page: Page) => page.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
/** A channel's row: the list item right around its link (the group's item holds it too). */
const rowOf = (page: Page, name: string) =>
    channels(page)
        // The name, then maybe the lock's label ("Private channel").
        .getByRole('link', { name: new RegExp(`^${name}( |$)`) })
        .locator('xpath=..')

/** The channels under a category's heading (its list, named by aria-controls). */
async function group(page: Page, heading: string): Promise<Locator> {
    const button = channels(page).getByRole('button', { name: heading, exact: true })
    return channels(page).locator(`[id="${await button.getAttribute('aria-controls')}"]`)
}

test('creates, opens, makes private, renames and deletes a channel; creates a category', async ({ page }) => {
    const problems = await watchForProblems(page)
    await openServer(page)

    await page.getByRole('button', { name: 'Ôn thi Giải tích 2' }).click()
    await expect(page.getByRole('menuitem')).toHaveText([
        'Invite people',
        'Server settings',
        'Create channel',
        'Create category'
    ])
    await shoot(page, 'server-menu')
    await page.getByRole('menuitem', { name: 'Create channel' }).click()

    const create = page.getByRole('dialog', { name: 'Create a channel' })
    await create.getByRole('textbox', { name: 'Channel name' }).fill('Tài liệu chương 5')
    await expect(create.getByText('Will be saved as #tài-liệu-chương-5')).toBeVisible()
    await shoot(page, 'create-text')
    await create.getByRole('button', { name: 'Create channel' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'tài-liệu-chương-5' })).toBeVisible()
    // Outside any category: above the first one.
    await expect(channels(page).getByRole('link').first()).toHaveText('tài-liệu-chương-5')

    // Settings: private for Trưởng nhóm, renamed.
    const row = rowOf(page, 'tài-liệu-chương-5')
    await row.hover()
    await row.getByRole('button', { name: 'Channel settings' }).click()
    const settings = page.getByRole('dialog', { name: 'Channel settings' })
    await settings.getByRole('switch', { name: 'Private channel' }).click()
    await settings.getByRole('checkbox', { name: /Trưởng nhóm/ }).check()
    const name = settings.getByRole('textbox', { name: 'Channel name' })
    await name.fill('Tài liệu ôn tập')
    await shoot(page, 'channel-settings-private')
    await settings.getByRole('button', { name: 'Save' }).click()
    await expect(settings).toBeHidden()
    await expect(channels(page).getByRole('link', { name: 'tài-liệu-ôn-tập' })).toBeVisible()
    await expect(channels(page).getByRole('img', { name: 'Private channel' })).toBeVisible()

    // Delete, typing the name without its accents.
    const renamed = rowOf(page, 'tài-liệu-ôn-tập')
    await renamed.hover()
    await renamed.getByRole('button', { name: 'Channel settings' }).click()
    await page.getByRole('dialog', { name: 'Channel settings' }).getByRole('button', { name: 'Delete channel' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete #tài-liệu-ôn-tập?' })
    await expect(confirm.getByRole('button', { name: 'Delete channel' })).toBeDisabled()
    await confirm.getByRole('textbox').fill('tai-lieu-on-tap')
    await shoot(page, 'delete-channel')
    await confirm.getByRole('button', { name: 'Delete channel' }).click()
    await expect(page.getByText('Deleted #tài-liệu-ôn-tập')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'chao-mung' })).toBeVisible()

    // A category, at the end of the list.
    await page.getByRole('button', { name: 'Ôn thi Giải tích 2' }).click()
    await page.getByRole('menuitem', { name: 'Create category' }).click()
    const category = page.getByRole('dialog', { name: 'Create a category' })
    await category.getByRole('textbox', { name: 'Category name' }).fill('Ôn tập cuối kỳ')
    await category.getByRole('button', { name: 'Create category' }).click()
    await expect(channels(page).getByRole('button', { name: 'Ôn tập cuối kỳ', exact: true })).toBeVisible()
    expect(problems).toEqual([])
})

/** Press on a row, move past the 4 px start, and drop on the upper or lower half of another. */
async function drag(page: Page, from: Locator, onto: Locator, half: 'upper' | 'lower', shot?: string) {
    const start = (await from.boundingBox())!
    const end = (await onto.boundingBox())!
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
    await page.mouse.down()
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 + 8, { steps: 4 })
    const y = half === 'upper' ? end.y + end.height * 0.2 : end.y + end.height * 0.8
    await page.mouse.move(end.x + end.width / 2, y, { steps: 12 })
    if (shot) await shoot(page, shot)
    await page.mouse.up()
}

test('drags a channel up its category and into another, kept after a reload (D-149)', async ({ page }) => {
    await openServer(page)
    const info = await group(page, 'Thông tin')
    await expect(info.getByRole('link')).toHaveText(['chao-mung', 'thong-bao', 'tai-lieu', 'hoi-dap', 'viec-nhom'])

    await drag(
        page,
        info.getByRole('link', { name: 'viec-nhom' }),
        info.getByRole('link', { name: 'tai-lieu' }),
        'upper',
        'dragging'
    )
    await expect(info.getByRole('link')).toHaveText(['chao-mung', 'thong-bao', 'viec-nhom', 'tai-lieu', 'hoi-dap'])

    const rooms = channels(page).getByRole('button', { name: 'Phòng học', exact: true })
    await drag(page, info.getByRole('link', { name: 'hoi-dap' }), rooms, 'lower', 'drop-into-category')
    const roomsList = await group(page, 'Phòng học')
    await expect(roomsList.getByRole('link')).toHaveText(['Phòng học im lặng', 'Phòng thảo luận nhóm', 'hoi-dap'])

    await page.reload()
    await expect((await group(page, 'Thông tin')).getByRole('link')).toHaveText([
        'chao-mung',
        'thong-bao',
        'viec-nhom',
        'tai-lieu'
    ])
})
