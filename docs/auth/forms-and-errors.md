# Forms and errors

This page explains how the auth forms talk to the API: what they check before
sending, how a refusal becomes a message in the person's language, "too many
attempts", the Turnstile check, the password checklist, and the timers on
"send another code". Read it before changing a form or a message, or when a
form says something you do not understand.

- [How an auth form is built](#how-an-auth-form-is-built)
- [What a form checks before asking the API](#what-a-form-checks-before-asking-the-api)
- [Turning a refusal into a message](#turning-a-refusal-into-a-message)
- [Where each error shows](#where-each-error-shows)
- [The error types the auth pages meet](#the-error-types-the-auth-pages-meet)
- [Too many attempts (429)](#too-many-attempts-429)
- [Turnstile](#turnstile)
- [The password rules](#the-password-rules)
- ["Send another code" timers](#send-another-code-timers)
- [Saying nothing about who has an account](#saying-nothing-about-who-has-an-account)
- [Messages and languages](#messages-and-languages)

## How an auth form is built

Every auth form follows the same pattern:

1. **A react-hook-form form with a zod schema.** Shared field rules are in
   [schemas.ts](../../src/features/auth/lib/schemas.ts) (`authFields`,
   `newPasswordCheck`); each page builds its schema with the translation
   function, so the messages are in the chosen language.
2. **Fields through `FormField`** ([../shadcn-forms.md](../shadcn-forms.md)),
   which links the label, the input and its error for screen readers.
   Passwords use `PasswordInput`, with a button to show what was typed (long
   passwords are what the rules ask for, and typing one blind is where typos
   come from).
3. **The frame is `AuthCard`** ([AuthCard.tsx](../../src/features/auth/components/AuthCard.tsx)):
   a title, a subtitle, a `Notice` above the form (an error for the whole form,
   or a note from the previous step), the form, and links underneath.
4. **On submit**, a page for signing in (sign-in, sign-up, the codes, a new
   password) calls `authApi` or the store directly: what it does next is
   the session itself, which the store owns. The settings page and the
   delete dialog use a mutation hook from `api/` (`useChangePassword`,
   `useDisableTwoFactor`, …), as the users feature does, with `mutateAsync`;
   the hook refreshes what the page reads after a change, or when the API
   says the account changed in another tab. The button is disabled while the
   request is out.
5. **On a refusal**, the page calls `authFormError(error)`
   ([form-errors.ts](../../src/features/auth/lib/form-errors.ts)) and decides
   where to show what it returns ([below](#where-each-error-shows)).

Either way the app-wide "toast on every failed mutation" does not apply:
the settings hooks set `meta: { errorToast: false }`, and each form shows its
own error, once.

## What a form checks before asking the API

These checks give a faster answer. The API checks everything again.

| Field | Rule | Message |
|---|---|---|
| Email | a valid address | "Enter a valid email address" |
| Password, at sign-in | not empty (no rules: an old password may predate them) | "Enter your password" |
| A new password | every rule the browser knows ([below](#the-password-rules)) | "This password doesn't meet the rules below" |
| Confirm password | the same as the new one | "The passwords don't match" |
| Emailed code | 6 digits; spaces are ignored | "Enter the 6-digit code from the email" |
| Code from the app | 6 digits; spaces are ignored | "Enter the 6 digits the app shows" |
| Recovery code | 10 letters and digits, as `XXXXX-XXXXX`; the dash is optional, spaces ignored | "A recovery code looks like K7Q2M-X9HDP" |
| App code or recovery code (turning two-step off, deleting an account) | either shape | "Enter the 6 digits from the app, or a recovery code like K7Q2M-X9HDP" |

## Turning a refusal into a message

Every API refusal has the same shape (after the API client camelCases it):

```json
{
  "meta": { "code": "401001", "type": "AUTH_INVALID_CREDENTIALS", "message": "(English, for developers)", "requestId": "..." },
  "data": { "captchaRequired": true }
}
```

- `meta.type` names the error. The app shows its own sentence for it, from
  the `api` translations (`src/i18n/locales/<language>/api.json`). The API's
  `meta.message` is English, written for developers, and never shown.
- A type without a translation shows "Something went wrong". No answer at all
  shows "Can't reach the server. Check your connection and try again."
- `data` carries details: the broken password rules, the two-step challenge,
  the tries left, why a limit refused.

`authFormError(error)` reads all of it and returns:

| Field | Filled when | Used for |
|---|---|---|
| `message` | always | the sentence to show |
| `type` | the answer had an envelope | special cases on a page (`AUTH_EMAIL_NOT_VERIFIED`...) |
| `passwordRules` | `422 AUTH_PASSWORD_REJECTED`, from `data.rules` | the [checklist](#the-password-rules) |
| `challenge` | `403 AUTH_TWO_FACTOR_REQUIRED`, from `data.challenge` | the two-step page |
| `attemptsLeft` | `400 AUTH_TWO_FACTOR_CODE_INVALID` with `data.attempts_left`; the message becomes "That code isn't right. 2 tries left." | the two-step forms |
| `captchaRequired` | `data.captcha_required`, or `AUTH_CAPTCHA_REQUIRED` / `AUTH_CAPTCHA_FAILED` | showing Turnstile on sign-in |
| `retryAfterSeconds`, `rateLimitReason` | a `429` | [waiting](#too-many-attempts-429) |

## Where each error shows

| Shown as | For |
|---|---|
| A message above the form (`Notice`, read out by screen readers) | most refusals |
| A message under one field | a wrong current password (change password); a wrong or expired emailed code (set a password, delete the account); a wrong app code (turning two-step on, new recovery codes, turning it off); a wrong password or two-step code (delete the account) |
| The password checklist | `AUTH_PASSWORD_REJECTED`: the rules the API refused, including the ones only it checks |
| A move to another page | `AUTH_TWO_FACTOR_REQUIRED` (two-step page), `AUTH_EMAIL_NOT_VERIFIED` at sign-in (confirm page) |
| The form replaced by a message | the two-step page, once the challenge is used up or the account's wrong-code limit is reached |
| A toast (a small message in the corner) | successes ("Password changed..."), and sign-out reasons after a reload ([session.md](./session.md#why-a-session-ended-every-reason)) |

At sign-in, `AUTH_INVALID_CREDENTIALS` shows the page's own "Incorrect email
or password." When the API offers Google, a second line follows: "Signed up
with Google? Use Continue with Google below. To sign in with a password too,
choose one with Forgot your password." An account made with Google has no
password, so its owner trying one gets exactly this error. The hint is shown
to everyone after a wrong password, so it reveals nothing about which
accounts those are.

## The error types the auth pages meet

The API's full catalogue, with every route that can answer each type, is the
API starter's `docs/auth/api-reference.md`.

| Type | Status | Means | The app shows |
|---|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong password, no such account, or an account without a password | "Incorrect email or password." (sign-in's own text) |
| `AUTH_EMAIL_NOT_VERIFIED` | 403 | The password was right; the address is not confirmed | moves to `/verify-email` |
| `AUTH_TWO_FACTOR_REQUIRED` | 403 | The password was right; a second step is needed | moves to `/sign-in/two-step` |
| `AUTH_CODE_INVALID` | 400 | Wrong emailed code | "That code isn't right. If you asked for more than one, only the newest works." |
| `AUTH_CODE_EXPIRED` | 400 | The code is over 10 minutes old, or had 5 wrong tries | "This code no longer works: it expired, or had too many wrong tries. Ask for a new one." |
| `AUTH_PASSWORD_REJECTED` | 422 | The new password breaks a rule | the rules on the checklist |
| `AUTH_CURRENT_PASSWORD_INVALID` | 400 | Wrong current password | "Your current password is not right" (the delete dialog: "That password isn't right.") |
| `AUTH_TWO_FACTOR_CODE_INVALID` | 400 | Wrong code from the app, or a recovery code that does not work | "That code isn't right. N tries left." |
| `AUTH_TWO_FACTOR_CHALLENGE_EXPIRED` | 401 | The two-step challenge is over 5 minutes old, used, or out of tries | "This sign-in has expired. Sign in again." |
| `AUTH_TWO_FACTOR_ALREADY_ON` / `AUTH_TWO_FACTOR_NOT_ON` | 409 | Changed in another tab | the message; the settings section reloads its status |
| `AUTH_TWO_FACTOR_UNAVAILABLE` | 503 | The API cannot open this account's two-step secret | "Two-step verification can't be checked for this account right now. Contact support." |
| `AUTH_CAPTCHA_REQUIRED` / `AUTH_CAPTCHA_FAILED` | 400 | No Turnstile token, or Cloudflare refused it | "Complete the security check, then try again." / "The security check didn't pass. Try it again." |
| `AUTH_CAPTCHA_UNAVAILABLE` | 503 | The API could not reach Cloudflare. It refuses rather than let the form through unchecked | "The security check can't run right now. Try again in a minute." |
| `AUTH_PASSWORD_ALREADY_SET` | 409 | Setting a first password on an account that has one (set in another tab) | the message; settings reloads and shows "Change password" |
| `AUTH_USE_PASSWORD` | 409 | Asking for a deletion code on an account that has a password | the message; the dialog asks for the password instead |
| `AUTH_CONFIRMATION_REQUIRED` | 400 | Deleting without all the proof the account needs | "Confirm it's you first."; the dialog reloads what it needs |
| `RATE_LIMIT_EXCEEDED`, `THROTTLE_ERROR` | 429 | A limit refused | [below](#too-many-attempts-429) |
| `VALIDATION_ERROR` | 422 | A field the API refused (the form's own checks usually catch it first) | "Please check your input" |

## Too many attempts (429)

The API limits failed sign-ins, wrong codes and code emails, per address, per
account and per network. A refused request answers `429` with:

- a **`Retry-After` header**: the seconds to wait. The API lets the browser
  read this header across origins;
- **`data.reason`**: which kind of limit.

The app turns them into a sentence. The wait reads in seconds under 90
seconds, in minutes (rounded up) from there:

| `data.reason` | When | The message |
|---|---|---|
| `network` | Too many requests from one network (IP address): sign-ups, failed sign-ins, code emails, wrong codes | "Too many requests from your network. Try again in 42 seconds. On a shared connection, such as an office or a school, other people's requests count too." |
| `emails` | Codes emailed to one address: one a minute, five an hour | "We've already sent several emails to this address. Try again in 42 seconds." |
| `sign_ins` | Failed sign-ins for one address (5 per 15 minutes; 20 when Turnstile is on) | "Too many failed sign-ins for this address. Try again in 12 minutes, or choose a new password." |
| `wrong_codes` | Wrong two-step codes for one account: 5 per 15 minutes | "Too many wrong codes. Try again in 12 minutes." |
| `wrong_password` | Wrong current passwords (change password, delete account): 5 per 15 minutes | "Too many wrong passwords. Try again in 12 minutes." |
| none, header readable | The API's general per-route limit (`THROTTLE_LIMIT` per minute per network) | "Too many attempts. Try again in 42 seconds." |
| header not readable | | the type's catalogue text, e.g. "Too many attempts. Please wait and try again." |

Some buttons also stay disabled, counting down, for as long as the API asks:
"Send code" on forgot-password, "Send a new code" on the confirm page, "Email
me a code" when setting a first password or deleting an account. The two-step
page removes its form instead. Other forms show the message. The exact limits
are in the API starter's `docs/auth/rate-limits.md`.

## Turnstile

[Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) checks
that a person, not a script, is filling in a form. It usually solves itself in
a second or two; now and then it asks for a click.

**It is the API's setting.** With `TURNSTILE_SITE_KEY` and
`TURNSTILE_SECRET_KEY` set on the API, the API asks for it and hands this app
the site key (the public half) in `GET /auth/options`. This app has nothing to
configure. Setting it up: the API starter's `docs/setup/cloudflare-turnstile.md`
and `docs/auth/turnstile.md`.

**When each form asks** ([useTurnstile.tsx](../../src/features/auth/hooks/useTurnstile.tsx)):

| Form | When the widget shows |
|---|---|
| Sign-up | always, when the API has Turnstile on |
| Forgot password | always, when on |
| Sign-in | only once the API asks: after two failed sign-ins for the address or the network, its `401` carries `captcha_required`. From then on, for as long as the page is open. Most people never see it |
| Every other form | never |

If the API asks for a token the page did not know it needed (the options had
not loaded, or Turnstile was turned on since), the page reads
`GET /auth/options` again and draws the widget.

**Sending before it is solved** sends nothing, and says "Wait a moment for the
security check below to finish, then try again." (or, when the widget could
not load, "...Choose Try again under it.").

**A token works for one check.** After a refused attempt the form draws a
fresh widget, except when the API refused before looking at the token:

| Form | Fresh widget after a refusal? |
|---|---|
| Sign-in | always: the API checks Turnstile before the password |
| Sign-up | yes, except after `AUTH_PASSWORD_REJECTED` (the API checks the password first) and after a `429` (a limit refuses before Turnstile) |
| Forgot password | yes, except after a `429` |

**The widget** ([Turnstile.tsx](../../src/features/auth/components/Turnstile.tsx)):

- Cloudflare's script (`https://challenges.cloudflare.com/turnstile/v0/api.js`)
  is loaded only when a form shows a widget, once per page load. With
  Turnstile off, the app never contacts Cloudflare. A failed load is tried
  again by the next widget.
- It is drawn in the app's theme (dark or light, as it is when the widget
  appears) and in the app's language; changing the language redraws it.
- It fills the form's width (`size: 'flexible'`).
- Its element carries `data-testid="turnstile"` and `data-state`: `waiting`,
  `solved` or `failed`. The end-to-end tests wait for `solved`.
- A token that expires before the form is sent is dropped, and the widget
  goes back to `waiting`.
- When it cannot load (an ad blocker, a network that blocks Cloudflare, a site
  key that does not list this hostname): "The security check couldn't load.
  Check your connection, or allow challenges.cloudflare.com in your ad or
  tracker blocker, then try again.", with a **Try again** button. On sign-in
  and sign-up it adds "Or continue with Google below: it doesn't need this
  check." when Google is on.

**The Content-Security-Policy** (`scripts/csp.mjs`) always allows
`https://challenges.cloudflare.com`, for the script and the frame the widget
draws in, because only the API knows whether Turnstile is on.

**For development and the end-to-end tests**, run the API with Cloudflare's
test keys (they always pass, or always fail), or with Turnstile off. The
end-to-end suites refuse to run against a real site key
([../e2e-testing.md](../e2e-testing.md)).

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
| `matches_username` | not be the username | no: a new account has no username yet |
| `common` | not be a common password | no: the API's list is about 8,500 words, too big to send to every visitor |

Characters are counted as the API counts them (one per character, even for
characters JavaScript stores as two units), and letters of any alphabet count
as letters.

**The checklist** ([PasswordChecklist.tsx](../../src/features/auth/components/PasswordChecklist.tsx))
ticks off the first five rules as they are met. Underneath, in red, it lists:
`matches_email` while it is broken, `max_length` while it is broken, and the
rules the API refused on the last attempt (`common`, `matches_username`),
until the password is edited. A refusal is never shown as a vague "invalid
password".

**Checked against which address:** the one typed on sign-up and reset, the
account's own in settings. The API also checks the username, on reset, change
and set.

**Changing a rule:** change it on the API first, then `password-rules.ts`
and the texts in `auth.json`
(`passwordRules`) in every language. If the two disagree, the API wins: a
password the checklist accepted is refused, and the refusal shows the rule.

## "Send another code" timers

The API sends at most one code email a minute to an address. The pages wait
too: it saves a refused request, and the disabled button says why
("Send a new code in 42 s"). The wait counts from when the last code really
went out, so a reload, or a step to another page and back, does not start a
fresh minute (or none).

| Button | Remembers the send in | Set by |
|---|---|---|
| "Send a new code" on `/verify-email` | `sessionStorage`, `auth:code-sent:email-verify:<address>` | sign-up, and this button |
| "Send code" on `/forgot-password` | `sessionStorage`, `auth:code-sent:password-reset:<address>` | this button |
| "Send another code" on `/reset-password` | the same key | forgot-password |
| "Email me a code" when setting a first password | `sessionStorage`, `auth:password-set-code-sent` (the address and the time) | this button |
| "Email me a code" in the delete-account dialog | memory only | this button |

`sessionStorage` belongs to the tab: another tab starts without the record,
and the API's own limit still applies there. After a `429`, the button waits
as long as `Retry-After` says instead.

When setting a first password, the record does more: for 10 minutes (as long
as the code works) a reload reopens the code form, and "I already have a code"
opens it without sending another, which would replace the one in the inbox.

The pieces: [code-sent.ts](../../src/features/auth/lib/code-sent.ts) and
[useResendCooldown.ts](../../src/features/auth/hooks/useResendCooldown.ts).

## Saying nothing about who has an account

If a page answered "no account with this address" or "this address is taken",
anyone could test a list of addresses and learn who uses the service
(*enumeration*). So:

- sign-up always moves on to "enter the code"; the owner of a taken address
  gets an email saying how to sign in;
- forgot-password always moves on to "enter the code";
- "Send a new code" says "If this address has an account, a new email is on
  its way.";
- sign-in says "Incorrect email or password." for a wrong password and an
  unknown address alike.

## Messages and languages

Every text is translated: the pages' texts in the `auth` namespace
(`src/i18n/locales/en/auth.json`, `vi/auth.json`), the API's error types in
the `api` namespace (`api.json`). Both languages must have exactly the same
keys; a test checks it (`src/i18n/__tests__/catalogues.test.ts`).

When the API gains a new error type, add a sentence for it under its type in
`api.json`, in every language. Without one, the person sees "Something went
wrong". More on translations: [../i18n.md](../i18n.md).
