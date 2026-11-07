# Forms and errors

This page explains how the auth forms talk to the API: what they check before
sending, how a refusal becomes a message in the person's language, "too many
attempts", the password checklist, and the timers on "send another code". Read it before changing a form or a message, or when a
form says something you do not understand.

Every auth page (`/login`, `/register`, `/verify`, `/welcome`,
`/forgot-password`, `/reset-password`) keeps each message as a key and puts it
into words when shown ([below](#messages-kept-as-keys)), and so does the
account page's change-password dialog. The delete dialog is the older
generation: it still turns a refusal into words at once with `authFormError`.

- [How an auth form is built](#how-an-auth-form-is-built)
- [What a form checks before asking the API](#what-a-form-checks-before-asking-the-api)
- [Turning a refusal into a message](#turning-a-refusal-into-a-message)
- [Where each error shows](#where-each-error-shows)
- [The error types the auth pages meet](#the-error-types-the-auth-pages-meet)
- [Too many attempts (429)](#too-many-attempts-429)
- [The password rules](#the-password-rules)
- ["Send another code" timers](#send-another-code-timers)
- [Saying nothing about who has an account](#saying-nothing-about-who-has-an-account)
- [Messages and languages](#messages-and-languages)
- [Messages kept as keys](#messages-kept-as-keys)

## How an auth form is built

Every auth form follows the same pattern:

1. **A react-hook-form form with a zod schema.** On the auth pages the
   schema's messages are keys (`'auth:validation.emailRequired'`), put into
   words when shown. The sign-in page checks only the fields of the way on
   screen: it passes the way as `useForm`'s `context`, and its resolver builds
   the schema for that way. A new password (welcome, reset, the
   change-password dialog) is checked by `newPasswordIssue(password, context)`
   in [schemas.ts](../../src/features/auth/lib/schemas.ts), which returns the
   message key of the first problem, or nothing. The delete-account dialog is
   the one form left whose schema is built with the translation function, so
   its messages are words at once.
2. **Fields through `FormField`** ([../shadcn-forms.md](../shadcn-forms.md)),
   which links the label, the input and the line under it for screen readers:
   the error (with an icon), else a `status` line ("Checking..."), else a hint.
   A link that belongs to the field ("Forgot password?") goes in its `action`,
   at the end of the label's row. Passwords use `PasswordInput`, with a button to show what was typed (long
   passwords are what the rules ask for, and typing one blind is where typos
   come from).
3. **The frame is `AuthCard`** ([AuthCard.tsx](../../src/features/auth/components/AuthCard.tsx)):
   a title, a subtitle, the form, and links underneath. An error for the whole
   form is a `FormMessage` right above the main button
   ([../components.md](../components.md)), in the change-password dialog
   too; the delete-account dialog still uses a `Notice` above the form.
4. **On submit**, a page for signing in (login, register, verify, welcome, a
   new password) calls `authApi` or the store directly: what it does next is
   the session itself, which the store owns. The change-password dialog's
   current-password mode and the delete dialog use a mutation hook from
   `api/` (`useChangePassword`, `useDeleteAccount`), as the users feature
   does, with `mutateAsync`; its code mode calls `authApi` like the reset
   page, through `useCodeReset`. The button is disabled while the request is
   out.
5. **On a refusal**, the page calls `requestFailure(error)`
   ([form-problem.ts](../../src/features/auth/lib/form-problem.ts)) on the auth
   pages and in the change-password dialog, `authFormError(error)`
   ([form-errors.ts](../../src/features/auth/lib/form-errors.ts)) in the
   delete-account dialog, and decides where to show what it returns
   ([below](#where-each-error-shows)).

Either way the app-wide "toast on every failed mutation" does not apply:
the settings hooks set `meta: { errorToast: false }`, and each form shows its
own error, once.

## What a form checks before asking the API

These checks give a faster answer. The API checks everything again.

| Field | Rule | Message |
|---|---|---|
| Email (register, sign-in by password, forgot-password) | not empty, then an address | "Enter your email", "That email doesn't look right" |
| Email (sign-in by code) | the same, in the code way's words when empty | "Enter your email to get a code" |
| Password, at sign-in by password | not empty (no rules: an old password may predate them) | "Enter your password" |
| A new password | every rule the browser knows ([below](#the-password-rules)) | "The password doesn't meet the conditions yet", or the broken rule named |
| Current password (change-password dialog) | not empty | "Enter your password" |
| Emailed code (verify, reset) | all 6 digits; on verify the sixth sends it, on reset it moves on to the password | "Enter all 6 digits of the code from the email" |
| Display name (welcome) | not empty, at most 32 characters | "Enter a display name", "A display name has at most 32 characters" |
| Username (welcome) | 2 to 32 of `a-z 0-9 _ .`, and free | "Enter a username", "A username has only lowercase letters, numbers, _ and .", "This username is taken. Choose another one." |
| Terms (welcome) | ticked | "You need to agree to continue" |

## Turning a refusal into a message

Every API refusal has the same shape (after the API client camelCases it):

```json
{
  "meta": { "code": "422004", "type": "AUTH_PASSWORD_REJECTED", "message": "(English, for developers)", "requestId": "..." },
  "data": { "rules": ["common"] }
}
```

- `meta.type` names the error. The app shows its own sentence for it, from
  the `api` translations (`src/i18n/locales/<language>/api.json`). The API's
  `meta.message` is English, written for developers, and never shown.
- A type without a translation shows "Something went wrong". No answer at all
  shows "Can't reach the server. Check your connection and try again." in the
  delete dialog; the auth pages and the change-password dialog say "You're offline. Check your connection and
  try again." (with a `wifi-off` icon), and a `5xx` "Something went wrong. Try
  again in a few minutes."
- `data` carries details: the broken password rules, why a limit refused.

`authFormError(error)` (the delete dialog) reads all of it and returns:

| Field | Filled when | Used for |
|---|---|---|
| `message` | always | the sentence to show |
| `type` | the answer had an envelope | special cases on a page (`AUTH_INVALID_CREDENTIALS`...) |
| `passwordRules` | `422 AUTH_PASSWORD_REJECTED`, from `data.rules` | the [checklist](#the-password-rules) |
| `retryAfterSeconds`, `rateLimitReason` | a `429` | [waiting](#too-many-attempts-429) |

`requestFailure(error)` (the auth pages and the change-password dialog) returns
the same facts without words:

| Field | Filled when | Used for |
|---|---|---|
| `message` | always, as a `Message` (`{ key, values }`) | the sentence to show, put into words with `useMessageText()` |
| `type` | the answer had an envelope | special cases (`AUTH_CODE_INVALID`, `USERNAME_CONFLICT`, `ACCOUNT_ALREADY_COMPLETE`...) |
| `limit` | a `429` with a readable `Retry-After`: `{ reason, until }`, `until` being the moment it lifts | the page's own sentence for that limit, and a countdown (`useCountdown`) |
| `passwordRules` | `AUTH_PASSWORD_REJECTED` | the checklist |
| `offline` | no answer arrived | the `wifi-off` icon |

## Where each error shows

| Shown as | For |
|---|---|
| A message for the whole form (`FormMessage` above the button on the auth pages and in the change-password dialog, `Notice` above the form in the delete dialog; read out by screen readers) | most refusals; on `/verify`, `/reset-password` and the dialog's code mode, a wrong or dead code and the limits; in the dialog, too many wrong current passwords |
| A message under one field | a wrong current password (change password); a wrong password (delete the account); a username taken (welcome) |
| The password checklist | `AUTH_PASSWORD_REJECTED`: the rules the API refused, including the ones only it checks |
| A toast (a small message in the corner) | successes ("New password set...", "A new code is on its way"), "you already have an account" on `/verify`, and the sign-out reasons the person caused (or a deleted account) after a reload ([session.md](./session.md#why-a-session-ended-every-reason)). Never a form's error |
| A banner above the sign-in card (`Banner`, C-16) | why a session that ended by itself or elsewhere ended ([pages-and-flows.md](./pages-and-flows.md#sign-in)) |

At sign-in, `AUTH_INVALID_CREDENTIALS` shows the `api` catalogue's sentence
like any other type: "Incorrect email or password. Try again, or sign in with
a one-time code." The page empties the password and puts the focus back in
it. The old "Signed up with Google?" hint and the page's own wording
(`auth:signIn.wrongCredentials`, `googleHint`) are gone: every account has a
password now (D-130), and the one-time code is the way back in for anyone
who forgot it.

## The error types the auth pages meet

The API's full catalogue, with every route that can answer each type, is the
API starter's `docs/auth/api-reference.md`.

| Type | Status | Means | The app shows |
|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong password, no such account, or an account without a password | "Incorrect email or password. Try again, or sign in with a one-time code." |
| `AUTH_CODE_INVALID` | 400 | Wrong emailed code | "That code is wrong. Use the code in the newest email." |
| `AUTH_CODE_EXPIRED` | 400 | The code is over 10 minutes old, or had 5 wrong tries | "This code no longer works (over 10 minutes old, or 5 wrong tries). Send a new code to continue." On `/verify` and `/reset-password` the button becomes Send a new code |
| `USERNAME_CONFLICT` | | The username was taken after it was checked | "This username is taken. Choose another one." (welcome: "Someone just took this username...", on the field) |
| `ACCOUNT_INCOMPLETE` | 403 | The account has not done "complete your account" | no message: the app opens `/welcome` ([pages-and-flows.md](./pages-and-flows.md#the-gate-an-incomplete-account-sees-only-welcome)) |
| `ACCOUNT_ALREADY_COMPLETE` | | "Complete your account" was done already (another tab) | no message: welcome goes on |
| `AUTH_PASSWORD_REJECTED` | 422 | The new password breaks a rule | the rules on the checklist |
| `AUTH_CURRENT_PASSWORD_INVALID` | 400 | Wrong current password | "Your current password is not right" (the delete dialog: "That password isn't right.") |
| `RATE_LIMIT_EXCEEDED`, `THROTTLE_ERROR` | 429 | A limit refused | [below](#too-many-attempts-429) |
| `VALIDATION_ERROR` | 422 | A field the API refused (the form's own checks usually catch it first) | "Please check your input" |

## Too many attempts (429)

The API limits failed sign-ins, wrong codes and code emails, per address, per
account and per network (IP address). Per network, each of the three allows
30 in 5 minutes (D-135): a computer lab behind one address waits minutes, not
an hour. The API's general limit on every route counts a signed-in request
per user, and only a signed-out one per network. A refused request answers
`429` with:

- a **`Retry-After` header**: the seconds to wait. The API lets the browser
  read this header across origins;
- **`data.reason`**: which kind of limit.

The app turns them into a sentence. The wait (`formatWait` in
[form-errors.ts](../../src/features/auth/lib/form-errors.ts)) reads in
seconds under 90 seconds, in minutes (rounded up) under an hour, in hours
(rounded up) from there.

The auth pages word each limit their own way, since the same limit means
something else on each (`limits` in `auth.json`): "We've sent several codes
to this email in the past hour. Try again in 42 minutes." on `/register` and
`/forgot-password`; on `/verify`, "Send again in ..., or sign in with your
password."; on sign-in, each way points to the other ("..., or sign in with
your password", "..., or sign in with a one-time code"); for wrong codes
(reason `codes`, per address, or `network`), "Too many wrong codes for this
email in the past hour...". A network's limit adds that on a shared network
other people count too. A code email refused because one went to the address under a minute ago,
from another tab, browser or flow (reason `recent_email`, D-136), says so
instead: "We just sent a code to this email. Try again in 37 seconds." (same
endings per page). In the same tab the page never asks: it goes straight to
the code (D-67). A limit on one address lifts when another address is
typed (register, sign-in, forgot-password); a network's does not. The
change-password dialog says "You entered the wrong current password too many
times. Try again in 12 minutes." for `wrong_password`, and its code mode
words the rest as `/reset-password` does. The delete dialog, through
`authFormError`, reads:

| `data.reason` | When | The message |
|---|---|---|
| `network` | Too many requests from one network (IP address), 30 in 5 minutes each: failed sign-ins, code emails, wrong codes | "Too many requests from your network. Try again in 42 seconds. On a shared connection, such as an office or a school, other people's requests count too." |
| `recent_email` | A code emailed to one address under a minute ago (one a minute) | "We just sent an email with a code to this address. Try again in 42 seconds." |
| `emails` | Codes emailed to one address: five an hour | "We've already sent several emails to this address. Try again in 12 minutes." |
| `sign_ins` | Failed sign-ins for one address (5 per 15 minutes) | "Too many failed sign-ins for this address. Try again in 12 minutes, or choose a new password." |
| `wrong_password` | Wrong current passwords (change password, delete account): 5 per 15 minutes; the change-password dialog words it its own way (above) | "Too many wrong passwords. Try again in 12 minutes." |
| none, header readable | The API's general per-route limit, per minute: per user when signed in, per network otherwise | "Too many attempts. Try again in 42 seconds." |
| header not readable | | the type's catalogue text, e.g. "Too many attempts. Please wait and try again." |

On the auth pages the button also stays disabled, counting down, for as
long as the API asks: the main button on sign-in, register and
forgot-password; "Send again" and the code boxes on verify and reset; and
**Change password** in the change-password dialog (D-73). The delete dialog
shows the message. The exact limits are in the
API starter's `docs/auth/rate-limits.md`.

## The password rules

The API decides the rules (its `src/modules/auth/domain/password-policy.ts`).
[password-rules.ts](../../src/features/auth/lib/password-rules.ts) repeats them,
so the form can tick them off while someone types instead of after a round
trip.

| Rule id | The password must | Checked here |
|---|---|---|
| `min_length` | have at least 8 characters | yes |
| `max_length` | have at most 128 characters | yes |
| `lowercase` | contain a lower-case letter | yes |
| `uppercase` | contain an upper-case letter | yes |
| `digit` | contain a digit | yes |
| `special` | contain a symbol: anything that is not a letter or a digit, a space included | yes |
| `matches_email` | not *be* the email address or the part before the `@`, dressed up: `Ada2026!` for `ada@example.test` is refused, `Ada-likes-2026!` is fine | yes |
| `matches_username` | not be the username | where the form knows it (settings, and welcome: the username being chosen, D-66); the API checks it everywhere |

There is no common-password rule (D-29): `Password1!` is accepted.

Characters are counted as the API counts them (one per character, even for
characters JavaScript stores as two units), and letters of any alphabet count
as letters.

**The conditions** ([PasswordRules.tsx](../../src/features/auth/components/PasswordRules.tsx), C-22)
sit under the field, always shown: a two-column grid of `min_length`,
`uppercase`, `lowercase`, `digit` and `special` (`GRID_RULES`). Each one
is unmet (circle), met (circle with a tick) or, once the form was sent or the
API refused it, an error (circle with a cross, in red); a screen reader hears
each condition as it is met. The other three (`max_length`, `matches_email`,
`matches_username`: `FIELD_RULES`) are not conditions but the field's own
error, named ("Don't use your email as your password"), from the browser's
check (`newPasswordIssue`) or from the API's refusal (`passwordFieldRule`). A
refusal is never
shown as a vague "invalid password".

**Checked against which address:** the one typed on reset, the account's own
on welcome and in settings. The API also checks the username, on reset,
change and complete-account.

**Changing a rule:** change it on the API first, then `password-rules.ts`
and the texts in `auth.json`
(`passwordRules`) in every language. If the two disagree, the API wins: a
password the checklist accepted is refused, and the refusal shows the rule.

## "Send another code" timers

The API sends at most one code email a minute to an address. The pages wait
too: it saves a refused request, and says why ("Send again in 42 s"). The
wait counts from when the last code really went out, so a reload, or a step
to another page and back, does not start a fresh minute (or none) (D-67).

| Button | Remembers the send in | Set by |
|---|---|---|
| "Send again" on `/verify` | `sessionStorage`, `auth:code-sent:sign-in:<address>` | register, sign-in by code, and this button |
| "Continue" on `/register`, "Send code" on `/login`, the same address again | the same key: within the minute it goes to `/verify` without sending | register, sign-in by code |
| "Send code" on `/forgot-password`, the same address again | `sessionStorage`, `auth:code-sent:password-reset:<address>`: within the minute it goes to `/reset-password` without sending | forgot-password, and "Send again" on reset |
| "Send again" on `/reset-password` | the same key | forgot-password, and this button |
| "Forgot password?" in the change-password dialog | the same key: within the minute it switches to the code without sending (L11) | this link, "Send again" in its code mode, and the two above |

`sessionStorage` belongs to the tab: another tab starts without the record,
and the API's own limit still applies there. After a `429`, the button waits
as long as `Retry-After` says instead.

The pieces: [code-sent.ts](../../src/features/auth/lib/code-sent.ts)
(`recordCodeSent`, `resendAllowedAt`) and
[useCountdown.ts](../../src/hooks/useCountdown.ts) (counts down to a moment;
every auth page, for "send again" and for limits).

## Saying nothing about who has an account

If a page answered "no account with this address" or "this address is taken",
anyone could test a list of addresses and learn who uses the service
(*enumeration*). So:

- register always moves on to "enter the code", whether the address has an
  account or not; the right code signs in either way, and only then does
  verify say "You already have an account with this email";
- forgot-password always moves on to "enter the code", and the reset page
  says the code comes only *if* the address has an account, in the same
  words for every address (also when sending again);
- sign-in by code is "create an account" in other words: it always moves on
  to `/verify`;
- sign-in by password says "Incorrect email or password..." for a wrong
  password, an unknown address and an account without a password alike.

## Messages and languages

Every text is translated: the pages' texts in the `auth` namespace
(`src/i18n/locales/en/auth.json`, `vi/auth.json`), the API's error types in
the `api` namespace (`api.json`). Both languages must have exactly the same
keys; a test checks it (`src/i18n/__tests__/catalogues.test.ts`).

When the API gains a new error type, add a sentence for it under its type in
`api.json`, in every language. Without one, the person sees "Something went
wrong". More on translations: [../i18n.md](../i18n.md).

## Messages kept as keys

On every auth page, the language can be switched at the foot of the page
while a message is on screen. A message turned into words when it arrived
would stay in the old language. So these pages keep every message as a key
until it is shown ([form-problem.ts](../../src/features/auth/lib/form-problem.ts)):

- **`Message`** is `{ key, values? }`, the key with its namespace
  (`auth:...`, `api:...`).
- **zod messages are keys**: `z.string().min(1, 'auth:validation.emailRequired')`.
  `errors.email.message` is then a key.
- **`requestFailure(error)`** gives a `Message` for a refusal: the API's type
  in `api.json` when the catalogue has it, `auth:problems.offline` or
  `auth:problems.server` otherwise.
- **`useMessageText()`** returns a function that puts a `Message` into words
  in the language on screen. The component re-renders when the language
  changes, so the words follow it: `text({ key: errors.email.message })`,
  `text(problem.message)`.

The keys arrive at run time, so the compiler cannot check them;
`catalogues.test.ts` and each page's tests check the ones used. The delete
dialog still uses `authFormError`.
