# Account settings

This page explains what a signed-in person can change about how they sign in:
the password, the devices signed in to the account, and deleting the account.
It says what each screen shows, what it asks the API, and why. Read it before
changing the account page, or to answer "how do I...?" for someone using the
app.

The account page is `/settings/account` (S-ME-03, "Tài khoản" / "Account"; your
menu → **Settings**, or **Account** in the settings list column;
[Settings.tsx](../../src/features/auth/pages/Settings.tsx)). `/settings` alone
sends there, replacing itself in the history. Deleting the account is on the
profile page, `/profile`, which moves under `/settings` in a later slice. Both
are for signed-in people only.

- [The account page at a glance](#the-account-page-at-a-glance)
- [Change the password](#change-the-password)
- [Sessions](#sessions)
- [Delete the account](#delete-the-account)
- [Every API call on these screens](#every-api-call-on-these-screens)

## The account page at a glance

The page is built from settings groups and rows
([SettingsRow.tsx](../../src/components/settings/SettingsRow.tsx), C-27; see
[../components.md](../components.md#settings-rows)), 720 wide at most, with no
cards.

| Group | Row | What it does |
|---|---|---|
| **Sign-in** | **Email** | The account's address, read only: "Codes are sent to this address." |
| | **Password** | A hint: "Sign in with a code or your password. Your password also confirms important actions." For now the change-password form follows it on the page |
| **Sessions** | one per device | Every signed-in device, this one first. Sign out any other one, or all of them at once |

Every account has a password (D-130): it is chosen on "complete your account"
([pages-and-flows.md](./pages-and-flows.md#complete-your-account)), whether
the account was made with an emailed code or with Google. So the page offers
the password change straight away, without asking the API how the account
signs in. The "Set a password" section for accounts made with Google
(`SetPasswordSettings`, `GET /auth/sign-in-methods`, `POST /auth/password/code`,
`POST /auth/password`) is gone.

The old "Sign out everywhere" section is gone too, with `POST /auth/logout-all`:
it ended this session as well. "Sign out the other devices" in
[Sessions](#sessions) replaces it and keeps this one (D-75).

## Change the password

The form sits under the **Password** row, inline, for now; a later slice
(L11) moves it into a dialog opened by a **Change password** button on that
row.

1. The form: current password, new password (with the
   [rules checklist](./forms-and-errors.md#the-password-rules)), new password
   again. A hidden field carries the account's email, so a password manager
   files the new password under the right account.
2. `POST /auth/change-password` with `current_password` and `new_password`.
3. The API checks the current password and the rules (against the email and
   the username), saves the new password, **ends every other session** of the
   account, and emails the owner. This session stays.
4. The page empties the form and says "Password changed. Other devices have
   been signed out." The sessions list is read again, so it shows this device
   alone.

Other tabs in this browser share this session, so they stay signed in. Another
device's next request is refused, and it lands on sign in by password, under
the banner "Your password was just changed on another device · sign in with
the new password" ([session.md](./session.md#why-a-session-ended-every-reason)).

| Refusal | The page |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "Your current password is not right", under that field |
| `422 AUTH_PASSWORD_REJECTED` | the broken rules on the checklist |
| `429`, reason `wrong_password` | five wrong current passwords in 15 minutes: "Too many wrong passwords. Try again in ..." |

## Sessions

The second group on the page
([SessionsSection.tsx](../../src/features/auth/components/SessionsSection.tsx);
REQ-AUTH-03, D-75). A session is one sign-in on one browser
([README.md](./README.md#words-used-in-this-set)).

**The list.** `GET /auth/sessions` through `useSessions`
([useSessions.ts](../../src/features/auth/api/useSessions.ts)). It is read
again each time the page opens and each time the tab comes back into focus, so
a device signed in or out meanwhile shows up then; a failed read is not
retried by itself. The API puts this device first, then the rest by latest use.

| | This device | Any other device |
|---|---|---|
| Icon | desktop, tablet or phone, from the API's `device` | the same |
| Name | "Safari · macOS" | the same |
| Beside the name | the tag **This device** (C-36) | — |
| Under the name | "Active now" | the last use and the masked network: "Yesterday 22:15 · IP 14.231.x.x" |
| On the right | — | **Sign out**, red text, labelled "Sign out Safari · macOS" for screen readers |

The name, the last-use label and the IP come from
[session-label.ts](../../src/features/auth/lib/session-label.ts) and the API:

- **`deviceName(session, t)`**: the browser and the system the API read from
  the session's user agent, joined by " · ". An unknown browser is "Unknown
  browser"; an unknown system is left out.
- **`lastActiveLabel(when, now, t)`**: "Today 21:30", "Yesterday 22:15", an
  older day as "Fri, 16/10/2026", and more than a year ago the date alone,
  "14/03/2025". Always 24-hour time. It uses the browser's clock and time
  zone until the account's time zone reaches the client (L13). A clock a
  little ahead of the browser's still reads as today. The row's label moves on
  each minute (`useMinuteClock`).
- **The IP** is masked by the API before it is sent (`14.231.x.x`,
  `2405:4802:x:x…`); the row shows it as it comes, or nothing when the API
  does not know it.

Which browser, which system, which kind of device and how much of the IP to
show are the API's choice (the backend's D-138); the app only words them.

**Signing out one device.** **Sign out** on a row asks nothing (D-75): signing
out the wrong device only costs it one sign-in. It sends
`DELETE /auth/sessions/{id}`. Once the API has answered, the row leaves the
list (the cached list is changed, not read again) and a toast says "Signed out
Safari · macOS". If the request fails, the row stays and the usual error toast
says why. The API answers the same for a session that had already ended.

That device finds out on its next request, refused with the reason `revoked`:
it lands on sign-in under the plain banner "Your session has ended · sign in
again to continue", the same as an expired session (D-65;
[session.md](./session.md#why-a-session-ended-every-reason)).

**Signing out the other devices.** Under the list, **Sign out the other
devices** (an outline button) asks first, in a dialog: "Sign out 2 other
devices?" ("They will need to sign in again. This device stays signed in.").
**Sign out** sends `DELETE /auth/sessions`; the API ends every session of the
account but this one and answers how many it ended. The list then keeps this
device alone, and a toast gives that number: "Signed out 2 other devices".
**Cancel**, or closing the dialog, signs nobody out. While the request is out
the dialog cannot be closed. With only this device signed in, the button is
replaced by "Only this device is signed in."

Each device signed out this way finds out on its next request, refused with
the reason `signed_out_everywhere`, and shows "One of your devices chose "Sign
out other devices" · sign in again". Other tabs in this browser share this
session, so they stay signed in.

**Loading and failing.** While the list loads, the group shows nothing for one
second, then three placeholder rows, so a quick answer never flashes them. If
the list cannot be read: "Couldn’t load your sessions" and **Try again**.

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
| Sessions | `GET /auth/sessions` | — | `sessions`: `id`, `browser`, `os`, `device`, `ip`, `last_active_at`, `current` |
| Sign out one device | `DELETE /auth/sessions/{id}` | — | — |
| Sign out the other devices | `DELETE /auth/sessions` | — | `revoked`, how many ended |
| Delete | `POST /auth/account/delete` | `password`, `language` (with the cookie) | — |

The app writes these in camelCase (`currentPassword`, `newPassword`,
`lastActiveAt`); the API client turns them into snake_case on the way out, and
the answers back into camelCase.
