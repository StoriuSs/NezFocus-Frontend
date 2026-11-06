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
- [Sign out everywhere](#sign-out-everywhere)
- [Delete the account](#delete-the-account)
- [Every API call on these screens](#every-api-call-on-these-screens)

## The settings page at a glance

| Section | What it does |
|---|---|
| **Change password** | Changes it; signs out every other device |
| **Sign out everywhere** | Ends every session of the account, this one included |

Every account has a password (D-130): it is chosen on "complete your account"
([pages-and-flows.md](./pages-and-flows.md#complete-your-account)), whether
the account was made with an emailed code or with Google. So the page shows
**Change password** straight away, without asking the API how the account
signs in. The "Set a password" section for accounts made with Google
(`SetPasswordSettings`, `GET /auth/sign-in-methods`, `POST /auth/password/code`,
`POST /auth/password`) is gone.

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
without proof, so the dialog asks for the password. Every account has one
(D-130); deleting with an emailed code, for accounts that once had none, is
gone.

**Delete my account** is enabled once the password is typed. It sends
`POST /auth/account/delete` with `password` (and the language on screen, for
the confirmation email). The API checks it, deletes the account, ends every
session, clears the cookie, and emails a confirmation. The app then signs out
and reloads at the home page with "Your account was deleted. We've emailed you
a confirmation."

| Refusal | The dialog |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "That password isn't right.", under the password |
| `429`, reason `wrong_password` | the wait, above the form |

Closing the dialog clears it. What the API removes, and when the personal
details are finally erased, is in the API starter's `docs/auth/accounts.md`.

## Every API call on these screens

| Screen | Method and route | Sends | Answer used |
|---|---|---|---|
| Change password | `POST /auth/change-password` | `current_password`, `new_password`, `language` | — |
| Sign out everywhere | `POST /auth/logout-all` | — (with the cookie) | — |
| Delete | `POST /auth/account/delete` | `password`, `language` (with the cookie) | — |

The app writes these in camelCase (`currentPassword`, `newPassword`); the
API client turns them into snake_case on the way out, and the answers back
into camelCase.
