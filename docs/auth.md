# Authentication

The sign-in documentation now lives in its own folder:
**[auth/README.md](./auth/README.md)**. Start there.

| Looking for | Now in |
|---|---|
| What the app does for sign-in, and what it leaves to the API | [auth/README.md](./auth/README.md) |
| Every auth page, `?redirect=`, Google | [auth/pages-and-flows.md](./auth/pages-and-flows.md) |
| The access token, refreshing, tabs, signing out and why | [auth/session.md](./auth/session.md) |
| Form checks, error messages, "too many attempts", password rules | [auth/forms-and-errors.md](./auth/forms-and-errors.md) |
| Settings: password, sign out everywhere, deleting the account | [auth/account-settings.md](./auth/account-settings.md) |
| The files, guards, store and tests | [auth/in-the-code.md](./auth/in-the-code.md) |
| The username step after a first sign-in | [username-prompt.md](./username-prompt.md) |

The sections other pages link to:

## When the API ends a session

See [auth/session.md](./auth/session.md#how-the-api-client-handles-answers)
for what the API client does with each refused request, and
[auth/session.md](./auth/session.md#why-a-session-ended-every-reason) for
every sign-out reason, its message and where it lands.

## Deploying: what sign-in needs

See [auth/README.md](./auth/README.md#what-the-api-must-have).

## Where it lives in the code

See [auth/in-the-code.md](./auth/in-the-code.md).

## Tests

See [auth/in-the-code.md](./auth/in-the-code.md#tests). Signing in *at*
Google is a manual test: the steps are there too.

## Troubleshooting

See [auth/README.md](./auth/README.md#troubleshooting).
