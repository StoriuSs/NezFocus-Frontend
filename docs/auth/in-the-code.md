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
│   └── use*.ts            the settings' mutations, one per file: useChangePassword,
│                          useLogoutEverywhere, useDeleteAccount
├── hooks/
│   └── useOAuthProviders.ts   the providers both the API and this app know
├── lib/
│   ├── paths.ts           the pages' paths; safeNext(), withFlow(), afterSignIn()
│   ├── access-token.ts    the access token, in memory
│   ├── tab-sync.ts        telling the other tabs
│   ├── sign-out-reason.ts why a session ended, from the API's data.reason
│   ├── sign-out-notice.ts which reasons the sign-in page's banner says, and the toasts for the rest
│   ├── sign-in-method.ts  the sign-in page's two ways, and the one this browser remembers
│   ├── page-state.ts      what one page hands the next
│   ├── form-problem.ts    an API refusal → a message kept as a key (every auth page)
│   ├── form-errors.ts     an API refusal → what a form shows (the settings screens); formatWait()
│   ├── username-prefill.ts    the username "complete your account" starts with
│   ├── schemas.ts         shared field rules for the settings forms
│   ├── password-rules.ts  the API's password rules, mirrored
│   ├── oauth.ts           Google: the button's address, the callback's errors
│   └── code-sent.ts       when a code was last emailed (for the timers)
├── pages/                 the eight pages
├── components/            the pieces the pages share (CodeInput among them), the delete dialog, and the
│                          route guards (ProtectedRoute, GuestOnlyRoute, IncompleteOnlyRoute, RequireRole)
└── __tests__/             unit tests
```

## The files, one by one

**The session**

| File | What it holds |
|---|---|
| [auth.store.ts](../../src/features/auth/auth.store.ts) | `useAuthStore` (zustand): `isAuthenticated`, `isComplete`, `isSigningOut`, `user`, and `initAuth`, `signIn`, `startSession`, `resumeFromCookie`, `logout`, `getToken`, `refreshToken`, `markIncomplete`, `markComplete`, `takeSignOutReason`, `peekSignOutReason`. Inside: one refresh at a time, sign out once, where a sign-out lands ([session.md](./session.md)) |
| [access-token.ts](../../src/features/auth/lib/access-token.ts) | The access token and when it expires, in a module variable: `setAccessToken`, `clearAccessToken`, `accessTokenValidFor(margin)` |
| [tab-sync.ts](../../src/features/auth/lib/tab-sync.ts) | `tellOtherTabs('signed-in' \| 'signed-out')`, `onOtherTab(listener)`, over a `BroadcastChannel` named `auth` |
| [sign-out-reason.ts](../../src/features/auth/lib/sign-out-reason.ts) | The `SignOutReason` names, and `signOutReasonOf(error)`: the API's `data.reason` → a reason |
| [sign-out-notice.ts](../../src/features/auth/lib/sign-out-notice.ts) | `sessionEndedOf(reason)`: the sign-in page's banner for a session that ended by itself or elsewhere (`SessionEnded`), or null; `isSessionEnded(reason)`; `announceSignOut(reason)`: the toast for the other reasons |

**Talking to the API**

| File | What it holds |
|---|---|
| [auth.api.ts](../../src/features/auth/api/auth.api.ts) | `authApi`: one method per route ([below](#authapi-call-by-call)). Every request that makes the API send an email carries `language: currentLanguage()` ([src/i18n/index.ts](../../src/i18n/index.ts)) |
| [types.ts](../../src/features/auth/types.ts) | The types of the answers and bodies, taken from the API's OpenAPI document (`TokenResponse`, `EmailCodeSignIn`, `AccountCompletion`, `AuthOptions`) |
| [useAuthOptions.ts](../../src/features/auth/api/useAuthOptions.ts) | `useAuthOptions()`: `GET /auth/options` once per page load. `providers` (empty while loading or when the API cannot be asked) |
| [oauth.ts](../../src/features/auth/lib/oauth.ts) | `oauthStartUrl(provider, next)` (sent to the API as `?redirect=`, its name); [useOAuthProviders()](../../src/features/auth/hooks/useOAuthProviders.ts) (the providers both the API and this app know: `google`); `oauthFailure(value)` (the callback's `?error=`) |
| [form-problem.ts](../../src/features/auth/lib/form-problem.ts) | `requestFailure(error)` → `RequestFailure` (`type`, `limit`, `passwordRules`, `offline`, `message`); `Message` (a key and its values); `useMessageText()`. Used by every auth page ([forms-and-errors.md](./forms-and-errors.md#messages-kept-as-keys)) |
| [form-errors.ts](../../src/features/auth/lib/form-errors.ts) | `authFormError(error)`, for the settings screens and the delete dialog; `RateLimitReason`; `formatWait(seconds)` for every page ([forms-and-errors.md](./forms-and-errors.md#turning-a-refusal-into-a-message)) |

**Pages and navigation**

| File | What it holds |
|---|---|
| [paths.ts](../../src/features/auth/lib/paths.ts) | `AUTH_PATHS`, `isSignInFlowPage`, `safeNext`, `withFlow` (keeps `?next` and `?invite`), `signInPath(next?, method?)` (`'password'` adds `?method=password`), `afterSignIn` ([pages-and-flows.md](./pages-and-flows.md#where-the-person-goes-afterwards-next-and-invite)) |
| [page-state.ts](../../src/features/auth/lib/page-state.ts) | `authPageState(email, { from, via })`, `useAuthPageState()` |
| [sign-in-method.ts](../../src/features/auth/lib/sign-in-method.ts) | `SignInMethod` (`'code'` or `'password'`), `METHOD_PARAM` (`?method=`), `signInMethodOf(search)` (the URL's, else the remembered one), `rememberedSignInMethod()`, `rememberSignInMethod(method)` (D-68) |
| [routes.tsx](../../src/features/auth/routes.tsx) | `authRoutes`: the seven pages outside the app, lazily loaded, each wrapped in its guard; `authAppRoutes`: `/settings` |
| [ProtectedRoute.tsx](../../src/features/auth/components/ProtectedRoute.tsx) | `ProtectedRoute` (an incomplete account goes to `/welcome`), `IncompleteOnlyRoute` (guards `/welcome`), `GuestOnlyRoute` (with `explainIfSignedIn`), and the "You're already signed in" card |
| [RequireRole.tsx](../../src/features/auth/components/RequireRole.tsx) | `RequireRole`, `useHasRole` |

**Forms**

| File | What it holds |
|---|---|
| [schemas.ts](../../src/features/auth/lib/schemas.ts) | For the settings screens, whose messages are words at once: `newPasswordCheck` (the rules, and the confirmation), `passwordFieldMessage`; `authFields(t)` (`email`, `code`) |
| [password-rules.ts](../../src/features/auth/lib/password-rules.ts) | `brokenPasswordRules(password, { email, username })`, `rejectedRules(data.rules)`, `GRID_RULES`, `FIELD_RULES`, `passwordFieldRule`, the lengths |
| [code-sent.ts](../../src/features/auth/lib/code-sent.ts) | `recordCodeSent(kind, email)`, `resendAllowedAt(kind, email)` (a moment, or null), `RESEND_AFTER_SECONDS` (60). `kind` is `'sign-in'` or `'password-reset'` |
| [useCountdown.ts](../../src/hooks/useCountdown.ts) | Whole seconds left until a moment (a `Date.now()` time), ticking each second: every "send again" and every limit on the auth pages |
| [useMinuteClock.ts](../../src/hooks/useMinuteClock.ts) | The time now, updated as each minute starts ("time there now" under the time zone on welcome) |
| [username-prefill.ts](../../src/features/auth/lib/username-prefill.ts) | `usernameFromEmail(email)` |

**Pages** (`pages/`)

| File | Path | Covered in |
|---|---|---|
| [SignIn.tsx](../../src/features/auth/pages/SignIn.tsx) | `/login` | [pages-and-flows.md](./pages-and-flows.md#sign-in) |
| [Register.tsx](../../src/features/auth/pages/Register.tsx) | `/register` | [pages-and-flows.md](./pages-and-flows.md#create-an-account) |
| [Verify.tsx](../../src/features/auth/pages/Verify.tsx) | `/verify` | [pages-and-flows.md](./pages-and-flows.md#enter-the-code) |
| [Welcome.tsx](../../src/features/auth/pages/Welcome.tsx) | `/welcome` | [pages-and-flows.md](./pages-and-flows.md#complete-your-account) |
| [ForgotPassword.tsx](../../src/features/auth/pages/ForgotPassword.tsx) | `/forgot-password` | [pages-and-flows.md](./pages-and-flows.md#forgot-and-reset-the-password) |
| [ResetPassword.tsx](../../src/features/auth/pages/ResetPassword.tsx) | `/reset-password` | same |
| [OAuthCallback.tsx](../../src/features/auth/pages/OAuthCallback.tsx) | `/auth/callback` | [pages-and-flows.md](./pages-and-flows.md#continue-with-google) |
| [Settings.tsx](../../src/features/auth/pages/Settings.tsx) | `/settings` | [account-settings.md](./account-settings.md) |

**Components** (`components/`)

| File | What it is |
|---|---|
| [AuthCard.tsx](../../src/features/auth/components/AuthCard.tsx) | `AuthCard`, the frame of every sign-in page, and `Notice`, a message in it (`info`, `success`, `error`), still used by the settings screens, the delete dialog and `/auth/callback` |
| [PasswordInput.tsx](../../src/features/auth/components/PasswordInput.tsx) | A password field with a show/hide button |
| [PasswordRules.tsx](../../src/features/auth/components/PasswordRules.tsx) | The five conditions under a new-password field (C-22): unmet, met, error |
| [CodeInput.tsx](../../src/features/auth/components/CodeInput.tsx) | Six boxes for an emailed code (C-23), on verify and reset-password; `onComplete` at the sixth digit; states `default`, `verifying`, `error`, `disabled` |
| [OAuthButtons.tsx](../../src/features/auth/components/OAuthButtons.tsx) | The "or" divider, then `children` (the sign-in page's other way), then "Continue with Google" when the API offers it; takes the page's `next`, and `disabled` (a disabled button instead of the link while the form is sent). Nothing when there is neither |
| [DeleteAccountDialog.tsx](../../src/features/auth/components/DeleteAccountDialog.tsx) | "Delete account", used on the profile page; asks for the password |

`SetPasswordSettings`, `useSignInMethods`, `sign-up-password.ts` and the
deletion-code hook are gone: every account has a password (D-130), so there
is no first password to set and no code to delete an account with.

## Outside the feature folder

| File | Its part in signing in |
|---|---|
| [src/lib/api.ts](../../src/lib/api.ts) | The axios client: adds the token, refreshes and retries once, signs out when the session is over, and calls `ApiSession.accountIncomplete()` on `403 ACCOUNT_INCOMPLETE` ([session.md](./session.md#how-the-api-client-handles-answers)) |
| [src/lib/api-error.ts](../../src/lib/api-error.ts) | Reads the API's error envelope; `getApiErrorMessage` translates a type |
| [src/lib/case-transform.ts](../../src/lib/case-transform.ts) | camelCase in the app, snake_case on the wire |
| [src/lib/safe-storage.ts](../../src/lib/safe-storage.ts) | `localStorage` and `sessionStorage` that never throw (some browsers block them) |
| [src/lib/navigation.ts](../../src/lib/navigation.ts) | `hardNavigate(url)`: the full page load a sign-out ends with |
| [src/lib/query-client.ts](../../src/lib/query-client.ts) | The React Query cache a sign-out clears |
| [src/lib/error-tracking.ts](../../src/lib/error-tracking.ts) | `setErrorTrackingUser(id)`; removes passwords, tokens and codes from error reports |
| [src/app/App.tsx](../../src/app/App.tsx) | Runs `initAuth()` once, with a spinner until it is done, then shows the sign-out toast (only the reasons `isSessionEnded` refuses: the rest are the sign-in page's banner) |
| [src/components/Banner.tsx](../../src/components/Banner.tsx) | `Banner` (C-16): why a session ended, above the sign-in card |
| [src/app/router.tsx](../../src/app/router.tsx) | Puts `authRoutes` in the AuthShell and the signed-in pages behind `ProtectedRoute`; sends `/` to `/study` or `/login`; `/terms` and `/privacy` for everyone |
| [src/app/layout/AuthShell.tsx](../../src/app/layout/AuthShell.tsx) | The frame of the pages outside the app; **Sign out** in its footer on `/welcome` only |
| [src/app/layout/app-shell/MeMenu.tsx](../../src/app/layout/app-shell/MeMenu.tsx) | Your menu, from your avatar at the foot of the rail (Profile, status, Settings, Sign out) |
| [src/features/users/](../../src/features/users/) | The profile page (with Delete account), `useProfile`, `useUsernameAvailability` and `USERNAME_PATTERN` (used by `/welcome`) |
| [src/i18n/index.ts](../../src/i18n/index.ts) | `currentLanguage()`: the language on screen, as the API names it (`vi`, `en`) |
| [src/config/env.ts](../../src/config/env.ts) | `VITE_API_URL`, the only setting sign-in uses |
| `src/i18n/locales/<language>/auth.json`, `api.json` | The pages' texts, and a sentence per API error type |
| `scripts/csp.mjs` | The Content-Security-Policy: the API's address |

## How the routes fit together

[router.tsx](../../src/app/router.tsx) builds one router with
`createBrowserRouter`:

```
AppRoot           NavigationProgress, then the page
├── /             redirect: /study when signed in, /login otherwise
├── /terms, /privacy   the legal pages, for everyone   (src/pages/Legal.tsx)
├── AuthShell     logo, an error boundary, the page, the language toggle (and Sign out on /welcome)
│   └── authRoutes     the sign-in pages and /welcome  (src/features/auth/routes.tsx)
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
{ path: '/join', element: <GuestOnlyRoute><Join /></GuestOnlyRoute> }
```

**A page for an account that has not done "complete your account"** (only
`/welcome` uses it):

```tsx
{ path: '/welcome', element: <IncompleteOnlyRoute><Welcome /></IncompleteOnlyRoute> }
```

`ProtectedRoute` lets a signed-in person through only once the account is
complete (`isComplete` in the store); an incomplete one goes to
`/welcome?next=<the page>` ([pages-and-flows.md](./pages-and-flows.md#the-gate-an-incomplete-account-sees-only-welcome)).

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
| `isComplete` | The account has done "complete your account" (D-61). `true` when signed out |
| `isSigningOut` | A sign-out is reloading the app; guards should not send anyone anywhere |
| `user` | `{ id, email, username, displayName, roles }`, or `null` |
| `initAuth()` | On page load: restore the session from the cookie, if this browser may have one. Resolves `true` when signed in |
| `signIn(email, password)` | `POST /auth/login`, then start the session. Rejects with the API's error |
| `startSession(tokens, account?)` | Take up a session another route answered with (the emailed code, reset). `account.completed` sets `isComplete` until the profile arrives |
| `resumeFromCookie()` | Take up a session from the cookie alone (after Google). Resolves `false` if there is none |
| `logout(reason?, to?)` | Sign out here, on the API and in other tabs, then reload at `to` (default: [by reason](./session.md#why-a-session-ended-every-reason)) |
| `getToken()` | A token for a request: the current one, or a fresh one when it has under a minute left |
| `refreshToken()` | A fresh token now, whatever the age of the current one. `undefined` when the session is over; rejects when the API could not be asked |
| `markIncomplete()` | The API answered `ACCOUNT_INCOMPLETE`: `isComplete` becomes `false` (only while signed in) |
| `markComplete()` | "Complete your account" is done, here or in another tab: `isComplete` becomes `true`, and the profile is fetched again |
| `takeSignOutReason(which?)` | The reason the last sign-out left, removed as it is read. With `which`, only a reason it accepts is taken; another stays for its reader (`App.tsx`'s toasts, the sign-in page's banner) |
| `peekSignOutReason()` | The same reason, left in place: read while rendering, taken in an effect |

## `authApi`, call by call

| Method | Route | Returns |
|---|---|---|
| `login(email, password)` | `POST /auth/login` | tokens |
| `sendEmailCode(email)` | `POST /auth/email-code` (with `language`) | — |
| `verifyEmailCode(email, code)` | `POST /auth/email-code/verify` | tokens and `account: { created, completed }` |
| `completeAccount({ displayName, username, password, timezone, termsAccepted })` | `POST /auth/complete-account` (with `language`; signed in) | — |
| `forgotPassword(email)` | `POST /auth/forgot-password` (with `language`) | — |
| `resetPassword(email, code, password)` | `POST /auth/reset-password` (with `language`) | tokens |
| `options()` | `GET /auth/options` | `{ providers }` |
| `refresh()` | `POST /auth/refresh` | tokens |
| `logout()` | `POST /auth/logout` (5-second timeout) | — |
| `logoutEverywhere()` | `POST /auth/logout-all` | — |
| `changePassword(currentPassword, newPassword)` | `POST /auth/change-password` (with `language`) | — |
| `deleteAccount(password)` | `POST /auth/account/delete` (with `language`) | — |

`register`, `verifyEmail`, `resendVerification`, `signInMethods`,
`sendPasswordSetCode`, `setPassword` and `sendAccountDeletionCode` are gone
with the flows that used them.

"Tokens" is `{ accessToken, tokenType, expiresIn }`. Which of these send the
bearer token and the cookie: [session.md](./session.md#which-requests-carry-what).
What every route accepts and answers: the API starter's
`docs/auth/api-reference.md`.

## What the app keeps in the browser

| Where | Key | Holds | Set by |
|---|---|---|---|
| memory | (module variable) | the access token | `access-token.ts` |
| `localStorage` | `auth:session` | `"1"`: this browser may be signed in | the store |
| `localStorage` | `auth:sign-in-method` | `code` or `password`: the way of the last sign-in that worked, which `/login` opens on (D-68) | sign-in (password), verify (code) |
| `sessionStorage` | `auth:sign-out-reason` | the reason of the last sign-out, until shown (a toast, or the sign-in page's banner) | the store; a sign-out without a reason removes it |
| `sessionStorage` | `auth:code-sent:sign-in:<address>`, `auth:code-sent:password-reset:<address>` | when the last code was sent | register, sign-in (by code), verify (send again), forgot-password, reset-password (send again) |
| React Query | `['auth', 'options']` | the API's options, for the page load | `useAuthOptions` |
| React Query | `['users', 'profile']` | the profile from `/users/me` | the store at sign-in, `useProfile` |

The refresh cookie is not in this list: the app cannot see it.

## Tests

**Unit tests** (Vitest; `pnpm test` runs them all, `pnpm exec vitest run src/features/auth` only these):

| File | Covers |
|---|---|
| `src/features/auth/__tests__/auth.store.test.ts` | The access token in memory only, never in `localStorage` or `sessionStorage`; a refused refresh ends the session with its reason; an ended session lands on sign-in, by password when the password was changed, and comes back afterwards; each reader (`App.tsx`'s toasts, the sign-in banner) takes only its kind of reason; signing out clears the token and the cached data, tells the other tabs and never lands off-site; a sign-out in another tab followed here; `isComplete` from the profile, or from the code's answer when the profile does not arrive; `markIncomplete` and `markComplete`, and `ACCOUNT_INCOMPLETE` ignored once signed out |
| `src/lib/__tests__/api.test.ts` | The client: the bearer token, refresh and retry once (never twice), sign-out only when the session really ended (not on a 503 or an ordinary 403), `403 ACCOUNT_INCOMPLETE` opens "complete your account" and keeps the session, the auth routes left alone |
| `src/features/auth/__tests__/pages.test.tsx` | Sign in (S-AUTH-03): opens on the code and sends one, keeping `next` and `invite`; the code way's own words for an empty email; switching to the password and back keeps the email, the URL keeps the way; a password sign-in goes to `next` and is remembered (D-68), and the page opens on the way remembered; an incomplete account to `/welcome`; one message for a wrong password or an unknown address, the password asked again; the address's limits (another address may go on), the network's whatever the address, the code emails' pointing to the password; the banner for a session that ended, said once, on the password when it was changed elsewhere, and a session closed for safety; the email handed to "forgot password". Forgot and reset (S-AUTH-04): the code sent with the address out of the URL, Back to sign in by password, no address goes to step one, the hedged words and nothing sent at six digits, the new password kept when only the code was wrong, the password checked before sending, sending again in the same hedged words, the network's wrong-code limit with the password kept; `/register`: the code sent and `next` / `invite` kept with the address out of the URL, no second email within the minute, the address's and the network's limits, a message that follows the language switch; `/verify`: no address goes to `/register`, sent at the sixth digit, a pasted code, "you already have an account", a wrong code, a dead code and "Send a new code", too many wrong codes, the countdown from the real send time, a refused resend, Back, "Sign in with password", a code that signs in remembered as the way (D-68); Google: never off-site, an incomplete account to `/welcome` with `via: 'google'` |
| `src/features/auth/__tests__/welcome.test.tsx` | "Complete your account": the prefilled username, a taken prefill emptied without an error, a name typed that is taken, every wrong field marked and the first focused, the username refused as the password (D-66), the full request then `next`, picking a time zone by searching, `USERNAME_CONFLICT` on submit, another tab finishing first, Google's name filled in |
| `src/features/auth/__tests__/form-problem.test.ts` | `requestFailure`: limits as a moment and a reason, offline, a 5xx, the API's type, the refused password rules; a message words itself again after the language changes; `formatWait` in seconds, minutes and hours |
| `src/features/auth/__tests__/username-prefill.test.ts` | The username made from the email |
| `src/features/auth/__tests__/delete-account.test.tsx` | The delete dialog: nothing happens before the password |
| `src/features/auth/__tests__/auth-api.test.ts` | A code asked for in the language on screen, without a bearer token; signing in with the code alone; completing the account with the bearer token and the language; deleting with the password |
| `src/features/auth/__tests__/paths.test.ts` | `safeNext` never leaves the site, nor returns to a sign-in page; `withFlow` carries `next` and `invite` only; `afterSignIn`; `signInPath`, with `?method=password` when asked |
| `src/features/auth/__tests__/sign-out-notice.test.ts` | A session that ended by itself or elsewhere left to the sign-in page's banner; an expiry and a session ended from another device worded alike; toasts for what the person did, and a disabled account as an error |
| `src/features/auth/__tests__/ProtectedRoute.test.tsx` | The guards: the whole address kept for after sign-in, no redirect to another site; an incomplete account sent to `/welcome` from the app and from sign-in, keeping `next` and `invite`; `/welcome` for a visitor and for a complete account |
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
| `e2e/account.spec.ts` | Create an account with the emailed code, then complete it (the time zone searched as "tokyo"); a reload keeps the session; a deep link after sign-in; reset a forgotten password (the old one refused after); delete the account | the API (`E2E_API_URL`, default `http://localhost:8888/api/v1`) and its Mailpit (`E2E_MAILPIT_URL`, default `http://localhost:8025`) |
| `e2e/oauth.spec.ts` | The Google button and the API's redirect to Google (PKCE, the state cookie) | the API with Google set up; skipped otherwise |

The app is at `E2E_BASE_URL` (default `http://localhost:3001`). Signing in
*at* Google is a manual test: a test has no Google
account. To do it by hand, start both apps with Google set up on the API,
click "Continue with Google" on `/login?next=/profile`, and check you land
on `/welcome` (a new account; complete it) and then on `/profile`, signed in.

## Adding an auth page

Say, a page where a signed-out person confirms a new email address.

1. **The path:** add it to `AUTH_PATHS` in `lib/paths.ts`. Every page there except
   `/settings` counts as a sign-in page: `safeNext` never returns to it,
   and a session that ends on it lands on `/login` without a `?next=`.
2. **The page:** a file in `pages/`, with a default export. Build it like
   `Register.tsx`: `AuthCard` for the frame, a react-hook-form form with a zod
   schema whose messages are keys (`'auth:validation.emailRequired'`),
   `FormField` for each field, `requestFailure()` on a refusal and
   `FormMessage` above the button, every message put into words with
   `useMessageText()` ([forms-and-errors.md](./forms-and-errors.md#messages-kept-as-keys)).
3. **The API call:** a method in `authApi` ([below](#calling-a-new-auth-route)).
4. **The route:** in `routes.tsx`, `lazy(() => import(...))`, wrapped in its
   guard: `guestOnly(...)` for visitors, `guestOnlyExplained(...)` if emails
   link to it, `<ProtectedRoute>` for signed-in people with a complete
   account, `<IncompleteOnlyRoute>` for an incomplete one, or nothing (like
   `/auth/callback`).
5. **Where to go next:** carry `?next=` and `?invite=` with `withFlow()`,
   finish with `navigate(afterSignIn(account, search), { replace: true })` if
   the page signs in (`safeNext(next)` otherwise), and hand the address to the
   next page with `authPageState()`, never in the URL.
6. **If it signs in:** call `startSession(tokens, account)` (tokens in the
   answer) or `resumeFromCookie()` (only a cookie).
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
