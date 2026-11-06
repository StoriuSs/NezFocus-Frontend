# Account settings

This page explains what a signed-in person can change about how they sign in:
the password, signing out on every device, and deleting the account. It says what each screen shows, what it asks the API, and why. Read
it before changing the settings page, or to answer "how do I...?" for someone
using the app.

The settings page is `/settings` (your menu → **Settings**;
[Settings.tsx](../../src/features/auth/pages/Settings.tsx)). Deleting the
account is on the profile page, `/profile`. Both are for signed-in people
only.

- [The settings page at a glance](#the-settings-page-at-a-glance)
- [Change the password](#change-the-password)
- [Set a first password](#set-a-first-password)
- [Sign out everywhere](#sign-out-everywhere)
- [Delete the account](#delete-the-account)
- [Every API call on these screens](#every-api-call-on-these-screens)

## The settings page at a glance

| Section | Shows when | What it does |
|---|---|---|
| **Change password** | the account has a password | Changes it; signs out every other device |
| **Set a password** | the account has none (it was made with Google) | Adds one, with an emailed code |
| **Sign out everywhere** | always | Ends every session of the account, this one included |

The first thing the page does is ask the API how the account signs in:
`GET /auth/sign-in-methods`, which answers `{ password: true|false,
providers: ["google"] }`. Until the answer is in, the password section shows
"Loading..." and neither form: "Change password" would be wrong for an
account that has no password. If the question fails, it says "Your sign-in
details couldn't be loaded." with **Try again**.

## Change the password

1. The form: current password, new password (with the
   [rules checklist](./forms-and-errors.md#the-password-rules)), new password
   again. A hidden field carries the account's email, so a password manager
   files the new password under the right account.
2. `POST /auth/change-password` with `current_password` and `new_password`.
3. The API checks the current password and the rules (against the email and
   the username), saves the new password, **ends every other session** of the
   account, and emails the owner. This session stays.
4. The page empties the form and says "Password changed. Other devices have
   been signed out."

Other tabs in this browser share this session, so they stay signed in. Another
device's next request is refused, and it shows "Your password was changed, so
you were signed out here. Sign in with the new password."
([session.md](./session.md#why-a-session-ended-every-reason)).

| Refusal | The page |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "Your current password is not right", under that field |
| `422 AUTH_PASSWORD_REJECTED` | the broken rules on the checklist |
| `429`, reason `wrong_password` | five wrong current passwords in 15 minutes: "Too many wrong passwords. Try again in ..." |

## Set a first password

An account made with "Continue with Google" has no password. The section
reads "You sign in with Google. Set a password to sign in with your email
address too. We email you a code first, to check it is you."
([SetPasswordSettings.tsx](../../src/features/auth/components/SetPasswordSettings.tsx)).

**Why a code, when the person is already signed in?** A signed-in browser is
not proof enough: someone at an unlocked computer could otherwise add a
password and keep a way into the account. The code proves the person also
controls the mailbox.

1. **Email me a code** → `POST /auth/password/code`. The API emails a 6-digit
   code that works for 10 minutes.
2. The form opens: "We sent a 6-digit code to you@example.com...". The code,
   the new password with the checklist, the new password again.
3. **Set password** → `POST /auth/password` with `code` and `new_password`.
4. The page says "Password set. You can now sign in with your email address
   and this password too.", asks the API again how the account signs in, and
   now shows **Change password**. Google keeps working, and no session ends.
   The API emails the owner that a password was added.

Details that save a second email:

- **I already have a code** opens the form without sending another (a new
  code would replace the one in the inbox).
- A reload within those 10 minutes reopens the form by itself: the tab
  remembers sending the code.
- **Send a new code** waits a minute after the last one, as the API does.

| Refusal | The page |
|---|---|
| `400 AUTH_CODE_INVALID` or `AUTH_CODE_EXPIRED` | under the code field |
| `422 AUTH_PASSWORD_REJECTED` | the broken rules on the checklist |
| `409 AUTH_PASSWORD_ALREADY_SET` | a password was set meanwhile (another tab): the message, and the section switches to "Change password" |
| `429`, reason `emails` | the wait; the send button counts down |

"Forgot your password?" on the sign-in page also works for these accounts: it
sets a first password the same way, signed out.

## Sign out everywhere

The last section on the settings page.

1. **Sign out everywhere** asks once more: "Sign out on every device, this one
   included?"
2. **Yes, sign out everywhere** → `POST /auth/logout-all`. The API ends every
   session of the account and clears this browser's cookie.
3. Only once the API has answered, the page signs out here too: the app
   reloads at the home page with "You're signed out on every device."

If the request fails, the other devices are still signed in, so this one stays
signed in too and says so: "You're still signed in: signing out everywhere
didn't work." The page does not pretend to be done when it is not.

Every other device finds out on its next request, and shows "You were signed
out: "Sign out everywhere" was chosen on one of your devices." Other tabs in
this browser sign out at once ([session.md](./session.md#several-tabs)).

## Delete the account

On `/profile`, under **Danger zone**: **Delete account** opens a dialog
([DeleteAccountDialog.tsx](../../src/features/auth/components/DeleteAccountDialog.tsx)):
"This can't be undone. You'll be signed out on every device, and your personal
details will be erased."

**Why proof is needed.** A signed-in session alone (an unlocked laptop, a
borrowed phone) must not be enough to destroy an account. The API refuses
without proof, so the dialog asks for it.

When it opens, the dialog asks the API what the account has
(`GET /auth/sign-in-methods`), and asks for exactly the proof it needs:

| The account | The dialog asks for |
|---|---|
| has a password | the password |
| has no password (made with Google) | an emailed code: **Email me a code** → `POST /auth/account/delete-code`, then the 6 digits |

**Delete my account** is enabled once that is filled in. It sends
`POST /auth/account/delete` with `password` or `code`. The API checks the proof, deletes the account, ends every
session, clears the cookie, and emails a confirmation. The app then signs out
and reloads at the home page with "Your account was deleted. We've emailed you
a confirmation."

| Refusal | The dialog |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "That password isn't right.", under the password |
| `400 AUTH_CODE_INVALID` or `AUTH_CODE_EXPIRED` | under the emailed code |
| `400 AUTH_CONFIRMATION_REQUIRED` | the account changed meanwhile (a password set in another tab): it asks the API again what to show |
| `409 AUTH_USE_PASSWORD` | the account has a password after all (set in another tab): it asks for the password instead |
| `429` | the wait; "Email me a code" counts down |

Closing the dialog clears it. What the API removes, and when the personal
details are finally erased, is in the API starter's `docs/auth/accounts.md`.

## Every API call on these screens

| Screen | Method and route | Sends | Answer used |
|---|---|---|---|
| Settings, on open | `GET /auth/sign-in-methods` | — | `password`, `providers` |
| Change password | `POST /auth/change-password` | `current_password`, `new_password` | — |
| Set a password | `POST /auth/password/code` | — | — |
| Set a password | `POST /auth/password` | `code`, `new_password` | — |
| Sign out everywhere | `POST /auth/logout-all` | — (with the cookie) | — |
| Delete, no-password account | `POST /auth/account/delete-code` | — | — |
| Delete | `POST /auth/account/delete` | `password` or `code` (with the cookie) | — |

The app writes these in camelCase (`currentPassword`, `newPassword`); the
API client turns them into snake_case on the way out, and the answers back
into camelCase.
