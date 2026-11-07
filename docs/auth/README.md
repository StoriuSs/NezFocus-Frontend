# Sign-in in the web app

This set explains how signing in works in this web app: the pages a person
sees, how the app stays signed in, what each error means on screen, and where
it all lives in the code. Read it if you are running the app, building a page
that needs a signed-in user, or changing an auth form. You do not need to have
built sign-in before.

- [The one idea](#the-one-idea)
- [What a person can do](#what-a-person-can-do)
- [What the app gives you as a developer](#what-the-app-gives-you-as-a-developer)
- [Words used in this set](#words-used-in-this-set)
- [Who does what: the app and the API](#who-does-what-the-app-and-the-api)
- [How to read this set](#how-to-read-this-set)
- [The pages of this set](#the-pages-of-this-set)
- [What the API must have](#what-the-api-must-have)
- [Troubleshooting](#troubleshooting)

## The one idea

**The API owns every rule. The app shows pages and follows the API's answers.**

The API (the NestJS starter, `Nest-Hexagonal-No-Keycloak`) checks passwords,
sends the emails, decides when a session ends and counts failed attempts. This
app never decides any of that. It:

1. shows the pages (sign in, create an account, enter the code, complete
   your account, settings);
2. sends what the person typed to the API;
3. keeps the **access token** (the short-lived pass that proves who you are)
   in memory, and gets a new one before it runs out;
4. does what the API's answer says: go on to the next page, show a message,
   or sign out.

There is no identity server and no redirect to another site, except Google's
own page when someone picks "Continue with Google".

**Nothing to configure here.** The app's only setting is `VITE_API_URL`, the
API's address. Google sign-in and email are both set up on the API, and the
app finds out at run time what the API has turned on
(`GET /auth/options`). One build works whatever the API offers.

## What a person can do

| Feature | Where | More |
|---|---|---|
| Create an account with only an email: a 6-digit emailed code signs in, to a new account or to the address's own | `/register`, `/verify` | [pages-and-flows.md](./pages-and-flows.md#create-an-account) |
| Complete the account, once, before anything else: display name, username, password, time zone, the terms | `/welcome` | [pages-and-flows.md](./pages-and-flows.md#complete-your-account) |
| Sign in with a one-time code emailed to the address (the default), or with the password; the page opens on the way that last worked in this browser | `/login` | [pages-and-flows.md](./pages-and-flows.md#sign-in) |
| "Continue with Google", when the API has Google set up | `/login`, `/register`, then `/auth/callback` | [pages-and-flows.md](./pages-and-flows.md#continue-with-google) |
| Forgot the password: get an emailed code, choose a new password. This signs in, and signs out every other device | `/forgot-password`, `/reset-password` | [pages-and-flows.md](./pages-and-flows.md#forgot-and-reset-the-password) |
| Read the terms and the privacy policy | `/terms`, `/privacy` | [pages-and-flows.md](./pages-and-flows.md#the-terms-and-the-privacy-policy) |
| Change the password (other devices are signed out, this one stays) | `/settings` | [account-settings.md](./account-settings.md#change-the-password) |
| Sign out, or sign out on every device | your menu (avatar at the foot of the rail), `/settings` | [account-settings.md](./account-settings.md#sign-out-everywhere) |
| Delete the account, with its password | `/profile` | [account-settings.md](./account-settings.md#delete-the-account) |
| Stay signed in across reloads and new tabs; sign in or out in every open tab at once | everywhere | [session.md](./session.md) |
| Be told why, when a session ends (password changed elsewhere, signed out everywhere, account deleted, expired) | a banner on the sign-in page, or a toast after the page reloads | [session.md](./session.md#why-a-session-ended-every-reason) |

## What the app gives you as a developer

| You want to... | Use | More |
|---|---|---|
| Show a page only to signed-in users whose account is complete | `ProtectedRoute` | [in-the-code.md](./in-the-code.md#protecting-a-page-or-part-of-one) |
| Show a page only to visitors (the sign-in pages) | `GuestOnlyRoute` | same |
| Show a button only to admins | `RequireRole`, `useHasRole` | same |
| Know who is signed in | `useAuthStore((state) => state.user)` | same |
| Call the API as the signed-in user | `api` from `@/lib/api`: the token is added for you, refreshed when it is about to expire, and a dead session signs out | [session.md](./session.md#how-the-api-client-handles-answers) |
| Add a page to the sign-in flow | the steps in [in-the-code.md](./in-the-code.md#adding-an-auth-page) | |

## Words used in this set

| Word | Meaning here |
|---|---|
| **Access token** | A short-lived pass (15 minutes by default) the API hands out at sign-in. The app sends it with every request as `Authorization: Bearer <token>`. The app keeps it in memory only |
| **Refresh token** | A long-lived secret the API keeps in a **cookie** the app cannot read (an *httpOnly* cookie). The browser sends it to the API by itself. The app trades it for a new access token |
| **Session** | One sign-in on one browser, as the API records it. It ends when the person signs out, after 30 days by default, or when the API ends it (a password change, "sign out everywhere", a deleted account) |
| **Emailed code** | Six digits the API emails to sign in (and so create an account) or to reset a password. It works for 10 minutes, and only the newest one works |
| **Complete account** | An account that has done "complete your account" (`/welcome`). Until then the API refuses the rest of the app (`ACCOUNT_INCOMPLETE`) |
| **`?next=`**, **`?invite=`** | The page to go to after signing in, and an invite link waiting, carried in the address from one auth page to the next. The API's Google route calls `next` `redirect` |

The API starter's `docs/auth/concepts.md` explains these terms from the
ground up, with the reasons behind each.

## Who does what: the app and the API

| Thing | The app | The API |
|---|---|---|
| Password rules | Ticks them off while you type (`password-rules.ts`) | Decides; also checks the username where the form does not know it |
| Emailed codes | Shows the code field; waits a minute before offering another | Makes, emails and checks them; 10 minutes, 5 tries |
| Too many attempts | Shows how long to wait, keeps the button disabled | Counts and refuses (`429`, with `Retry-After`) |
| Google | A link to the API, and a page to land on afterwards | The whole conversation with Google, account linking |
| The session | Keeps the access token in memory; refreshes it; signs out on the API's word | Issues, rotates and ends sessions; sets the cookie |
| Roles | Hides what a role may not use | Enforces roles on every route |

## How to read this set

- **"I just want it running."** Start the API first (its
  `docs/setup/prepare-for-development.md`), then this app:
  [../setup/prepare-for-development.md](../setup/prepare-for-development.md).
  Create an account at http://localhost:3001/register; the code arrives in
  Mailpit at http://localhost:8025.
- **"I'm building a page."** [in-the-code.md](./in-the-code.md), then
  [session.md](./session.md#how-the-api-client-handles-answers) for what the
  API client does with your requests.
- **"What happens when someone clicks X?"** [pages-and-flows.md](./pages-and-flows.md).
- **"I'm changing a form, or a message."** [forms-and-errors.md](./forms-and-errors.md).
- **"I need the exact rules"** (limits, lifetimes, error codes): the API
  starter's `docs/auth/README.md`, `docs/auth/rate-limits.md` and
  `docs/auth/api-reference.md`. This set says what the app does with them.
- **"I'm deploying."** [What the API must have](#what-the-api-must-have), below,
  and [../setup/prepare-for-production.md](../setup/prepare-for-production.md).

## The pages of this set

| Page | What it covers |
|---|---|
| [pages-and-flows.md](./pages-and-flows.md) | Every auth page: its address, who may open it, what it shows, what it asks the API, where it goes next. `?next=`, "complete your account" and the gate before the app, Google, the "already signed in" card, the legal pages. Diagrams of creating an account, sign-in and Google |
| [session.md](./session.md) | Where the session lives, the page load, getting a fresh token, what the API client does with each answer, tabs, every reason a session ends and what the person sees |
| [forms-and-errors.md](./forms-and-errors.md) | How forms check input, turn API refusals into messages, handle "too many attempts", the password checklist, and the "send another code" timers |
| [account-settings.md](./account-settings.md) | The settings page (change the password, sign out everywhere) and deleting an account |
| [in-the-code.md](./in-the-code.md) | The files, the guards, the store, the tests, and how to add a page |

## What the API must have

Signing in only works when the browser is allowed to talk to the API and keep
its cookie. On the API (its `docs/auth/operations.md` and
`docs/setup/prepare-for-production.md`):

| API setting | Must be | Why |
|---|---|---|
| `CORS_ORIGINS` | include this app's exact origin: `http://localhost:3001` in development (the default), `https://app.example.com` in production | Otherwise the browser blocks the answers, and `POST /auth/refresh` and `/auth/logout` answer `403 AUTH_FORBIDDEN` |
| `FRONTEND_URL` | this app's address | The links in the emails and the return from Google go there (`/auth/callback`) |
| The cookie | the app and the API on the same site (`app.example.com` and `api.example.com`), or the API set for cross-site cookies (`AUTH_COOKIE_SAMESITE=none` over HTTPS) | Otherwise the browser drops the refresh cookie: sign-in works, then every reload signs out, and the session ends when the access token does |
| Google redirect URI (in Google Cloud) | the **API's** callback, `https://api.example.com/api/v1/auth/google/callback` | Google returns to the API, never to this app |

On this side: `VITE_API_URL` is the API's address, and the
Content-Security-Policy already allows it (`scripts/csp.mjs`). Nothing else.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Signed out after every reload | The refresh cookie does not come back | In the browser's developer tools, the `/auth/login` answer should have a `Set-Cookie` without a warning, and `/auth/refresh` should carry a `Cookie` header. See [the cookie row above](#what-the-api-must-have) |
| Signed in, then signed out after about 15 minutes | Same: the first token works, the refresh has no cookie | Same |
| `403 AUTH_FORBIDDEN` on `/auth/refresh` | The API does not know this app's origin | Add it to `CORS_ORIGINS` on the API |
| No code arrives | Development: emails go to Mailpit | Open http://localhost:8025. Otherwise the API's queue dashboard (`/admin/queues`, the `auth` queue) shows failed sends |
| No "Continue with Google" button | The API does not offer Google | `GET <VITE_API_URL>/auth/options` should list `"providers":["google"]`. If not, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are not both set on the API |
| Google shows `redirect_uri_mismatch` or "Access blocked" | Google Cloud configuration | The API starter's `docs/setup/google-sign-in.md` |
| Back from Google with "Sign-in with Google didn't work" | The API logged why | Also check the browser keeps cookies for the API's address: the short-lived `oauth_state` cookie has to come back |
| "Too many attempts. Try again in ..." | The API's limits, per address and per network | Wait the time shown. On a shared office or school network, other people's attempts count too |
