# Account settings

This page explains what a signed-in person can change about how they sign in:
the password, the devices signed in to the account, and deleting the account.
It says what each screen shows, what it asks the API, and why. Read it before
changing the account page, or to answer "how do I...?" for someone using the
app.

The account page is `/settings/account` (S-ME-03, "Tài khoản" / "Account"; your
menu → **Settings**, or **Account** in the settings list column;
[Settings.tsx](../../src/features/auth/pages/Settings.tsx)). `/settings` alone
sends there, replacing itself in the history. Deleting the account is on this
page too, in its own group below Sessions. The profile is a page of its own,
`/settings/profile` (S-ME-02).
Both are for signed-in people only.

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
| | **Password** | A hint: "Sign in with a code or your password. Your password also confirms important actions." On the right, a small outline **Change password** button opens the change-password dialog |
| **Sessions** | one per device | Every signed-in device, this one first. Sign out any other one, or all of them at once |
| **Delete account** | no rows | What deleting means, and a small red **Delete account** button that opens the confirm dialog |

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

**Change password** on the **Password** row opens a dialog, 520 wide at most
([ChangePasswordDialog.tsx](../../src/features/auth/components/ChangePasswordDialog.tsx)).
It has two modes: the current password, which it opens on, and an emailed
code, for a person who forgot it (D-74). The dialog cannot be closed while a
request runs. Closed, it forgets what was typed and opens on the current
password again; done either way, it closes itself.

**With the current password.** "Change password", "Other devices will be
signed out; this one stays signed in."

1. The form: current password, with **Forgot password?** on its label row
   (reached by Tab after the field), then the new password with the
   [rules checklist](./forms-and-errors.md#the-password-rules). There is no
   "new password again" field (01 Q14); the show/hide button is there to
   check it. A hidden field carries the account's email, so a password
   manager files the new password under the right account.
2. **Change password** checks both fields are filled and the rules (against
   the email and the username) before sending anything. Then
   `POST /auth/change-password` with `current_password` and `new_password`.
3. The API checks the current password and the rules, saves the new
   password, **ends every other session** of the account, and emails the
   owner. This session stays.
4. The dialog closes with the toast "Password changed. Other devices have
   been signed out." `useChangePassword` has the sessions list read again, so
   it shows this device alone.

Other tabs in this browser share this session, so they stay signed in. Another
device's next request is refused, and it lands on sign in by password, under
the banner "Your password was just changed on another device · sign in with
the new password" ([session.md](./session.md#why-a-session-ended-every-reason)).

| Refusal | The dialog |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "Your current password is not right", under that field, which takes the focus. The new password stays |
| `422 AUTH_PASSWORD_REJECTED` | the broken rules on the checklist, and on the new password field |
| `429`, reason `wrong_password` | five wrong current passwords in 15 minutes (D-73): a neutral message, "You entered the wrong current password too many times. Try again in ...", counting down; **Change password** stays disabled until then |
| no answer, or a `5xx` | "You're offline..." or "Something went wrong..." above the buttons |

**Forgot password?** emails a reset code to the account's address
(`POST /auth/forgot-password`, recorded with
`recordCodeSent('password-reset', email)`) and turns the dialog into the code
mode. `sendResetCode(email)` in
[reset-code.ts](../../src/features/auth/lib/reset-code.ts) does the sending,
for this dialog and for the delete dialog. If a reset code went to this address under a minute ago
(`resendAllowedAt('password-reset', email)` in
[code-sent.ts](../../src/features/auth/lib/code-sent.ts)), it switches
without sending another: that code still works (decided in L11). A send that
fails still switches, and the code mode says why: a `429` makes "Send again"
wait, anything else shows above the buttons.

**With an emailed code.** "Choose a new password", "We sent a 6-digit one-time
code to you@example.com." (the account exists, so nothing is hedged). The code
boxes take the focus; under them the "Didn't get the code? Send again" line,
then the new password with the checklist. **Back** returns to the current
password, empty; **Set password** sends. The code, the password, "send again"
and every refusal work as on `/reset-password`, through the same
`useCodeReset` hook and [CodeReset.tsx](../../src/features/auth/components/CodeReset.tsx)
pieces ([pages-and-flows.md](./pages-and-flows.md#forgot-and-reset-the-password)):
an expired code turns the button into **Send a new code**.

`POST /auth/reset-password` ends **every** session of the account, this one
too, and signs in here with a new one (D-62). The dialog takes it up with
`startSession`, has the sessions list read again, closes, and says "New
password set. Your other devices were signed out."

Other tabs in this browser lose their session too, but the shared refresh
cookie now holds the new one: their next request is refused with
`AUTH_TOKEN_REVOKED`, refreshes once, and carries on
([session.md](./session.md#how-the-api-client-handles-answers)). Other
devices land on sign in by password under the same "Your password was just
changed on another device" banner.

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
- **`lastActiveLabel(when, now, t, timeZone?)`**: "Today 21:30", "Yesterday
  22:15", an older day as "Fri, 16/10/2026", and more than a year ago the date
  alone, "14/03/2025". Always 24-hour time. The day and the time are in the
  account's time zone (NFR-I18N-01): the Sessions group reads it from the
  settings cache the AppShell fills (`useQuery({ queryKey: userKeys.settings(),
  enabled: false })`) and passes it on; until the settings have loaded,
  the browser's zone (`wallClock()` in `src/lib/time-zones.ts`). A clock a
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

Deleting waits 14 days (REQ-AUTH-09, D-141): asking only marks the account and
ends every session. Signing in again before the day restores it; after it, the
API deletes the account for good.

**The group.** The last group on `/settings/account`, "Delete account"
([DeleteAccountSection.tsx](../../src/features/auth/components/DeleteAccountSection.tsx)):
"Your account is deleted for good after 14 days; sign in again before then to
restore it.", then a small red **Delete account** button. The button first
looks at the servers the account owns (below, [An Owner of servers](#an-owner-of-servers)),
turning while it does (`aria-disabled`, not `disabled`: the focus stays on
it, so a dialog closed later gives it back there; a second press waits for
the first). An answer that comes once the page is left is dropped; a check
that breaks lets go of the button with a toast. Then the section mounts the
dialog, only while it is open, so it opens empty every time.

**The dialog** ("Delete your account?", 440 wide at most;
[DeleteAccountDialog.tsx](../../src/features/auth/components/DeleteAccountDialog.tsx),
S-ME-03 `delete-confirm`) is the shared password step,
[ConfirmPasswordDialog.tsx](../../src/features/auth/components/ConfirmPasswordDialog.tsx)
(C-14 `password`, also used to hand a server over), given the title, the
words and what to send. It says what deleting means and names the day: "Your
account will be deleted for good on dd/mm/yyyy. Until then, sign in again to
restore it. ...". The servers only they are in go with the account (D-121),
so it names them under it: "The servers only you are in are deleted with your
account: **CLB Guitar PTIT**. Their invite links stop working now." (the
names bold, comma separated; nothing when there are none). The day is 14 days
from when the dialog opened, in the
account's time zone, read from the settings query the AppShell already loaded
(`deletionDate` in
[deletion-date.ts](../../src/features/auth/lib/deletion-date.ts)). The password
field takes the focus (not **Forgot password?**, which comes first in the
markup). A hidden field carries the email for password managers. The dialog
cannot be closed while a request runs, nor by a click outside (C-14).

**Why proof is needed.** A signed-in session alone (an unlocked laptop, a
borrowed phone) must not be enough to delete an account. The API refuses
without proof, so the dialog asks for the password. Every account has one
(D-130); deleting with an emailed code, for accounts that once had none, is
gone.

**Delete account** is enabled once the password is typed. It sends
`POST /auth/account/delete` with `password` (and the language on screen, for
the email). The API checks it, marks the account, ends every session, clears
the cookie, emails the day the account goes, and answers with that day,
`deletes_at`. The app then signs out with `logout('account-deleted', undefined,
deletesAt)`: this tab lands on `/login` (no `?next`), under the banner "Your
account will be deleted for good on dd/mm/yyyy · sign in before then to
restore it" ([session.md](./session.md#an-account-waiting-to-be-deleted)).
Other devices get the same banner at their next request.

| Refusal | The dialog |
|---|---|
| `400 AUTH_CURRENT_PASSWORD_INVALID` | "That password isn't right", under the password, which empties and takes the focus (C-14) |
| `429`, reason `wrong_password` | five wrong passwords in 15 minutes (D-121): a neutral message, "You entered a wrong password too many times. Try again in ...", counting down; **Delete account** stays disabled until then |
| `409 OWNERSHIP_TRANSFER_REQUIRED` | a server gained a member since the check: the dialog closes and the blocking dialog opens with the servers the API lists (`data.servers`), the server list read again for their handover. A refusal naming none it can read stays in the dialog as any other refusal |
| no answer, or anything else | "You're offline..." or the API's message, in red above the buttons |

**Forgot password?** sends a reset code with `sendResetCode(email)`, and the
password step puts the change-password dialog on the code in its place
(`PasswordDialog` with `startWith`, exported from
[ChangePasswordDialog.tsx](../../src/features/auth/components/ChangePasswordDialog.tsx)).
**Back** there, or a new password set, brings the password step back, empty
(`onBack`, `onDone`). A send that fails still opens the code
mode, which says why, as in [Change the password](#change-the-password).

### An Owner of servers

Servers with other members are handed over (or deleted) before the account
can go (REQ-AUTH-09, D-76), and the app says so before any password
(S-ME-03 `delete-blocked-owner`). **Delete account** reads the server list
again (`GET /servers`, not the copy in the cache: someone may have joined
since) and sorts the servers the account owns by `member_count`:

- **With other members:** "Hand over your servers first", one row per server
  (its picture at 32, the name, "13 members" under it, ›) and **Close**. A
  row opens that
  server's handover in the dialog's place (04 S-SET-07 `transfer-picker`, then
  the password); once done, **Delete account** checks again.
- **Only them:** the delete dialog opens and names them (above; "The server
  only you are in is ..." for one).

The list cannot be read (offline: the read fails at once, `networkMode:
'always'`, rather than wait for the connection): the copy in the cache decides, or none,
and the API's own check (`409 OWNERSHIP_TRANSFER_REQUIRED`) still refuses
what it must, which opens the same dialog.

**Who answers.** Servers are another feature, and it already uses auth (the
password step), so auth does not import it back. Auth says what it needs in
a port, [server-ownership.ts](../../src/features/auth/lib/server-ownership.ts)
(`ServerOwnership`: `owned(queryClient)`, `showBlocked(servers)`); the
servers feature answers
([serverOwnership.ts](../../src/features/servers/api/serverOwnership.ts)),
with the dialog in its `MembershipDialogs`; the AppShell connects the two
(`connectServerOwnership`), as `main.tsx` connects the API client and the
session, and as the API's auth module asks its servers module through
`SERVER_OWNERSHIP` (D-160). Used before it is connected, `serverOwnership()`
throws rather than finding no servers.

What the API removes, and when, is in the API's `docs/account-deletion.md`.
Restoring is on the sign-in page:
[session.md](./session.md#an-account-waiting-to-be-deleted).

## Every API call on these screens

| Screen | Method and route | Sends | Answer used |
|---|---|---|---|
| Change password | `POST /auth/change-password` | `current_password`, `new_password`, `language` | — |
| Change password: "Forgot password?", "Send again" | `POST /auth/forgot-password` | `email`, `language` | — |
| Change password: with the code | `POST /auth/reset-password` (with the cookie) | `email`, `code`, `password`, `language` | the access token; the new session's cookie is set |
| Sessions | `GET /auth/sessions` | — | `sessions`: `id`, `browser`, `os`, `device`, `ip`, `last_active_at`, `current` |
| Sign out one device | `DELETE /auth/sessions/{id}` | — | — |
| Sign out the other devices | `DELETE /auth/sessions` | — | `revoked`, how many ended |
| Delete | `POST /auth/account/delete` | `password`, `language` (with the cookie) | `deletes_at`, when the account goes |
| Delete: "Forgot password?" | `POST /auth/forgot-password` | `email`, `language` | — |
| Restore (the dialog over the sign-in page) | `POST /auth/account/restore` | — | — |

The app writes these in camelCase (`currentPassword`, `newPassword`,
`lastActiveAt`); the API client turns them into snake_case on the way out, and
the answers back into camelCase.
