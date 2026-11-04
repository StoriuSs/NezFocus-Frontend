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

let siteKey: Promise<string | null> | undefined

/** The API's Turnstile site key (GET /auth/options); null when Turnstile is off. */
function turnstileSiteKey(): Promise<string | null> {
    siteKey ??= fetch(`${apiUrl}/auth/options`)
        .then((answer) => answer.json() as Promise<{ data: { turnstile_site_key: string | null } }>)
        .then(({ data }) => data.turnstile_site_key)
    return siteKey
}

/**
 * Cloudflare's test site keys (1x…, 2x…, 3x…) answer the same way every time;
 * a real key shows a real challenge, which a test browser may not pass. Fail
 * with the fix rather than time out on a widget (docs/e2e-testing.md).
 */
export async function requireTestableTurnstile(): Promise<void> {
    const key = await turnstileSiteKey()
    if (key && !/^[123]x0{20}AA$/.test(key)) {
        throw new Error(
            'The API has Turnstile on with a real site key. For end-to-end tests, run it with ' +
                'Cloudflare\'s test keys, or with Turnstile off (docs/e2e-testing.md, "Turnstile").'
        )
    }
}

/**
 * With Turnstile on, wait until the form's widget is solved. With Cloudflare's
 * always-passes test key that takes a second or two, for real, through the
 * Content-Security-Policy.
 *
 * `always`: the form asks for it every time (sign-up, forgot password), so
 * wait for the widget to appear — the page draws it once the API's options
 * arrive. Otherwise (sign-in) only a widget already on the page is waited on.
 */
export async function solveTurnstile(page: Page, { always = false } = {}): Promise<void> {
    if (!(await turnstileSiteKey())) return
    const widget = page.getByTestId('turnstile')
    if (!always && (await widget.count()) === 0) return
    await expect(widget).toHaveAttribute('data-state', 'solved', { timeout: 30_000 })
}

/**
 * Submit a form whose request may be refused for going too fast (the API
 * sends at most one code email a minute to an address). Waits as long as the
 * page says, then submits again — which also checks that the page says it.
 */
export async function submitPatiently(page: Page, button: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
        const before = page.url()
        // A refused attempt spent the token: the form drew a new widget.
        await solveTurnstile(page, { always: true })
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
