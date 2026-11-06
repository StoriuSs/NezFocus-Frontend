# Sign-in in the code

This page is the map of the sign-in code: which file does what, how the routes
and guards fit together, what the store offers, what the app keeps in the
browser, which tests cover what, and how to add a page. Read it before
changing the code, or to find where something lives.

- [The folder](#the-folder)
- [The files, one by one](#the-files-one-by-one)
- [Outside the feature folder](#outside-the-feature-folder)
- [How the routes fit together](#how-the-routes-fit-together)
- [Protecting a page, or part of one](#protecting-a-page-or-part-of-one)
- [The store](#the-store)
- [`authApi`, call by call](#authapi-call-by-call)
- [What the app keeps in the browser](#what-the-app-keeps-in-the-browser)
- [Tests](#tests)
- [Adding an auth page](#adding-an-auth-page)
- [Calling a new auth route](#calling-a-new-auth-route)

## The folder

Everything about signing in is in `src/features/auth/`, except the API client
(`src/lib/api.ts`) and the app shell that starts the session (`src/app/`).

```
src/features/auth/
├── index.ts               what other features may import (store, ProtectedRoute, RequireRole, DeleteAccountDialog)
├── auth.store.ts          the session: who is signed in, sign in, sign out, tokens
├── types.ts               the API's auth response shapes
├── routes.tsx             the routes
├── api/
│   ├── auth.api.ts        every call to the API's /auth routes
│   ├── keys.ts            the auth query keys (authKeys)
│   ├── useAuthOptions.ts  GET /auth/options: Google on?
│   ├── useSignInMethods.ts    GET /auth/sign-in-methods
│   └── use*.ts            the settings' mutations, one per file: useChangePassword,
│                          useLogoutEverywhere, useSendPasswordSetCode, useSetPassword,
│                          useSendAccountDeletionCode, useDeleteAccount
├── hooks/
│   ├── useOAuthProviders.ts   the providers both the API and this app know
│   └── useResendCooldown.ts   the countdown on "send another code"
├── lib/
│   ├── paths.ts           the pages' paths, safeRedirect()
│   ├── access-token.ts    the access token, in memory
│   ├── tab-sync.ts        telling the other tabs
│   ├── sign-out-reason.ts why a session ended, from the API's data.reason
│   ├── sign-out-notice.ts the message for each reason
│   ├── page-state.ts      what one page hands the next
│   ├── sign-up-password.ts    the sign-up password, in memory, for the confirm page
│   ├── form-errors.ts     an API refusal → what a form shows
│   ├── schemas.ts         shared field rules for the forms
│   ├── password-rules.ts  the API's password rules, mirrored
│   ├── oauth.ts           Google: the button's address, the callback's errors
│   └── code-sent.ts       when a code was last emailed (for the timers)
├── pages/                 the seven pages
├── components/            the pieces the pages share, the settings sections, and the route guards
│                          (ProtectedRoute, GuestOnlyRoute, RequireRole)
└── __tests__/             unit tests
```

## The files, one by one

**The session**

| File | What it holds |
|---|---|
| [auth.store.ts](../../src/features/auth/auth.store.ts) | `useAuthStore` (zustand): `isAuthenticated`, `isSigningOut`, `user`, and `initAuth`, `signIn`, `startSession`, `resumeFromCookie`, `logout`, `getToken`, `refreshToken`, `takeSignOutReason`. Inside: one refresh at a time, sign out once, where a sign-out lands ([session.md](./session.md)) |
| [access-token.ts](../../src/features/auth/lib/access-token.ts) | The access token and when it expires, in a module variable: `setAccessToken`, `clearAccessToken`, `accessTokenValidFor(margin)` |
| [tab-sync.ts](../../src/features/auth/lib/tab-sync.ts) | `tellOtherTabs('signed-in' \| 'signed-out')`, `onOtherTab(listener)`, over a `BroadcastChannel` named `auth` |
| [sign-out-reason.ts](../../src/features/auth/lib/sign-out-reason.ts) | The `SignOutReason` names, and `signOutReasonOf(error)`: the API's `data.reason` → a reason |
| [sign-out-notice.ts](../../src/features/auth/lib/sign-out-notice.ts) | `announceSignOut(reason)`: the toast for each reason |

**Talking to the API**

| File | What it holds |
|---|---|
| [auth.api.ts](../../src/features/auth/api/auth.api.ts) | `authApi`: one method per route ([below](#authapi-call-by-call)) |
| [types.ts](../../src/features/auth/types.ts) | The types of the answers, taken from the API's OpenAPI document (`TokenResponse`, `AuthOptions`, `SignInMethods`) |
| [useAuthOptions.ts](../../src/features/auth/api/useAuthOptions.ts) | `useAuthOptions()`: `GET /auth/options` once per page load. `providers` (empty while loading or when the API cannot be asked) |
| [oauth.ts](../../src/features/auth/lib/oauth.ts) | `oauthStartUrl(provider, redirect)`; [useOAuthProviders()](../../src/features/auth/hooks/useOAuthProviders.ts) (the providers both the API and this app know: `google`); `oauthFailure(value)` (the callback's `?error=`) |
| [form-errors.ts](../../src/features/auth/lib/form-errors.ts) | `authFormError(error)`, `formatWait(seconds)` ([forms-and-errors.md](./forms-and-errors.md#turning-a-refusal-into-a-message)) |

**Pages and navigation**

| File | What it holds |
|---|---|
| [paths.ts](../../src/features/auth/lib/paths.ts) | `AUTH_PATHS`, `isSignInFlowPage`, `safeRedirect`, `withRedirect`, `signInPath` |
| [page-state.ts](../../src/features/auth/lib/page-state.ts) | `authPageState(email, notice)`, `useAuthPageState()` |
| [sign-up-password.ts](../../src/features/auth/lib/sign-up-password.ts) | `holdSignUpPassword(email, password)`, `heldSignUpPassword(email)`, `forgetSignUpPassword()` |
| [routes.tsx](../../src/features/auth/routes.tsx) | `authRoutes`: the seven pages, lazily loaded, each wrapped in its guard |
| [ProtectedRoute.tsx](../../src/features/auth/components/ProtectedRoute.tsx) | `ProtectedRoute`, `GuestOnlyRoute` (with `explainIfSignedIn`), and the "You're already signed in" card |
| [RequireRole.tsx](../../src/features/auth/components/RequireRole.tsx) | `RequireRole`, `useHasRole` |

**Forms**

| File | What it holds |
|---|---|
| [schemas.ts](../../src/features/auth/lib/schemas.ts) | `authFields(t)`: `email`, `code` (6 digits); `newPasswordCheck` (the rules, and the confirmation) |
| [password-rules.ts](../../src/features/auth/lib/password-rules.ts) | `brokenPasswordRules(password, email)`, `rejectedRules(data.rules)`, `CHECKLIST_RULES`, the lengths |
| [code-sent.ts](../../src/features/auth/lib/code-sent.ts) | `recordCodeSent(kind, email)`, `secondsUntilResend(kind, email)`, `RESEND_AFTER_SECONDS` (60) |
| [useResendCooldown.ts](../../src/features/auth/hooks/useResendCooldown.ts) | A seconds countdown: `remaining`, `start(seconds)` |

**Pages** (`pages/`)

| File | Path | Covered in |
|---|---|---|
| [SignIn.tsx](../../src/features/auth/pages/SignIn.tsx) | `/sign-in` | [pages-and-flows.md](./pages-and-flows.md#sign-in) |
| [SignUp.tsx](../../src/features/auth/pages/SignUp.tsx) | `/sign-up` | [pages-and-flows.md](./pages-and-flows.md#sign-up) |
| [VerifyEmail.tsx](../../src/features/auth/pages/VerifyEmail.tsx) | `/verify-email` | [pages-and-flows.md](./pages-and-flows.md#confirm-the-email-address) |
| [ForgotPassword.tsx](../../src/features/auth/pages/ForgotPassword.tsx) | `/forgot-password` | [pages-and-flows.md](./pages-and-flows.md#forgot-and-reset-the-password) |
| [ResetPassword.tsx](../../src/features/auth/pages/ResetPassword.tsx) | `/reset-password` | same |
| [OAuthCallback.tsx](../../src/features/auth/pages/OAuthCallback.tsx) | `/auth/callback` | [pages-and-flows.md](./pages-and-flows.md#continue-with-google) |
| [Settings.tsx](../../src/features/auth/pages/Settings.tsx) | `/settings` | [account-settings.md](./account-settings.md) |

**Components** (`components/`)

| File | What it is |
|---|---|
| [AuthCard.tsx](../../src/features/auth/components/AuthCard.tsx) | `AuthCard`, the frame of every sign-in page, and `Notice`, a message in it (`info`, `success`, `error`) |
| [PasswordInput.tsx](../../src/features/auth/components/PasswordInput.tsx) | A password field with a show/hide button |
| [PasswordChecklist.tsx](../../src/features/auth/components/PasswordChecklist.tsx) | The rules, ticked off as they are met, and the API's refusals |
| [SentTo.tsx](../../src/features/auth/components/SentTo.tsx) | The address a code went to, as text, with "Use a different address" |
| [OAuthButtons.tsx](../../src/features/auth/components/OAuthButtons.tsx) | "Continue with Google", when the API offers it |
| [SetPasswordSettings.tsx](../../src/features/auth/components/SetPasswordSettings.tsx) | "Set a password", for an account made with Google |
| [DeleteAccountDialog.tsx](../../src/features/auth/components/DeleteAccountDialog.tsx) | "Delete account", used on the profile page |

## Outside the feature folder

| File | Its part in signing in |
|---|---|
| [src/lib/api.ts](../../src/lib/api.ts) | The axios client: adds the token, refreshes and retries once, signs out when the session is over ([session.md](./session.md#how-the-api-client-handles-answers)) |
| [src/lib/api-error.ts](../../src/lib/api-error.ts) | Reads the API's error envelope; `getApiErrorMessage` translates a type |
| [src/lib/case-transform.ts](../../src/lib/case-transform.ts) | camelCase in the app, snake_case on the wire |
| [src/lib/safe-storage.ts](../../src/lib/safe-storage.ts) | `localStorage` and `sessionStorage` that never throw (some browsers block them) |
| [src/lib/navigation.ts](../../src/lib/navigation.ts) | `hardNavigate(url)`: the full page load a sign-out ends with |
| [src/lib/query-client.ts](../../src/lib/query-client.ts) | The React Query cache a sign-out clears |
| [src/lib/error-tracking.ts](../../src/lib/error-tracking.ts) | `setErrorTrackingUser(id)`; removes passwords, tokens and codes from error reports |
| [src/app/App.tsx](../../src/app/App.tsx) | Runs `initAuth()` once, with a spinner until it is done, then shows the sign-out message |
| [src/app/router.tsx](../../src/app/router.tsx) | Puts `authRoutes` in the AuthShell and the signed-in pages behind `ProtectedRoute`; sends `/` to `/study` or `/sign-in`; renders the username prompt on every page |
| [src/app/layout/app-shell/MeMenu.tsx](../../src/app/layout/app-shell/MeMenu.tsx) | Your menu, from your avatar at the foot of the rail (Profile, status, Settings, Sign out) |
| [src/features/users/](../../src/features/users/) | The profile page (with Delete account), the username prompt ([../username-prompt.md](../username-prompt.md)), `useProfile` |
| [src/config/env.ts](../../src/config/env.ts) | `VITE_API_URL`, the only setting sign-in uses |
| `src/i18n/locales/<language>/auth.json`, `api.json` | The pages' texts, and a sentence per API error type |
| `scripts/csp.mjs` | The Content-Security-Policy: the API's address |

## How the routes fit together

[router.tsx](../../src/app/router.tsx) builds one router with
`createBrowserRouter`:

```
AppRoot           NavigationProgress, UsernamePromptWrapper, then the page
├── /             redirect: /study when signed in, /sign-in otherwise
├── AuthShell     logo, an error boundary, the page, the language toggle
│   └── authRoutes     the sign-in pages             (src/features/auth/routes.tsx)
├── ProtectedRoute + AppShell   rail, list column, an error boundary, the page
│   ├── /study                                      (src/pages/Study.tsx)
│   ├── /channels/:serverId/:channelId?             (mock, until channels exist)
│   ├── authAppRoutes  /settings                    (src/features/auth/routes.tsx)
│   └── usersRoutes    /profile                     (src/features/users/routes.tsx)
└── *             NotFound
```

Each route in the AppShell has `handle: { column }`, which picks the list
column next to the rail.

[App.tsx](../../src/app/App.tsx) shows a spinner until `initAuth()` has
answered, then renders the router. So every guard below already knows whether
the person is signed in on the first render.

## Protecting a page, or part of one

**A page in the app.** Every route in the AppShell's `children` is already
behind its `ProtectedRoute`: export a plain `RouteObject[]` (as
`src/features/users/routes.tsx` does) and add it there in `router.tsx`.

**A group of signed-in pages outside the AppShell:**

```tsx
import { Outlet, type RouteObject } from 'react-router-dom'
import { ProtectedRoute } from '@/features/auth'

export const billingRoutes: RouteObject[] = [
    {
        element: (
            <ProtectedRoute>
                <Outlet />
            </ProtectedRoute>
        ),
        children: [
            { path: '/billing', element: <Billing /> },
            { path: '/billing/invoices', element: <Invoices /> }
        ]
    }
]
```

Then add `...billingRoutes` to `AppRoot`'s children in `router.tsx`. A route
listed *next to* the protected entry instead of in its `children` would be
public.

**One signed-in page:**

```tsx
{ path: '/billing', element: <ProtectedRoute><Billing /></ProtectedRoute> }
```

**A visitor-only page** (the sign-in pages use it):

```tsx
{ path: '/welcome', element: <GuestOnlyRoute><Welcome /></GuestOnlyRoute> }
```

**Part of a page, by role:**

```tsx
import { RequireRole, useHasRole } from '@/features/auth'

<RequireRole role='admin'>
    <DeleteUserButton />
</RequireRole>

<RequireRole role='admin' fallback={<p>Admins only.</p>}>...</RequireRole>

const isAdmin = useHasRole('admin')
```

**Who is signed in:**

```tsx
import { useAuthStore } from '@/features/auth/auth.store'

const user = useAuthStore((state) => state.user) // { id, email?, username?, displayName?, roles } or null
const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
```

For the full profile (avatar, and everything `GET /users/me` returns), use
`useProfile()` from `src/features/users/api/useProfile.ts`; it reads the
cache the sign-in already filled.

**`RequireRole` only hides things.** Anything in the browser can be changed
by the person using it. The API must check the role itself (`@Roles()` on its
route). Roles come from the API's `/users/me`; the first administrator is
made on the API with `pnpm user:promote` (the API starter's
`docs/auth/accounts.md`).

## The store

`useAuthStore` in [auth.store.ts](../../src/features/auth/auth.store.ts).
Read state with a selector (`useAuthStore((s) => s.user)`); outside React,
`useAuthStore.getState()`.

| Member | What it is |
|---|---|
| `isAuthenticated` | A session is in hand |
| `isSigningOut` | A sign-out is reloading the app; guards should not send anyone anywhere |
| `user` | `{ id, email, username, displayName, roles }`, or `null` |
| `initAuth()` | On page load: restore the session from the cookie, if this browser may have one. Resolves `true` when signed in |
| `signIn(email, password)` | `POST /auth/login`, then start the session. Rejects with the API's error |
| `startSession(tokens)` | Take up a session another route answered with (confirm, reset) |
| `resumeFromCookie()` | Take up a session from the cookie alone (after Google). Resolves `false` if there is none |
| `logout(reason?, to?)` | Sign out here, on the API and in other tabs, then reload at `to` (default: [by reason](./session.md#why-a-session-ended-every-reason)) |
| `getToken()` | A token for a request: the current one, or a fresh one when it has under a minute left |
| `refreshToken()` | A fresh token now, whatever the age of the current one. `undefined` when the session is over; rejects when the API could not be asked |
| `takeSignOutReason()` | The reason the last sign-out left, removed as it is read |

## `authApi`, call by call

| Method | Route | Returns |
|---|---|---|
| `login(email, password)` | `POST /auth/login` | tokens |
| `register(email, password)` | `POST /auth/register` | — |
| `verifyEmail(email, code, password)` | `POST /auth/verify-email` | tokens |
| `resendVerification(email)` | `POST /auth/resend-verification` | — |
| `forgotPassword(email)` | `POST /auth/forgot-password` | — |
| `resetPassword(email, code, password)` | `POST /auth/reset-password` | tokens |
| `options()` | `GET /auth/options` | `{ providers }` |
| `refresh()` | `POST /auth/refresh` | tokens |
| `logout()` | `POST /auth/logout` (5-second timeout) | — |
| `logoutEverywhere()` | `POST /auth/logout-all` | — |
| `changePassword(currentPassword, newPassword)` | `POST /auth/change-password` | — |
| `signInMethods()` | `GET /auth/sign-in-methods` | `{ password, providers }` |
| `sendPasswordSetCode()` | `POST /auth/password/code` | — |
| `setPassword(code, newPassword)` | `POST /auth/password` | — |
| `sendAccountDeletionCode()` | `POST /auth/account/delete-code` | — |
| `deleteAccount({ password?, code? })` | `POST /auth/account/delete` | — |

"Tokens" is `{ accessToken, tokenType, expiresIn }`. Which of these send the
bearer token and the cookie: [session.md](./session.md#which-requests-carry-what).
What every route accepts and answers: the API starter's
`docs/auth/api-reference.md`.

## What the app keeps in the browser

| Where | Key | Holds | Set by |
|---|---|---|---|
| memory | (module variable) | the access token | `access-token.ts` |
| `localStorage` | `auth:session` | `"1"`: this browser may be signed in | the store |
| `sessionStorage` | `auth:sign-out-reason` | the reason of the last sign-out, until shown | the store |
| `sessionStorage` | `auth:code-sent:email-verify:<address>`, `auth:code-sent:password-reset:<address>` | when the last code was sent | sign-up, confirm, forgot-password |
| `sessionStorage` | `auth:password-set-code-sent` | `{ email, at }` | Set a password |
| React Query | `['auth', 'options']` | the API's options, for the page load | `useAuthOptions` |
| React Query | `['auth', 'sign-in-methods']` | `{ password, providers }` | Settings, the delete dialog |
| React Query | `['users', 'profile']` | the profile from `/users/me` | the store at sign-in, `useProfile` |

The refresh cookie is not in this list: the app cannot see it.

## Tests

**Unit tests** (Vitest; `pnpm test` runs them all, `pnpm exec vitest run src/features/auth` only these):

| File | Covers |
|---|---|
| `src/features/auth/__tests__/auth.store.test.ts` | The access token in memory only, never in `localStorage` or `sessionStorage`; a refused refresh ends the session with its reason; signing out clears the token and the cached data, tells the other tabs and never lands off-site; a sign-out in another tab followed here |
| `src/lib/__tests__/api.test.ts` | The client: the bearer token, refresh and retry once (never twice), sign-out only when the session really ended (not on a 503 or an ordinary 403), the auth routes left alone |
| `src/features/auth/__tests__/pages.test.tsx` | An unconfirmed address led to the confirm page, which sends the held password with the code; the password held in memory, never in history, and `?redirect=` kept through sign-up and confirm; the password asked for after a reload; the wrong code-or-password message; the wait after too many sign-ins; Google's return address never off-site |
| `src/features/auth/__tests__/delete-account.test.tsx` | The delete dialog: nothing happens before the password |
| `src/features/auth/__tests__/auth-api.test.ts` | Confirming an address sends the password chosen at sign-up |
| `src/features/auth/__tests__/paths.test.ts` | `safeRedirect` never leaves the site |
| `src/features/auth/__tests__/ProtectedRoute.test.tsx` | Both guards: the whole address kept for after sign-in, no redirect to another site |
| `src/features/auth/__tests__/RequireRole.test.tsx` | Children for the role, the fallback otherwise |

How they are built: `pages.test.tsx` replaces `authApi` and the store with
stand-ins (`vi.mock`) and renders `authRoutes` in a memory router.
`auth.store.test.ts`
replaces `authApi`, the query client, `hardNavigate`, error tracking and
tab-sync. `api.test.ts` replaces the store. None of them needs the API. If
your shell sets `NODE_ENV=production`, unset it before running them: React's
test helpers need the development build.

**End-to-end tests** (Playwright, `pnpm test:e2e`; [../e2e-testing.md](../e2e-testing.md)):

| Suite | Covers | Needs |
|---|---|---|
| `e2e/account.spec.ts` | Sign up, confirm, choose a username; a reload keeps the session; a deep link after sign-in; reset a forgotten password (the old one refused after); delete the account | the API (`E2E_API_URL`, default `http://localhost:8888/api/v1`) and its Mailpit (`E2E_MAILPIT_URL`, default `http://localhost:8025`) |
| `e2e/oauth.spec.ts` | The Google button and the API's redirect to Google (PKCE, the state cookie) | the API with Google set up; skipped otherwise |

The app is at `E2E_BASE_URL` (default `http://localhost:3001`). Signing in
*at* Google is a manual test: a test has no Google
account. To do it by hand, start both apps with Google set up on the API,
click "Continue with Google" on `/sign-in?redirect=/profile`, and check you
land on `/profile`, signed in.

## Adding an auth page

Say, a page where a signed-out person confirms a new email address.

1. **The path:** add it to `AUTH_PATHS` in `lib/paths.ts`. Every page there except
   `/settings` counts as a sign-in page: `safeRedirect` never returns to it,
   and a sign-out from it lands on the home page.
2. **The page:** a file in `pages/`, with a default export. Build it like the
   others: `AuthCard` for the frame, a react-hook-form form with a zod schema
   (reuse `authFields(t)`), `FormField` for each field, and `authFormError()`
   on a refusal ([forms-and-errors.md](./forms-and-errors.md#how-an-auth-form-is-built)).
3. **The API call:** a method in `authApi` ([below](#calling-a-new-auth-route)).
4. **The route:** in `routes.tsx`, `lazy(() => import(...))`, wrapped in its
   guard: `guestOnly(...)` for visitors, `guestOnlyExplained(...)` if emails
   link to it, `<ProtectedRoute>` for signed-in people, or nothing (like
   `/auth/callback`).
5. **Where to go next:** carry `?redirect=` with `withRedirect()`, finish with
   `navigate(safeRedirect(redirect), { replace: true })`, and hand the address
   to the next page with `authPageState()`, never in the URL.
6. **If it signs in:** call `startSession(tokens)` (tokens in the answer) or
   `resumeFromCookie()` (only a cookie).
7. **The texts:** a new block in `auth.json`, in English and Vietnamese (the
   catalogue test fails until both have the same keys).
8. **Tests:** add the page to the list `pages.test.tsx` loads at the top, and a
   `describe` block for what it sends, where it goes, and each refusal.

## Calling a new auth route

In `auth.api.ts`:

```ts
/** Public route: no bearer token; its 401s are answers. */
async confirmNewEmail(code: string): Promise<void> {
    await api.post('/auth/email/confirm', { code }, auth) // auth = { skipAuth: true, withCredentials: true }
},

/** Signed-in route: an ordinary request; the client adds the token. */
async listSessions(): Promise<Session[]> {
    const response = await api.get<ApiEnvelope<Session[]>>('/auth/sessions')
    return response.data.data
},
```

- Write keys in camelCase; the client sends snake_case.
- Use `auth` (skip the token, send the cookie) only for routes the API marks
  public. A signed-in route that sets or clears the cookie needs
  `{ withCredentials: true }` as well.
- Take the types from the API's OpenAPI document (`ApiModel<'...Dto'>`,
  [../api-types.md](../api-types.md)); run `pnpm api:types` after the API
  changes.
- Give every new error type a sentence in `api.json`
  ([forms-and-errors.md](./forms-and-errors.md#messages-and-languages)).
