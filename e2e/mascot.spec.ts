import { expect, test } from '@playwright/test'
import { watchForProblems } from './helpers'

/**
 * Runtime in the brand panel of the pages outside the app (01-auth.md ›
 * Mascot): Rive, loaded after the page, takes over from the still picture and
 * waves. Only a real browser runs Rive's WebAssembly. No API needed.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const still = (page: import('@playwright/test').Page) => page.locator('aside img[role="presentation"]')

test('Rive draws Runtime over the still picture, with no page errors', async ({ page }) => {
    const problems = await watchForProblems(page)
    const wasm = page.waitForResponse((r) => r.url().endsWith('.wasm') && r.ok())
    await page.goto('/login')

    // From this site, not Rive's CDN (CSP).
    expect(new URL((await wasm).url()).origin).toBe(new URL(page.url()).origin)
    await expect(page.locator('aside canvas')).toBeVisible()
    await expect(still(page)).toHaveAttribute('data-state', 'hidden')
    expect(problems).toEqual([])
})

test.describe('with movement reduced', () => {
    test.use({ reducedMotion: 'reduce' })

    test('keeps the still picture and never loads Rive', async ({ page }) => {
        let loaded = false
        page.on('request', (r) => {
            if (r.url().endsWith('.wasm') || r.url().endsWith('.riv')) loaded = true
        })
        await page.goto('/login')

        await expect(still(page)).toHaveAttribute('data-state', 'shown')
        await page.waitForLoadState('networkidle')
        expect(loaded).toBe(false)
        await expect(page.locator('aside canvas')).toHaveCount(0)
    })
})
