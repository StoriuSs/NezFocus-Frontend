# Testing

The unit and component tests: **Vitest** with **React Testing Library**, in
a simulated browser (jsdom). They need nothing running — no API, no browser —
and take seconds.

For the browser tests against the running app (Playwright, `pnpm test:e2e`),
see [e2e-testing.md](./e2e-testing.md).

- [What we test](#what-we-test)
- [Running them](#running-them)
- [Configuration](#configuration)
- [Where the tests are](#where-the-tests-are)
- [Writing one](#writing-one)
- [How the auth tests stand in for the API](#how-the-auth-tests-stand-in-for-the-api)
- [Tests that guard the repository](#tests-that-guard-the-repository)
- [Coverage](#coverage)
- [Resources](#resources)

## What we test

Only what is absolutely necessary. A test stays when all three hold:

1. The bug it catches would let someone into an account, leak a secret or get
   round a limit; lose or corrupt data; or let a broken release deploy (the
   checks that keep the files that ship in step).
2. Nothing else in the suite would catch that bug.
3. It is the one test for that behaviour: one or two example inputs, not a
   table of them.

Everything else is left out: wording and copy, per-screen UI detail, trivial
code (getters, defaults, mappers), re-tests of libraries (zod, clsx,
camelcase-keys), tests of the test setup, logging and monitoring details. A
project built on this starter keeps the same bar: add a test when a bug of the
first kind would otherwise get through, not for every new screen.

## Running them

```bash
pnpm test            # all of them, once (also the pre-push hook, and CI)
pnpm test:watch      # re-run on every change
pnpm test:coverage   # with a coverage report
pnpm test src/features/auth    # only the files under a path
```

In Git Bash on Windows, `unset NODE_ENV` first if your shell sets it to
`production`: React's test helpers need the development build.

## Configuration

| File | What it does |
|------|---------|
| `vitest.config.ts` | jsdom, the `@/` alias, the setup file, and `VITE_API_URL=http://api.test/api/v1`, so `src/config/env.ts` accepts the test environment. Runs `src/**/*.{test,spec}.{ts,tsx}` and `scripts/**/*.test.mjs` |
| `src/test/setup.ts` | jest-dom's matchers (`toBeInTheDocument`…), cleanup after each test, and the browser APIs jsdom lacks (`matchMedia`, `ResizeObserver`, pointer capture, which a toast's button calls, `scrollIntoView`, which an open `Select` calls) |
| `src/test/helpers.tsx` | What several tests share: `httpError()` (an `AxiosError` for any HTTP answer body), `apiError()` (one carrying the API's envelope, built on it), `mockAuthStore()` (the auth store as a plain state object), `queryWrapper()` (a fresh `QueryClient` per render) |

## Where the tests are

Next to the code, in a `__tests__` folder:

| Folder | What is tested |
| --- | --- |
| `src/features/auth/__tests__/` | The auth pages (`pages.test.tsx`: sign-in by code or by password, switching ways with the email kept, the way remembered (D-68), one message for a wrong password or an unknown address, each way's limits, the banner for a session that ended; forgot and reset: the address out of the URL, the hedged words, the password kept when only the code was wrong, sending again; `/register` sending a code, keeping `next` / `invite` and the address out of the URL, no second email within the minute, the limits; `/verify`: the code sent at the sixth digit, a wrong or dead code, the countdown, Back, the password instead, the code remembered as the way; the Google return address and an account made by Google sent to `/welcome`), "complete your account" (`welcome.test.tsx`: the prefilled username, a taken one, every field checked, the time zone searched, `USERNAME_CONFLICT`, another tab first), messages that follow the language switch and `formatWait` (`form-problem.test.ts`), the username made from the email (`username-prefill.test.ts`), deleting an account: the day it goes, the password first, a wrong one under the field, five waited out, "Forgot password?" handing over to the password dialog and back (`delete-account.test.tsx`), the deletion day and the days left (`deletion-date.test.ts`), the change-password dialog: the current password and one new one, a wrong current password, five wrong ones waited out, and "Forgot password?" by emailed code, no second code within the minute (`change-password-dialog.test.tsx`), the new-password check (`schemas.test.ts`: `newPasswordIssue`), the Sessions group: this device first, one device signed out without asking, the others after a question, the row kept on failure, **Try again** (`sessions-section.test.tsx`), when a session was last used, in the account's time zone, and its name (`session-label.test.ts`), the requests that carry the language (`auth-api.test.ts`), the store (`auth.store.test.ts`: the token in memory only, a refused refresh, where an ended session lands, each reader taking only its kind of sign-out reason, sign-out, other tabs, `isComplete`, an account waiting to be deleted: `deletesAt`, restore, "Not now", the day kept for the banner), the API's `data.reason` as a sign-out reason, `revoked` worded like an expiry, `account_deleted` with or without a day (`sign-out-reason.test.ts`), the banner or the toast for each sign-out reason (`sign-out-notice.test.ts`), the guards with an incomplete account or one waiting to be deleted (`ProtectedRoute.test.tsx`), `RequireRole`, `safeNext`, `withFlow`, `afterSignIn` (an account waiting to be deleted kept on sign-in) and `signInPath` (`paths.test.ts`); the pages also cover the dated `account-deleted` banner and a sign-in stopped at the restore dialog |
| `src/lib/__tests__/` | The API client (token, refresh and retry, sign-out only when the session ended, a revoked session taking up a newer one of this browser after a reset in another tab (D-74), `ACCOUNT_INCOMPLETE` and `ACCOUNT_PENDING_DELETION` keeping the session, the auth routes), idempotency keys without `crypto.randomUUID`, error tracking's scrubbing (one file runs the real Sentry SDK), the app still starting when an ad blocker stops the Sentry SDK (`error-tracking.start.test.ts`), the time zones to pick from (`time-zones.test.ts`), the phase sound: C6 then E6, one audio context, silent without Web Audio (`phase-sound.test.ts`), the legal pages' Markdown, links that could run script kept as text (`simple-markdown.test.ts`), a crop kept or scaled down to its longest edge and failing loudly (`crop-image.test.ts`), `cn()` keeping a design-system font size (`utils.test.ts`) |
| `src/features/users/__tests__/` | The username rule; the username check never shows the answer for a name that is no longer in the field, and asks nothing about a name the API would refuse (`username.test.tsx`); the profile page (`profile-page.test.tsx`): the counters, the save bar only while something changed, both fields saved composed and trimmed, a name that would look empty refused at the field, what was typed kept when the save fails, Ctrl+Enter in the bio, a pasted bio cut at 200 and said so, the question before leaving with changes; a GIF or an image over 8 MB refused under the buttons without opening the cropper; a chosen image cropped and uploaded, the dialog waiting for the upload; removing the picture: gone at once, the API asked only once Undo has run out, Undo asking nothing, a keepalive request when the tab closes first; the API's character rules mirrored (`profile-text.test.ts`: NFC, code points, a paste never cut inside an emoji); the settings pages (`settings-pages.test.tsx`): the account's theme and language applied as the app opens, a theme shown at once and saved, the arrow keys choosing, the language switching the whole app, the old value back on a failed save with **Try again**, a choice from another tab followed; the time zone asking first, locked for 24 hours in the new zone, unlocking by itself, the lock shown when another tab changed it; the phase sound switch and Play sample; the Privacy switches and their descriptions; settings that could not be loaded, and **Try again**; accessibility of the three pages |
| `src/features/servers/__tests__/` | Create a server (`create-server-dialog.test.tsx`: the template, the name rule and when its error goes, a wrong file refused before the cropper, the picture uploaded once the server exists, sent once); the channel and category dialogs (`channel-dialogs.test.tsx`: names and clashes in the category, D-84; private channels and their roles; a saved change reaching the rail and the channel list; something deleted meanwhile reading the list again); the channel list (`channel-list.test.tsx`: the server menu, drag to reorder, categories folded and kept in this browser, storage refused) and its pure rules (`channel-layout.test.ts`: names, drop places, the list right after a drop, the layout API calls, a refused change); invites (`invites.test.tsx`: the invite helpers, Invite friends and its settings, the invite page, joining while signed in, joining by code, the Invites settings page); who sees which settings page and Overview (`server-settings.test.tsx`); roles (`roles.test.tsx`: the list and its order, editing a role, its members); members and bans (`members.test.tsx`: the row actions by rank, timeout, kick and ban, Ctrl + Enter, **Try again**, the search on the URL, paging past ten; the Bans page: unban, a filter blind to accents, a deleted account); the helpers (`server-lib`, `roles-lib`, `moderation-lib`); the path builders against the routes' patterns (`paths.test.ts`); the API calls (`servers-api.test.ts`) |
| `src/app/layout/__tests__/`, `src/app/layout/app-shell/__tests__/` | The AuthShell (`AuthShell.test.tsx`: the logo, the language toggle, **Sign out** only on "complete your account", accessibility); the AppShell (`AppShell.test.tsx`: Study marked in the rail and its column, the servers in the order they came, ＋ opening "Create a server", the no-server page, a server opened at its first text channel, its channels in order, private channels and folded categories, the server menu by right-click and Shift+F10, the server settings column, the right panel and the navigation sheet, your menu, accessibility) |
| `src/components/**/__tests__/` | The mascot hands over to Rive, or keeps the still picture (reduced motion, a small window, Rive not ready) (`Mascot.test.tsx`); a toast can be closed before it hides (`sonner.test.tsx`) |
| `src/test/__tests__/` | The accessibility check fails on a real problem (`a11y.test.tsx`) |
| `src/hooks/__tests__/` | `useIdempotentMutation`: one key per intent; `useCountdown`: whole seconds to a moment; `useMinuteClock`: moves on at each new minute; `useMediaQuery` |
| `src/pages/__tests__/` | The legal pages (`Legal.test.tsx`): each text in the language on screen, the bar for a visitor and for someone signed in, accessibility |
| `src/config/`, `src/i18n/`, `scripts/` | The repository itself ([below](#tests-that-guard-the-repository)) |

## Writing one

### A component

```tsx
import { render } from '@testing-library/react'
import { PageLoader } from '@/components/PageLoader'

it('renders a loading spinner', () => {
    render(<PageLoader />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
})
```

Prefer finding things the way a user does — `screen.getByRole('button', { name: 'Sign in' })`,
`getByLabelText('Email')` — over CSS classes; that also keeps the
accessibility labels honest.

### Accessibility

Every new page, and every part of the app shell, gets one test that runs
axe-core over what it renders ([CONSTRAINTS.md](../CONSTRAINTS.md)):

```tsx
import { expectNoA11yViolations } from '@/test/a11y'

it('/login has no critical or serious problems', async () => {
    renderAt('/login')
    await screen.findByLabelText('Email') // wait for the page, not the spinner
    await expectNoA11yViolations()
})
```

It fails on a critical or serious WCAG 2.1 A / AA problem (a button with no
name, an input with no label, a broken ARIA attribute) and names the rule
and the element. Colour contrast is not checked: jsdom computes no colours.
`src/test/__tests__/a11y.test.tsx` proves the check fails on a real problem.

### A hook

```tsx
import { renderHook, act } from '@testing-library/react'
import { useTheme } from '@/hooks/useTheme'

it('can set the theme to dark', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')
})
```

A module that keeps state from when it is first imported needs a fresh copy
per test: `src/features/auth/__tests__/auth.store.test.ts` calls
`vi.resetModules()` in `beforeEach` and imports the store again. Reset shared
state in `beforeEach`, never at the end of a test: a test that fails before
its last line would leave it behind for the next one.

### A utility

```tsx
import { cn } from '@/lib/utils'

it('merges Tailwind classes', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4') // px-4 overrides px-2
})
```

## How the auth tests stand in for the API

No test talks to a real API. Each one replaces the module it would reach
with `vi.mock`, and decides what it answers:

- **The auth pages** (`pages.test.tsx`, `delete-account.test.tsx`) mock
  `@/features/auth/api/auth.api` with an object of `vi.fn()`s, one per API call,
  and `@/features/auth/auth.store` with a plain state object read through the
  selector. A test sets what a call resolves or rejects with — an
  `AxiosError` carrying the API's envelope (`meta.type`, a `Retry-After`
  header, `data.reason`) — renders the page in a `createMemoryRouter` with
  the real `authRoutes`, and checks what the user would see. `sonner` is
  mocked to check toasts.
- **The store** (`auth.store.test.ts`) mocks the API module, the query
  client, `hardNavigate` (jsdom cannot navigate), error tracking and tab sync,
  and runs the real store: the token kept in memory only, a refused refresh
  ending the session, what a sign-out clears, a sign-out in another tab. It
  runs on fake timers (`vi.useFakeTimers()`), so nothing waits for real.
- **The API client** (`src/lib/__tests__/api.test.ts`) mocks the store and
  replaces axios's network adapter with a function that answers with a given
  status and body, then checks the request that would have gone out: the
  token, the casing, the one retry after a refresh.

The pattern, in short:

```tsx
const authApi = { register: vi.fn(), options: vi.fn() /* … */ }
vi.mock('@/features/auth/api/auth.api', () => ({ authApi }))

it('shows why the password was refused', async () => {
    authApi.register.mockRejectedValue(apiError(422, 'AUTH_PASSWORD_REJECTED'))
    // render the page, fill the form, submit, expect the message
})
```

Where these tests sit next to the browser suites:
[auth/in-the-code.md](./auth/in-the-code.md).

## Tests that guard the repository

Some tests check files rather than code, so a mistake fails `pnpm test`
instead of a deploy:

| Test | Fails when |
| --- | --- |
| `src/config/__tests__/env-files.test.ts` | A build value is missing from the Dockerfile's build stage or from CI's build arguments, or a runtime setting from the compose file or the start-up script's checks ([environment.md](./environment.md#adding-a-variable)) |
| `src/config/__tests__/env.schema.test.ts`, `env.test.ts` | A missing API address is accepted, a trailing slash kept, or the container's `/config.js` not preferred over the build's values |
| `src/i18n/__tests__/catalogues.test.ts` | Vietnamese and English have different keys, in the namespaces loaded with their pages (`settings`, `deletion`, `servers`) too, or `settings` is not added once its module is imported |
| `src/i18n/__tests__/page-words.test.ts` | A module uses the words of `settings`, `deletion` or `servers` (through `useTranslation`, a `ns:` prefix, an `ns` option, `<Trans ns>`, `getFixedT` or `TFunction<'ns'>`) without importing `@/i18n/<ns>` ([i18n.md](./i18n.md#words-that-load-with-their-pages)) |
| `scripts/csp.test.mjs` | The Content-Security-Policy template allows inline scripts other than by hash, hashes a CRLF checkout wrongly, or holds an address of its own |

## Coverage

`pnpm test:coverage` writes a report to `coverage/`; open
`coverage/index.html` in a browser. `main.tsx`, the test setup and type
declarations are left out.

## Resources

- [Vitest](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [jest-dom matchers](https://github.com/testing-library/jest-dom)

## What this page does not cover

These tests check that the code is correct. How much traffic the site can take
is a different question, with different tools — see
[load-testing.md](./load-testing.md), which also explains why the API, not this
repository, is the place that question really belongs.
