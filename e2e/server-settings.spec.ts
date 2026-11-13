import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, solidPng, watchForProblems } from './helpers'

/**
 * Server settings › Overview against the real API (S-SET-01, C-27, C-05,
 * REQ-SRV-01, D-83): opened from the rail by right-click, a picture
 * uploaded, the name saved from the save bar (and refused under 2
 * characters), the welcome channel turned off, all kept after a reload;
 * leaving with an unsaved name asks first.
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
    email = `e2e-overview-${browserName}${Date.now().toString(36)}@example.test`
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
            username: `e2e_o${Date.now().toString(36)}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        token
    )
    await post('servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, token, crypto.randomUUID())
})

async function signIn(page: Page) {
    await asOwnClient(page.context())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
}

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    // Let colour transitions finish.
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Servers' })

test('changes the picture, the name and the welcome channel from Overview', async ({ page }) => {
    const problems = await watchForProblems(page)
    await signIn(page)

    // C-05: right-click on the server's picture opens the server menu.
    await rail(page).getByRole('link', { name: 'Ôn thi Giải tích 2' }).click({ button: 'right' })
    await page.getByRole('menuitem', { name: 'Server settings' }).click()
    await page.waitForURL(/\/servers\/[^/]+\/settings\/overview$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Server settings' })
    await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
    await expect(rail(page).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toHaveAttribute('aria-current', 'page')
    const welcome = page.getByRole('combobox', { name: 'Welcome channel' })
    await expect(welcome).toHaveText('# chao-mung')
    // "Owner" follows the fields, as in the frame, not pushed to the bottom of the page.
    const owner = page.getByRole('region', { name: 'Owner' })
    const welcomeBox = (await welcome.boundingBox())!
    expect((await owner.boundingBox())!.y - (welcomeBox.y + welcomeBox.height)).toBeLessThan(100)
    await shoot(page, 'set-owner')

    // The picture: cropped, uploaded at once.
    await page
        .locator('input[type=file]')
        .setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: solidPng(400) })
    const crop = page.getByRole('dialog', { name: 'Crop the server picture' })
    await crop.getByRole('button', { name: 'Use image' }).click()
    await expect(crop).toBeHidden()
    await expect(page.getByRole('button', { name: 'Remove picture' })).toBeVisible()
    await expect(rail(page).getByRole('link', { name: 'Ôn thi Giải tích 2' }).locator('img')).toBeVisible()

    // The name: too short is refused in place; a good one saves from the save bar.
    const name = page.getByRole('textbox', { name: 'Server name' })
    await name.fill('Ô')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByText('A server name needs 2–100 characters')).toBeVisible()
    await shoot(page, 'set-name-error')
    await name.fill('Ôn thi Giải tích 2 – K22')
    await expect(page.getByText('You have unsaved changes')).toBeVisible()
    // The save bar still floats 24 above the bottom of the content, after "Owner".
    const bar = (await page.getByText('You have unsaved changes').locator('..').boundingBox())!
    expect(bar.y + bar.height).toBeCloseTo(page.viewportSize()!.height - 24, 0)
    await shoot(page, 'set-editing')
    await name.press('Enter')
    await expect(page.getByText('Changes saved')).toBeVisible()
    await expect(page.getByText('You have unsaved changes')).toBeHidden()
    await expect(page.getByRole('heading', { level: 2, name: 'Ôn thi Giải tích 2 – K22' })).toBeVisible()

    // The welcome channel: saved as soon as it is chosen.
    await welcome.click()
    await expect(page.getByRole('option')).toHaveText([
        /Send none/,
        /# chao-mung/,
        /# thong-bao/,
        /# tai-lieu/,
        /# hoi-dap/,
        /# viec-nhom/
    ])
    await shoot(page, 'set-welcome-select')
    const saved = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.ok())
    await page.getByRole('option', { name: /Send none/ }).click()
    await saved
    await expect(page.getByText('Nothing is posted when someone joins the server.')).toBeVisible()
    await shoot(page, 'set-welcome-off')

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Welcome channel' })).toHaveText('Send none')
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('Ôn thi Giải tích 2 – K22')
    await expect(page.getByRole('button', { name: 'Remove picture' })).toBeVisible()

    // Leaving with a typed name asks first.
    await page.getByRole('textbox', { name: 'Server name' }).fill('Ôn thi')
    await page.getByRole('link', { name: 'Study', exact: true }).click()
    const discard = page.getByRole('dialog', { name: 'Discard changes?' })
    await discard.getByRole('button', { name: 'Stay' }).click()
    await expect(page).toHaveURL(/\/settings\/overview$/)
    await page.getByRole('button', { name: 'Discard changes' }).click()
    await expect(page.getByRole('textbox', { name: 'Server name' })).toHaveValue('Ôn thi Giải tích 2 – K22')

    expect(problems).toEqual([])
})
