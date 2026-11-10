import { expect, test, type Page } from '@playwright/test'
import { apiUrl, asOwnClient, codeFromEmail, watchForProblems } from './helpers'

/**
 * Roles against the real API (S-SET-02, REQ-ROLE-01 → 03, M1 "xong khi"):
 * An makes a role on the Roles page and gives Trưởng nhóm to Bình, who then
 * sees the channel private to it; An takes it back and Bình no longer does.
 *
 * Needs the API and Mailpit, like invites.spec.ts. With E2E_SHOTS set to a
 * folder, it also saves the screens compared with their frames.
 */
test.describe.configure({ mode: 'serial' })

const PASSWORD = 'Harbour-Lantern-42'
const SHOTS = process.env.E2E_SHOTS
const stamp = Date.now().toString(36)

let anEmail: string
let binhEmail: string
let serverId: string

test.beforeAll(async ({ browserName }) => {
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    const call = async (method: string, path: string, body?: object, token?: string, key?: string) => {
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
    const account = async (email: string, displayName: string, username: string) => {
        const sentAt = new Date()
        await call('POST', 'auth/email-code', { email })
        const verified: { access_token: string } = (
            await call('POST', 'auth/email-code/verify', { email, code: await codeFromEmail(email, 'code', sentAt) })
        ).data
        await call(
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

    anEmail = `e2e-roles-an-${browserName}${stamp}@example.test`
    binhEmail = `e2e-roles-binh-${browserName}${stamp}@example.test`
    const an = await account(anEmail, 'An', `e2e_ra${stamp}`)
    const binh = await account(binhEmail, 'Bình', `e2e_rb${stamp}`)

    // An's Study Server, `tai-lieu` private to Trưởng nhóm; Bình joins through a link.
    const server: { id: string; channels: { id: string; name: string }[]; roles: { id: string; name: string }[] } = (
        await call('POST', 'servers', { name: 'Ôn thi Giải tích 2', template: 'study' }, an, crypto.randomUUID())
    ).data
    serverId = server.id
    const lead = server.roles.find((role) => role.name === 'Trưởng nhóm')!
    const tai = server.channels.find((channel) => channel.name === 'tai-lieu')!
    await call('PATCH', `servers/${serverId}/channels/${tai.id}`, { is_private: true, view_role_ids: [lead.id] }, an)
    const invite: { code: string } = (
        await call(
            'POST',
            `servers/${serverId}/invites`,
            { max_age_seconds: null, max_uses: null },
            an,
            crypto.randomUUID()
        )
    ).data
    await call('POST', `invites/${invite.code}/accept`, {}, binh)
})

const shoot = async (page: Page, name: string) => {
    if (!SHOTS) return
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function signIn(page: Page, email: string) {
    await asOwnClient(page.context())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/login?method=password')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForURL(/\/study$/)
}

const channelList = (page: Page) => page.getByRole('navigation', { name: 'Channels of Ôn thi Giải tích 2' })

test('a role given shows its private channel, and taken back hides it', async ({ browser }) => {
    // Two people, each signing in, and a page reload for each change (D-143): longer than one page's test.
    test.setTimeout(120_000)
    const an = await browser.newPage()
    const anProblems = await watchForProblems(an)
    await signIn(an, anEmail)

    const binhContext = await browser.newContext()
    const binh = await binhContext.newPage()
    const binhProblems = await watchForProblems(binh)
    await signIn(binh, binhEmail)
    await binh.goto(`/channels/${serverId}`)
    await expect(channelList(binh).getByRole('link', { name: 'hoi-dap' })).toBeVisible({ timeout: 20_000 })
    await expect(channelList(binh).getByRole('link', { name: 'tai-lieu' })).toHaveCount(0)

    // The Roles page: Trưởng nhóm, then @everyone below the rule.
    await an.goto(`/servers/${serverId}/settings/roles`)
    await expect(an.getByRole('heading', { name: 'Roles — 1' })).toBeVisible({ timeout: 20_000 })
    await shoot(an, 'set02-list')

    // A new role opens on its permissions.
    await an.getByRole('button', { name: 'Create role' }).click()
    await an.getByRole('dialog', { name: 'Create role' }).getByLabel('Role name').fill('Nhóm đề')
    await an.getByRole('dialog', { name: 'Create role' }).getByRole('button', { name: 'Create role' }).click()
    await expect(an.getByRole('heading', { level: 2, name: 'Nhóm đề' })).toBeVisible()
    await expect(an.getByRole('switch', { name: 'Kick members' })).not.toBeChecked()
    await shoot(an, 'set02-edit-role')

    // Trưởng nhóm, tab Members: add Bình.
    await an.getByRole('link', { name: 'Roles' }).first().click()
    await an.getByRole('link', { name: /Trưởng nhóm/ }).click()
    await an.getByRole('tab', { name: /Members/ }).click()
    await an.getByRole('button', { name: 'Add members' }).click()
    const dialog = an.getByRole('dialog', { name: 'Add to Trưởng nhóm' })
    await dialog.getByPlaceholder('Search by name or username').fill('binh')
    await dialog.locator('label').filter({ hasText: 'Bình' }).getByRole('checkbox').check()
    await shoot(an, 'set02-members-add')
    await dialog.getByRole('button', { name: 'Add (1)' }).click()
    await expect(an.getByText('Added 1 person to Trưởng nhóm')).toBeVisible()
    await expect(an.getByRole('button', { name: 'Remove Trưởng nhóm from Bình' })).toBeVisible()
    await shoot(an, 'set02-role-members')

    // Bình, reloading (live updates come with M2, D-143), sees the private channel.
    await binh.reload()
    await expect(channelList(binh).getByRole('link', { name: 'tai-lieu' })).toBeVisible({ timeout: 20_000 })

    // Taken back: hidden again.
    await an.getByRole('button', { name: 'Remove Trưởng nhóm from Bình' }).click()
    await expect(an.getByText('Removed Trưởng nhóm from Bình')).toBeVisible()
    await binh.reload()
    await expect(channelList(binh).getByRole('link', { name: 'hoi-dap' })).toBeVisible({ timeout: 20_000 })
    await expect(channelList(binh).getByRole('link', { name: 'tai-lieu' })).toHaveCount(0)

    expect(anProblems).toEqual([])
    expect(binhProblems).toEqual([])
    await binhContext.close()
})
