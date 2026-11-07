# The auth pages and flows

This page walks through every sign-in page of the web app: its address, who
may open it, what it shows, what it asks the API, and where it goes next. Read
it to understand what happens when someone clicks, or before changing a page.
For the session behind the pages, see [session.md](./session.md); for the
messages a form shows, [forms-and-errors.md](./forms-and-errors.md).

- [All the pages at a glance](#all-the-pages-at-a-glance)
- [Where the person goes afterwards: `?next=` and `?invite=`](#where-the-person-goes-afterwards-next-and-invite)
- [What one page hands the next](#what-one-page-hands-the-next)
- [Create an account](#create-an-account)
- [Enter the code](#enter-the-code)
- [Complete your account](#complete-your-account)
- [The gate: an incomplete account sees only `/welcome`](#the-gate-an-incomplete-account-sees-only-welcome)
- [Sign in](#sign-in)
- [Forgot and reset the password](#forgot-and-reset-the-password)
- [Continue with Google](#continue-with-google)
- [Already signed in: what visitor pages do](#already-signed-in-what-visitor-pages-do)
- [Pages for signed-in people](#pages-for-signed-in-people)
- [The terms and the privacy policy](#the-terms-and-the-privacy-policy)
- [Your menu](#your-menu)

## All the pages at a glance

The routes are in [routes.tsx](../../src/features/auth/routes.tsx), the paths
in [paths.ts](../../src/features/auth/lib/paths.ts) (`AUTH_PATHS`). Each page is
loaded only when first opened (`lazy`).

| Path | Who may open it | What it does | Asks the API | Goes next |
|---|---|---|---|---|
| `/register` | visitors | Only the email; "Continue with Google" | `POST /auth/email-code` | always `/verify` |
| `/verify` | visitors | The 6-digit code from the email. The right code signs in, to the address's account or to one made just now | `POST /auth/email-code/verify`, `POST /auth/email-code` (send again) | `/welcome` for an incomplete account, else `?next=` or home |
| `/welcome` | signed in, account not yet complete | "Complete your account": display name, username, password, time zone, the terms | `POST /auth/complete-account` | `?next=` or home |
| `/login` | visitors | An emailed one-time code by default, or the password (`?method=password`); "Continue with Google". Says why a session ended | `POST /auth/email-code` (code), `POST /auth/login` (password) | the code: `/verify`. The password: `/welcome` for an incomplete account, else `?next=` or home |
| `/forgot-password` | visitors (a signed-in person sees a card) | Asks for a code to choose a new password | `POST /auth/forgot-password` | always the reset page |
| `/reset-password` | visitors (a signed-in person sees a card) | The code and a new password. Signs in, and signs out every other device | `POST /auth/reset-password`, `POST /auth/forgot-password` (send again) | as `/login` by password |
| `/auth/callback` | anyone | Where the API sends the browser back after Google | `POST /auth/refresh` | as `/login`; or says why it failed |
| `/settings` | signed in, complete | Password, sign out everywhere ([account-settings.md](./account-settings.md)) | several | stays |
| `/profile` | signed in, complete | The profile, and "Delete account" ([account-settings.md](./account-settings.md#delete-the-account)) | several | stays |
| `/terms`, `/privacy` | anyone | The Terms of Service and the Privacy Policy ([below](#the-terms-and-the-privacy-policy)) | nothing | stays |

"Visitors" means the page is wrapped in `GuestOnlyRoute`: a signed-in person
is sent on ([below](#already-signed-in-what-visitor-pages-do)). "Signed in,
complete" means `ProtectedRoute`: a visitor is sent to sign in and brought
back afterwards, an incomplete account to `/welcome`
([below](#the-gate-an-incomplete-account-sees-only-welcome)). `/welcome` has
its own guard, `IncompleteOnlyRoute`.

The pages before `/welcome` used to be `/sign-in`, `/sign-up` and
`/verify-email`; they were renamed to the product spec's addresses. The old
sign-up, which asked for a password and then confirmed the address, is gone
([Create an account](#create-an-account) is what replaced it).

## Where the person goes afterwards: `?next=` and `?invite=`

Someone who opens `/profile` while signed out should land on `/profile` once
signed in, even if they first create an account and complete it. The page
they were heading for travels in the address as `?next=`; an invite link
waiting for them travels as `?invite=`:

1. `ProtectedRoute` sends them to `/login?next=%2Fprofile` (`signInPath()`).
2. Every link between auth pages keeps `next` and `invite`, and nothing else
   (`withFlow(path, search)` in `paths.ts`): login → verify → welcome,
   login → register → verify → welcome, login → forgot → reset. The sign-in
   page's own `?method=` stays on it.
3. "Continue with Google" hands `next` to the API, which hands it back on
   `/auth/callback`. The API's own name for it is `redirect`:
   `oauthStartUrl(provider, next)` in [oauth.ts](../../src/features/auth/lib/oauth.ts)
   sends `?redirect=`, and the callback page reads `?redirect=` back.
4. Once signed in, the page goes to `afterSignIn(account, search)`, with
   `replace`, so the browser's Back button does not return to a sign-in page.
   An account that has not done "complete your account" goes to `/welcome`,
   keeping `next` and `invite`; any other goes to `safeNext(next)`. Without a
   `?next=`, that is "home": the Study page, `/study`.

**`safeNext()` only allows a page on this site.** It returns the path
(with its query and `#` part) when the address resolves to this app's own
origin, and `/study` otherwise. It also returns `/study` for the sign-in pages
themselves (`isSignInFlowPage`): after signing in, `/login` is a dead end. Why:
without the check, a link to `/login?next=https://evil.example` would send
someone to a look-alike site straight after they signed in, where a "please
sign in again" page would collect their password. The API checks the address
it gets from Google's round trip in the same spirit.

## What one page hands the next

Pages pass the address typed so far, and what just happened, in the router's
**navigation state** (an invisible note attached to the history entry), never
in the address bar. [page-state.ts](../../src/features/auth/lib/page-state.ts)
holds the shapes (`authPageState(email, extra)`, `useAuthPageState()`):

| State | Set by | Read by | Meaning |
|---|---|---|---|
| `email` | register, login (sending a code, "Forgot password?", "Create an account", switching between the two ways), forgot-password (moving on, and Back), verify's Back and "Sign in with password", reset-password's Back | the next page | Fill the address in, or show it as text |
| `from: 'register' \| 'login'` | the page that sent the code | verify | Where Back returns; whether to say "you already have an account" |
| `via: 'google'` | `/auth/callback` | welcome | The subtitle says the address was confirmed through Google |

Why not the address bar: an email address in the URL ends up in the browser's
history, the web server's access log and the page addresses error tracking
records. Navigation state lives in the tab only. A reload keeps it; a new tab
starts without it, which only means typing the address again. Pages check what
they read (`useAuthPageState`): a history entry can hold anything.

## Create an account

Creating an account takes three pages: the email, the emailed code, then
"complete your account". Signing in with a code is the same code and the same
`/verify` page (D-60).

```mermaid
sequenceDiagram
    actor P as Person
    participant App as Web app
    participant API
    participant Inbox
    P->>App: /register - email
    App->>API: POST /auth/email-code {email, language}
    API-->>App: the same answer for every address
    API--)Inbox: a 6-digit code
    App->>App: /verify, address and from: register in navigation state
    P->>App: types the code, sent at the sixth digit
    App->>API: POST /auth/email-code/verify {email, code}
    API-->>App: tokens, refresh cookie set, account {created, completed}
    App->>API: GET /users/me
    App->>App: /welcome, keeping next and invite
    P->>App: display name, username, password, time zone, terms
    App->>API: POST /auth/complete-account
    App->>App: ?next= or home
```

**`/register`** ([Register.tsx](../../src/features/auth/pages/Register.tsx), S-AUTH-01, D-59):

1. The page asks only for the email; "Continue with Google" sits under it when
   the API offers Google. The form checks it is an address. Nothing else is
   asked here: the rest of the account comes after the code, on `/welcome`.
2. `POST /auth/email-code` with `email` and the language on screen (the
   email is written in it). The page records that a code was sent
   (`recordCodeSent('sign-in', email)`, for the
   ["send again" countdown](./forms-and-errors.md#send-another-code-timers))
   and moves to `/verify` with the address and `from: 'register'`.
3. **The same address again within the minute** goes straight to `/verify`
   without sending another email (`resendAllowedAt('sign-in', email)`): the
   code already sent still works, and its countdown goes on (D-67).

**The page always moves on.** The API answers the same whether the address
already has an account or not, so the page cannot, and must not, say "this
address already has an account": that would let anyone test which addresses
have accounts here (*enumeration*).

**When it is refused:**

| Refusal | What the page does |
|---|---|
| `429`, reason `emails` | Too many codes to this address: says how long to wait, and the button waits. Typing another address lifts it |
| `429`, reason `network` | Too many code requests from this network: the same, whatever the address |
| no answer, or a `5xx` | "You're offline..." or "Something went wrong..." above the button |

Back from `/verify`, the form opens with the address filled in: the page
keeps it on its own history entry before moving on.

## Enter the code

[Verify.tsx](../../src/features/auth/pages/Verify.tsx), at `/verify`
(S-AUTH-02). It arrives with the address and the page that sent it there
(`from`). Opened without an address (a bookmark, a new tab), it goes to
`/register`, keeping `next` and `invite`.

- **The address is shown as text**, with "We sent a 6-digit one-time code to".
  A code works only for the address it was sent to.
- **The code field** is [CodeInput.tsx](../../src/features/auth/components/CodeInput.tsx)
  (C-23): six boxes over one real input with `autocomplete="one-time-code"`,
  so the browser can offer the code from the email. A pasted code with spaces
  or dashes fills all six. **The sixth digit sends the code by itself**;
  Continue does the same for someone who prefers the button (and says the
  code is incomplete when it is).
- **The right code:** `POST /auth/email-code/verify` with `email` and `code`.
  The answer carries the tokens (the refresh cookie is set) and
  `account: { created, completed }`. The page starts the session with
  `startSession(tokens, account)` ([session.md](./session.md#starting-a-session))
  and goes to `afterSignIn(account, search)`: a new or never-completed account
  to `/welcome`, keeping `next` and `invite`; a complete one to `?next=` or
  home.
- **Came to create an account, and the address had one** (`from: 'register'`
  and `created: false`): a toast says "You already have an account with this
  email, so you are signed in".
- **A wrong code** (`AUTH_CODE_INVALID`) marks the boxes, says so, and the
  first digit typed starts again from an empty row.
- **A dead code** (`AUTH_CODE_EXPIRED`: over 10 minutes old, or five wrong
  tries) disables the boxes and turns the button into **Send a new code**.
- **Send again** (`POST /auth/email-code`): the countdown "Send again in 42 s"
  runs from when the code really went out, across a reload (the record from
  `/register`). A new code empties the boxes and shows a toast.
- **Too many wrong codes** (`429`, reason `codes` for this address or
  `network`): nothing can be typed until the wait is over; the message says
  how long. **Too many code emails** (`429` on send again): "Send again"
  waits, and the code in hand still works.
- **Back** returns to the page that sent the code, with the address still
  there (the browser's own Back when there is history, otherwise `/register`
  or `/login` by `from`).
- **Sign in with password** goes to `/login?method=password`, keeping `next`
  and `invite`, with the address handed over: the sign-in page opens on the
  password.
- **A code that signs in** makes this browser remember the code as its way in
  (`rememberSignInMethod('code')`, D-68): `/login` opens on the code next time.

## Complete your account

[Welcome.tsx](../../src/features/auth/pages/Welcome.tsx), at `/welcome`
(S-ONB-01, D-61). Every new account goes through it once, before anything else
in the app; until it is done, the API refuses the rest of the app with
`ACCOUNT_INCOMPLETE`. The subtitle says "you@example.com is confirmed. One
more step." (or "...confirmed through Google." after Google).

Every field is required (D-69):

| Field | Starts as | Checks |
|---|---|---|
| Display name | Google's name after Google (then the focus starts on the password), otherwise empty | not empty, at most 32 characters |
| Username | made from the email ([username-prefill.ts](../../src/features/auth/lib/username-prefill.ts)): the part before `@`, lower case, without characters a username cannot have, cut at 32; nothing when fewer than 2 are left | 2 to 32 of `a-z 0-9 _ .`; what is typed becomes lower case. Whether it is free is asked 500 ms after typing stops (`useUsernameAvailability` from the users feature): "Checking...", then "Username is available" or "This username is taken." **A taken prefill is emptied without an error**: the person did not choose it |
| Password | empty | the [rules](./forms-and-errors.md#the-password-rules), with `PasswordRules` under the field; it may not be the email nor the username being chosen (D-66) |
| Time zone | the browser's zone, or Hồ Chí Minh when the browser gives none that can be saved | picked in [TimeZoneCombobox](../components.md#timezonecombobox) (C-25): search a city or an offset; the line under it gives the time there now |
| "I agree to the Terms of Service and Privacy Policy" | unticked | must be ticked. The two links open `/terms` and `/privacy` in a new tab, so the form stays as it is |

**Enter NezFocus** sends `POST /auth/complete-account` with `display_name`,
`username`, `password`, `timezone`, `language` (the language on screen, which
becomes the account's) and `terms_accepted`. Then the store's
`markComplete()` and `?next=` or home.

| Answer | What the page does |
|---|---|
| `USERNAME_CONFLICT` | Someone took the username after it was checked: the error goes on the username field, everything typed stays |
| `ACCOUNT_ALREADY_COMPLETE` | Another tab finished first: counts as done, and goes on |
| `AUTH_PASSWORD_REJECTED` | The refused rules on the checklist, and on the field |
| anything else | A message above the button |

The AuthShell's footer shows **Sign out** on `/welcome` only: the account may
not be the one the person meant to use, and there is no other way out of this
page ([AuthShell.tsx](../../src/app/layout/AuthShell.tsx)).

This page replaced the username dialog that used to appear over the app after
a first sign-in (`UsernamePromptModal`, `POST /users/me/username`): the
username is now chosen here, with the rest of the account.

## The gate: an incomplete account sees only `/welcome`

The store has `isComplete` ([auth.store.ts](../../src/features/auth/auth.store.ts),
D-61, D-128). It comes from two places: what the code's answer said
(`account.completed`, passed to `startSession`), then `completed` on the
profile from `GET /users/me`. Signed out, it is `true`, so nothing waits on it.

| Where | An incomplete account |
|---|---|
| `ProtectedRoute` (every page in the AppShell) | is sent to `/welcome?next=<the page it asked for>` |
| `IncompleteOnlyRoute` (`/welcome`) | sees the page. A complete account goes on to `?next=` or home; a visitor goes to `/login`, keeping `next` and `invite` |
| `GuestOnlyRoute` (the visitor pages) | is sent on with `afterSignIn`, so to `/welcome` |
| The API client, [src/lib/api.ts](../../src/lib/api.ts) | a `403 ACCOUNT_INCOMPLETE` from any request calls `ApiSession.accountIncomplete()`, which is the store's `markIncomplete()`; the guards above see the change and open `/welcome`. The session is kept |

The last row is the safety net: should the app think the account complete
when it is not (the profile did not arrive), the API's first refusal corrects
it.

## Sign in

[SignIn.tsx](../../src/features/auth/pages/SignIn.tsx), at `/login`
(S-AUTH-03, D-60). Two ways in, one on screen at a time: **a one-time code
emailed to the address**, the default, and **the password**. Under the form,
after an "or" divider: the button for the other way, then "Continue with
Google" when the API offers it; under the card, "No account yet? Create an
account".

```mermaid
flowchart TD
    W{"which way?"} -->|"the code (default)"| C["/login: the email"]
    W -->|"?method=password"| P["/login?method=password: email and password"]
    C --> EC{"POST /auth/email-code"}
    EC -->|"the same answer for every address"| V["/verify, from: login"]
    EC -->|"429"| WC["Try again in ..., or sign in with your password"]
    P --> L{"POST /auth/login"}
    L -->|"200: token, cookie set"| S["Session started"]
    L -->|"401 AUTH_INVALID_CREDENTIALS"| E["Incorrect email or password..."]
    L -->|"429"| WP["Try again in ..., or sign in with a one-time code"]
    S --> CO{"account complete?"}
    CO -->|"no"| WE["/welcome, keeping next and invite"]
    CO -->|"yes"| R["?next= or home"]
```

**Which way the page opens on**
([sign-in-method.ts](../../src/features/auth/lib/sign-in-method.ts)):

1. The way the address names, `?method=password` or `?method=code`, so a
   reload keeps it.
2. Otherwise the way of the last sign-in that worked in this browser (D-68):
   `localStorage`, key `auth:sign-in-method`, written by a password sign-in
   here and by a code that signs in on `/verify`. Nothing remembered, or
   storage blocked: the code.
3. One exception: a session ended by a password change elsewhere opens on the
   password, the way back in, unless the address names a way.

**Switching ways.** "Sign in with password" / "Sign in with a one-time code"
swaps the way in place (`replace`: no new history entry). The address gets
`?method=password` for the password; for the code the parameter is removed,
or set to `?method=code` only when the browser remembers the password (so a
reload stays on the code). The email typed so far is kept (handed over in
navigation state), a message or a limit on screen is cleared, and `next` and
`invite` stay.

**By code** (the default):

1. Only the email, under "Enter your email and we'll send you a one-time code
   to sign in." The form checks it is not empty ("Enter your email to get a
   code") and an address.
2. As on `/register`: `POST /auth/email-code`, `recordCodeSent('sign-in',
   email)`, then `/verify` with the address and `from: 'login'`. The same
   address again within the minute goes to `/verify` without another email
   (D-67). The page never says whether the address has an account: this is
   "create an account" in other words (D-60).
3. The address stays on this page's history entry, so Back from `/verify`
   finds it filled in.

**By password:**

1. Email and password (with a show/hide button). "Forgot password?" sits at
   the end of the password's label row (`FormField`'s `action`), and comes
   after the field in the tab order. The form checks the address, and that
   the password is not empty; not the password rules: an old password may
   predate them, and the API does not check them at sign-in either.
2. `signIn()` in the store sends `POST /auth/login` with `email` and
   `password`.
3. On `200` the store starts the session, the browser remembers the password
   as its way in (D-68), and the page goes to
   `afterSignIn({ completed: isComplete }, search)`.

The form checks only the fields of the way on screen: the way reaches the
schema through react-hook-form's `context` option (`useForm({ context:
method, resolver })`, the resolver building the schema for that way), and
`useForm` takes its options afresh on every render. The focus starts on the
first empty field of the way: the email, or the password when the email is
already there. While the form is out, the fields are read-only and the other
buttons, Google's included, are disabled.

**Every other answer:**

| Answer | What the page does |
|---|---|
| `401 AUTH_INVALID_CREDENTIALS` | The `api` catalogue's "Incorrect email or password. Try again, or sign in with a one-time code." The same for a wrong password, an address with no account and an account without a password (D-60), so the page says nothing about which addresses exist. The password is emptied and focused; the email stays |
| `429`, reason `sign_ins` (password) | Too many wrong passwords for this address: "Too many wrong tries. Try again in ..., or sign in with a one-time code." Typing another address lifts it |
| `429`, reason `emails` (code) | Too many code emails to this address: "We've sent several codes to this email in the past hour. Try again in ..., or sign in with your password." Typing another address lifts it |
| `429`, reason `network` | Too many failed sign-ins, or code requests, from this network: the wait, the other way, and that on a shared network other people's tries count too. Whatever the address |
| any other `429` | "Too many tries. Try again in ..." |
| no answer, or a `5xx` | "You're offline..." or "Something went wrong..." above the button |

A limit is a `FormMessage` with a clock above the button, counting down; the
button waits until it ends.

**Why a session ended.** A session that ended by itself or elsewhere lands
here ([session.md](./session.md#why-a-session-ended-every-reason)), and a
**banner** (`Banner`, C-16) above the card says why. The page reads the
reason while rendering (`peekSignOutReason()`) and takes it from
`sessionStorage` in an effect (`takeSignOutReason(isSessionEnded)`), so it is
said once: a reload does not say it again.

| Reason | The banner |
|---|---|
| `password-changed` | "Your password was just changed on another device · sign in with the new password" (and the page opens on the password) |
| `signed-out-everywhere` | "One of your devices chose "Sign out other devices" · sign in again" |
| `security` | "Your session was closed to protect your account because it was in use in two places at once · sign in again, and change your password if that wasn't you" (a shield icon) |
| `session-expired`, `signed-out` | "Your session has ended · sign in again to continue" |

The other reasons are toasts ([session.md](./session.md#why-a-session-ended-every-reason)).

"Forgot password?" and "Create an account" carry the email typed so far to
the next page. A page that sends someone here may hand over an address; it is
filled in.

## Forgot and reset the password

```mermaid
sequenceDiagram
    actor P as Person
    participant App as Web app
    participant API
    participant Inbox
    P->>App: /forgot-password - email
    App->>API: POST /auth/forgot-password {email, language}
    API-->>App: 202, the same answer for every address
    API--)Inbox: a 6-digit code, if the address has an account
    App->>App: /reset-password, address in navigation state
    P->>App: code, new password
    App->>API: POST /auth/reset-password
    API-->>App: 200 access token, cookie set, every other session ended
    App->>App: /welcome if incomplete, else ?next= or home
```

**`/forgot-password`** ([ForgotPassword.tsx](../../src/features/auth/pages/ForgotPassword.tsx), S-AUTH-04 `request`):

1. **Back** returns to sign in by password (`/login?method=password`,
   keeping `next` and `invite`), with the address still there.
2. The address (filled in when handed over). The form checks it is not empty
   and an address.
3. `POST /auth/forgot-password` with `email`. The API answers `202` whether
   or not the address has an account, so the page always moves on to
   `/reset-password` with the address, and records the send
   (`recordCodeSent('password-reset', email)`). The same address again within
   the minute goes straight on without another email (D-67). The reset code
   is its own kind: a sign-in code does not work here, nor this one there
   (D-60).

| Refusal | What the page does |
|---|---|
| `429`, reason `emails` | "We've sent several codes to this email in the past hour. Try again in ..."; the button waits. Typing another address lifts it |
| `429`, reason `network` | Too many code requests from this network: the same, whatever the address |
| no answer, or a `5xx` | "You're offline..." or "Something went wrong..." above the button |

**`/reset-password`** ([ResetPassword.tsx](../../src/features/auth/pages/ResetPassword.tsx), S-AUTH-04 `reset-form`):

1. Opened without an address (a new tab, a bookmark), it goes to
   `/forgot-password`, keeping `next` and `invite`.
2. The subtitle is hedged, the same words for every address (NFR-SEC-05):
   "If you@example.com has a NezFocus account, a 6-digit one-time code will
   arrive in a few minutes."
3. The code in `CodeInput` (six boxes, as on `/verify`); the sixth digit
   moves on to the new password and sends nothing. The new password with the
   checklist; there is no second "confirm" field (the show/hide button is
   there to check it). A line says "Every other device is signed out, and you
   stay signed in here."
4. **Set password** says so when the code is short ("Enter all 6 digits of
   the code from the email"), and checks the password rules (against the
   address) before sending anything. Then `POST /auth/reset-password` with
   `email`, `code` and `password`. The API saves the password, ends **every**
   session of the account, and signs in here: an access token and a new
   refresh cookie.
5. The page starts the session, says "New password set. Your other devices
   were signed out.", and goes on with `afterSignIn`.

| Refusal | What the page does |
|---|---|
| `AUTH_CODE_INVALID` | Marks the boxes, says so, and puts the focus back on the code. The new password stays: only the code was wrong |
| `AUTH_CODE_EXPIRED` | Disables the boxes; the button becomes **Send a new code**, which sends one on this page |
| `AUTH_PASSWORD_REJECTED` | The refused rules on the checklist, and on the field |
| `429`, reason `codes` (this address) or `network` | Too many wrong codes: nothing can be sent until the wait is over; the message says how long. The password stays |
| `429` on send again (`emails`, `network`) | "Send again" waits; the code in hand still works |
| no answer, or a `5xx` | "You're offline..." or "Something went wrong..." above the button |

**"Didn't get the code? Send again"** stays on this page. Until the minute
since the last code is up (forgot-password's record, across a reload) it
reads "Send again in 42 s". Sending (`POST /auth/forgot-password`) empties
the boxes and shows a toast in the same hedged words: "If you@example.com has
a NezFocus account, a new one-time code will arrive in a few minutes."
**Back** is the browser's Back when there is history, otherwise
`/forgot-password` with the address.

Both pages are opened from email links, so a signed-in person who opens them
gets a card rather than being sent away ([below](#already-signed-in-what-visitor-pages-do)).

## Continue with Google

Signing in with Google is a **page navigation, not an API call**: the browser
leaves the app, visits the API and Google, and comes back. The button is in
[OAuthButtons.tsx](../../src/features/auth/components/OAuthButtons.tsx), the
address and the error names in [oauth.ts](../../src/features/auth/lib/oauth.ts),
the return page in [OAuthCallback.tsx](../../src/features/auth/pages/OAuthCallback.tsx).

**The button appears only when the API offers Google.** The app reads
`GET /auth/options` once per page load ([useAuthOptions.ts](../../src/features/auth/api/useAuthOptions.ts));
the button shows when its `providers` list has `google`. While that loads, or
if the API cannot be asked, there is no button: no button beats a button that
leads nowhere. It is a plain link (`<a href>`) to
`${VITE_API_URL}/auth/google?redirect=<the page's ?next=>`, on `/login` and
`/register`. On `/login`, while the form is being sent, it is a disabled button
instead, not a link to follow; a limit on the form does not disable it, since
Google does not use those limits.

```mermaid
sequenceDiagram
    actor P as Person
    participant App as Web app
    participant API
    participant G as Google
    P->>App: clicks Continue with Google on /login?next=/profile
    App->>API: browser goes to GET /auth/google?redirect=/profile
    API->>G: redirect, with state, nonce and PKCE. Sets the oauth_state cookie
    P->>G: picks an account, agrees
    G->>API: browser comes back to GET /auth/google/callback
    API->>API: checks everything, finds or makes the account
    API->>App: redirect to /auth/callback?redirect=/profile, refresh cookie set
    App->>API: POST /auth/refresh, with the cookie
    API-->>App: access token
    App->>API: GET /users/me
    App->>App: /welcome?next=/profile if incomplete, else /profile
```

**The return page, `/auth/callback`.** On success the API has set the refresh
cookie and nothing else, so the page does what a reload does: trades the
cookie for an access token (`resumeFromCookie()`,
[session.md](./session.md#starting-a-session)), loads the user, tells the
other tabs, and goes on as every sign-in does: `afterSignIn` with
`?redirect=` as `next`, and `replace` (Back does not return to the callback).
A new account made with Google, or one never completed, lands on `/welcome`
with `via: 'google'`: the display name is filled in from Google, and the
person still chooses a username and a password (every account has one,
D-130). It runs once, even though React runs effects twice in development.

What the page reads from its address:

| Query | Meaning | The page |
|---|---|---|
| `?error=cancelled` | The person cancelled at Google | "Sign-in with Google was cancelled." and "Back to sign in" |
| `?error=email_unverified` | Google has not verified the account's address | "Google hasn't verified this account's email address, so it can't be used to sign in here." |
| `?error=account_deleted` | The account linked to this Google account was deleted | "The account linked to this Google account has been deleted." |
| any other `?error=` | Something failed (the API logged why) | "Sign-in with Google didn't work. Try again, or sign in with your email." |
| `?redirect=` | Where the person was heading | Used as `next`, checked again by `safeNext` |
| none of these | Success | Takes up the session as above. No session to take up: the "didn't work" message |

"Back to sign in" keeps the page to come back to (`/login?next=...`). The
page used to read `?notice=password_removed` and show a toast; that is gone.

Which account a Google sign-in lands in (a new one, or an existing one with
the same address) is the API's decision: the API starter's
`docs/auth/google-sign-in.md`.

Turning Google on is the API's business alone (`GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` there; the API starter's `docs/setup/google-sign-in.md`).
Nothing in this app's Content-Security-Policy is needed: following a link to
another site is not something it governs, and Google's pages never load inside
this app.

## Already signed in: what visitor pages do

`GuestOnlyRoute` ([ProtectedRoute.tsx](../../src/features/auth/components/ProtectedRoute.tsx))
wraps the visitor pages. A signed-in person who opens one:

- `/login`, `/register`, `/verify`: is sent on, at once, with
  `afterSignIn`: to `/welcome` if the account is incomplete, else to
  `safeNext(?next=)`, or home.
- `/forgot-password` and `/reset-password`: these are the pages emails link
  to, so the person may well be signed in to another account. They see a card
  instead: "You're already signed in", "You're signed in as you@example.com",
  a line on using Change password in Settings, and two buttons: **Go to
  Settings**, and **Sign out and continue** (signs out and reloads the same
  page, now as a visitor).

The card shows only when the person was signed in on arrival. Signing in on
the page itself (a reset signs in) moves on as usual.

`/auth/callback` is not guarded: it is the page that makes the visitor signed
in. `/welcome` has its own guard ([the gate](#the-gate-an-incomplete-account-sees-only-welcome)).

## Pages for signed-in people

`ProtectedRoute` wraps the AppShell, so every page in it: `/study`,
`/settings`, `/profile` and the rest. A visitor is sent to
`/login?next=<the whole address>` (path, query and `#` part), and comes
back there after signing in. An incomplete account is sent to
`/welcome?next=<the whole address>`. While a sign-out is reloading the app, it
shows a spinner instead, so the person does not flash through the sign-in page
on the way out ([session.md](./session.md#signing-out-step-by-step)).

## The terms and the privacy policy

[Legal.tsx](../../src/pages/Legal.tsx), at `/terms` and `/privacy` (S-PUB-02,
D-127). Public: no guard, outside the AuthShell and the AppShell, so they open
the same for a visitor and for someone signed in. One column of text in the
language on screen, read from `src/pages/legal/content/<vi|en>/<terms|privacy>.md`
by [simple-markdown.ts](../../src/lib/simple-markdown.ts), a small Markdown
subset turned into React elements (never `innerHTML`). The bar on top offers a
visitor the language, the theme and the way in; someone signed in sees only
"Open NezFocus". "Complete your account" links here in a new tab, so the
page has no Back.

## Your menu

[MeMenu.tsx](../../src/app/layout/app-shell/MeMenu.tsx), from your avatar at
the foot of the AppShell's rail: your name and username (opens your
profile), your status, **Settings** and **Sign out**. Sign out
[signs out](./session.md#signing-out-step-by-step) to `/`, which sends a
visitor on to `/login`.
