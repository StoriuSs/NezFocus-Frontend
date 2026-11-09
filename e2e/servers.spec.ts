import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, solidPng, watchForProblems } from './helpers'

/**
 * Creating a server (S-SRV-01, REQ-SRV-01, REQ-STUDY-08) against the real
 * API: from the no-server page, with a cropped picture, to its first text
 * channel; then a plain one from the rail's ＋, joining the end of the rail.
 *
 * Needs the API and Mailpit, like account.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS

let email: string

/** A completed account with no server, made through the API. */
test.beforeAll(async ({ browserName }) => {
    email = `e2e-servers-${browserName}${Date.now().toString(36)}@example.test`
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const post = async (path: string, body: object, token?: string) => {
        const response = await fetch(`${apiUrl}/${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Forwarded-For': ip,
                Origin: 'http://localhost:3001',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify(body)
        })
        expect(response.ok, `POST ${path}: ${response.status}`).toBe(true)
        return (await response.json()) as { data: { access_token: string } | null }
    }
    const sentAt = new Date()
    await post('auth/email-code', { email })
    const verified = await post('auth/email-code/verify', { email, code: await codeFromEmail(email, 'code', sentAt) })
    await post(
        'auth/complete-account',
        {
            display_name: 'An',
            username: `e2e_s${Date.now().toString(36)}`,
            password: PASSWORD,
            timezone: 'Asia/Ho_Chi_Minh',
            language: 'en',
            terms_accepted: true
        },
        verified.data!.access_token
    )
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
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const rail = (page: Page) => page.getByRole('navigation', { name: 'Servers' })

test('from no server to a Study Server with a picture, opened at its welcome channel', async ({ page }) => {
    const problems = await watchForProblems(page)
    await signIn(page)
    await expect(page.getByRole('heading', { level: 2, name: 'No servers yet' })).toBeVisible()
    await shoot(page, 'no-server')

    await page.getByRole('button', { name: 'Create a Study Server' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create a server' })
    await expect(dialog.getByRole('radio', { name: /Study Server/ })).toHaveAttribute('aria-checked', 'true')
    await shoot(page, 'create-default')

    await dialog.getByRole('textbox', { name: 'Server name' }).fill('Ôn thi Giải tích 2')
    await dialog.locator('input[type=file]').setInputFiles({
        name: 'icon.png',
        mimeType: 'image/png',
        buffer: solidPng(400)
    })
    const crop = page.getByRole('dialog', { name: 'Crop the server picture' })
    await expect(crop).toBeVisible()
    await shoot(page, 'icon-crop')
    await crop.getByRole('button', { name: 'Use image' }).click()
    await expect(crop).toBeHidden()
    await expect(dialog.getByRole('button', { name: 'Change image' })).toBeVisible()

    await dialog.getByRole('button', { name: 'Create server' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'chao-mung' })).toBeVisible()
    await expect(page).toHaveURL(/\/channels\/[^/]+\/[^/]+$/)
    const server = rail(page).getByRole('link', { name: 'Ôn thi Giải tích 2' })
    await expect(server).toHaveAttribute('aria-current', 'page')
    await expect(server.locator('img')).toBeVisible()

    const channels = page.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })
    await expect(channels.getByRole('link')).toHaveText([
        'chao-mung',
        'thong-bao',
        'tai-lieu',
        'hoi-dap',
        'viec-nhom',
        'Phòng học im lặng',
        'Phòng thảo luận nhóm'
    ])
    await shoot(page, 'created')

    // It is the server's, not the page's: still there after a reload.
    await page.reload()
    await expect(rail(page).getByRole('link', { name: 'Ôn thi Giải tích 2' })).toBeVisible()
    expect(problems).toEqual([])
})

test('a plain server from ＋ joins the end of the rail, opened at chung', async ({ page }) => {
    await signIn(page)
    await rail(page).getByRole('button', { name: 'Create or join a server' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create a server' })
    await dialog.getByRole('radio', { name: /Plain server/ }).click()
    await dialog.getByRole('textbox', { name: 'Server name' }).fill('Nhóm chơi')
    await dialog.getByRole('button', { name: 'Create server' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'chung' })).toBeVisible()
    const names = await rail(page)
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.getAttribute('aria-label')))
    expect(names).toEqual(['Ôn thi Giải tích 2', 'Nhóm chơi'])

    await page.getByRole('link', { name: 'Phòng thoại chung' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Voice rooms come in a later version' })).toBeVisible()
})
