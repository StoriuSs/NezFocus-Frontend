import { expect, type BrowserContext, type Page } from '@playwright/test'

export const apiUrl = (process.env.E2E_API_URL ?? 'http://localhost:8888/api/v1').replace(/\/+$/, '')
export const mailpitUrl = (process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025').replace(/\/+$/, '')

/** CSP violations and uncaught errors, collected per test. */
export async function watchForProblems(page: Page): Promise<string[]> {
    const problems: string[] = []
    page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
    page.on('console', (message) => {
        if (message.text().startsWith('CSP violation')) problems.push(message.text())
    })
    await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) =>
            console.error(
                `CSP violation: ${e.violatedDirective} blocked ${e.blockedURI || 'inline'} in ${location.href}`
            )
        )
    })
    return problems
}

/**
 * Makes this browser context look like a client of its own to the API: every
 * request to it carries a random X-Forwarded-For, which the API reads as the
 * client address (it trusts one proxy hop). Its per-IP limits — five new
 * accounts an hour, ten failed sign-ins — would otherwise trip on the second
 * or third run in an hour, all from 127.0.0.1.
 */
export async function asOwnClient(context: BrowserContext): Promise<void> {
    const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`
    await context.route(`${apiUrl}/**`, (route) =>
        route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } })
    )
}

interface MailpitMessage {
    ID: string
    Subject: string
    Created: string
}

interface MailpitBody {
    Text: string
    HTML: string
}

/**
 * The newest email to `address` whose subject contains `subject`, and that
 * arrived after `since`, waiting up to 20 s for it. Mailpit catches every
 * email the API sends in development (docker-compose.dev.yaml in the API
 * repository).
 */
export async function emailTo(address: string, subject: string, since: Date): Promise<MailpitBody> {
    let found: MailpitBody | undefined
    await expect
        .poll(
            async () => {
                const search = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
                const { messages } = (await search.json()) as { messages: MailpitMessage[] }
                const message = messages.find(
                    (m) => m.Subject.includes(subject) && new Date(m.Created).getTime() >= since.getTime() - 1000
                )
                if (!message) return false
                found = (await (await fetch(`${mailpitUrl}/api/v1/message/${message.ID}`)).json()) as MailpitBody
                return true
            },
            { message: `a "${subject}" email to ${address}`, timeout: 20_000, intervals: [500] }
        )
        .toBe(true)
    return found!
}

/** The 6-digit code in the newest matching email (see emailTo). */
export async function codeFromEmail(address: string, subject: string, since: Date): Promise<string> {
    const code = /\b(\d{6})\b/.exec((await emailTo(address, subject, since)).Text)?.[1]
    expect(code, `a 6-digit code in the "${subject}" email`).toMatch(/^\d{6}$/)
    return code!
}

export async function openAccountMenuItem(page: Page, item: string): Promise<void> {
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: item }).click()
}

/**
 * Submit a form whose request may be refused for going too fast (the API
 * sends at most one code email a minute to an address). Waits as long as the
 * page says, then submits again — which also checks that the page says it.
 */
export async function submitPatiently(page: Page, button: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const before = page.url()
        await page.getByRole('button', { name: button, exact: true }).click()
        const tooFast = page.getByText(/Try again in (\d+) seconds?\./)
        const outcome = await Promise.race([
            page.waitForURL((url) => url.href !== before, { timeout: 15_000 }).then(() => 'moved' as const),
            tooFast.waitFor({ timeout: 15_000 }).then(() => 'wait' as const)
        ])
        if (outcome === 'moved') return
        const seconds = Number(/in (\d+) second/.exec((await tooFast.textContent()) ?? '')?.[1] ?? 60)
        await page.waitForTimeout((seconds + 1) * 1000)
    }
    throw new Error(`"${button}" was still refused after waiting`)
}
