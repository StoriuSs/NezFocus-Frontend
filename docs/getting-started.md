# Getting started

The short version, for someone who already has the API running. The full
walkthrough from a fresh machine — tools, the API first, this app, a first
sign-up — is [setup/prepare-for-development.md](./setup/prepare-for-development.md).

- [What you need](#what-you-need)
- [Run it](#run-it)
- [Sign up and sign in](#sign-up-and-sign-in)
- [If something does not work](#if-something-does-not-work)
- [Next](#next)

## What you need

- **Node 22** (`.nvmrc`). pnpm refuses to install on an older Node
  (`engines` in `package.json`, `engine-strict` in `.npmrc`).
- **pnpm**, at the version `packageManager` in `package.json` pins.
  `corepack enable` (Corepack ships with Node) gives you exactly that one.
- **The API running**: the paired
  [NestJS starter](https://github.com/StoriuSs/Nest-Hexagonal-No-Keycloak),
  started with its development stack (`pnpm docker:dev` there). That gives
  the API on http://localhost:8888, and **Mailpit** on http://localhost:8025,
  which catches every email the API sends. Signing up needs it: the
  confirmation code arrives by email.

## Run it

```bash
git clone https://github.com/StoriuSs/React-Starter-No-Keycloak.git
cd React-Starter-No-Keycloak
corepack enable
pnpm install

cp .env.example .env.development   # VITE_API_URL is already http://localhost:8888/api/v1
pnpm dev                           # http://localhost:3001
```

`VITE_API_URL` is the only required setting. `pnpm dev` refuses to start, and
names it, if it is missing or not a URL. Every setting:
[environment.md](./environment.md).

In Docker instead (hot reload through a bind mount): `pnpm docker:dev`, and
`pnpm docker:down` to stop it. Same address, same `.env.development`.

## Sign up and sign in

1. Open http://localhost:3001 → **Sign In** → **Sign up**. Enter an email and
   a password; the form ticks off the password rules as you type.
2. Open Mailpit (http://localhost:8025), find the "Verify" email, and enter
   its 6-digit code on the page. Confirming the address signs you in.
3. The first time, a prompt asks you to choose a username
   ([username-prompt.md](./username-prompt.md)).
4. The avatar menu (top right) has **Profile**, **Settings** (password,
   two-step sign-in, sign out everywhere) and **Log out**.

"Continue with Google" and the Turnstile widget appear only when the API has
them configured. Nothing in this app turns them on: see the API starter's
`docs/setup/google-sign-in.md` and `docs/setup/cloudflare-turnstile.md`.

How all of it works: [auth/README.md](./auth/README.md).

## If something does not work

| You see | Check |
|---|---|
| `pnpm dev` stops with "Missing or invalid environment variables" | `.env.development` exists and has `VITE_API_URL` |
| Every request fails; the console says "blocked by CORS policy" | The API's `CORS_ORIGINS` includes `http://localhost:3001` (its default) |
| No email in Mailpit | The API's development stack is running (`pnpm docker:dev` in the API); its `EMAIL_*` settings point at Mailpit |
| Signed in, but a reload signs you out | The API's `CORS_CREDENTIALS` is `true`, so the browser sends the refresh cookie |
| The link in an email opens the wrong site | The API's `FRONTEND_URL` is `http://localhost:3001` |

## Next

- [OVERVIEW.md](../OVERVIEW.md) — the tour
- [making-it-yours.md](./making-it-yours.md) — the renaming pass for a new project
- [project-structure.md](./project-structure.md) — adding a page or a feature
- [i18n.md](./i18n.md) — adding wording in both languages
- [testing.md](./testing.md) and [e2e-testing.md](./e2e-testing.md) — the tests
