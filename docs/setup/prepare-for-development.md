# Prepare for development

This page takes you from a machine with nothing installed to the web app
running at `http://localhost:3001`, talking to the API on your machine, with a
first account signed in. Then it shows how to run the tests.

Do the steps in order. Each one ends with "You are done when ...": check that
before moving on. Plan about an hour, most of it for the API in step 2.

- [Step 1: Install the tools](#step-1-install-the-tools)
- [Step 2: Get the API running](#step-2-get-the-api-running)
- [Step 3: Get the code and install the packages](#step-3-get-the-code-and-install-the-packages)
- [Step 4: Create .env.development](#step-4-create-envdevelopment)
- [Step 5: Start the web app](#step-5-start-the-web-app)
- [Step 6: Make your first account](#step-6-make-your-first-account)
- [Step 7 (optional): Google and avatar storage](#step-7-optional-google-and-avatar-storage)
- [Step 8 (optional): Error tracking](#step-8-optional-error-tracking)
- [Step 9: Run the checks](#step-9-run-the-checks)
- [Step 10: Run the end-to-end tests](#step-10-run-the-end-to-end-tests)
- [Common mistakes](#common-mistakes)
- [Where to go next](#where-to-go-next)

## The ports on your machine

Everything listens on `127.0.0.1` only, so nothing is reachable from the
network.

| Port | What | Started by |
|---|---|---|
| `3001` | This web app (Vite's dev server) | `pnpm dev` or `pnpm docker:dev` here |
| `8888` | The API | `pnpm docker:dev` in the API |
| `8025` | Mailpit: the inbox that catches every email the API sends | `pnpm docker:dev` in the API |
| `3002` | The API's Grafana (if you use it) | `pnpm docker:dev` in the API |

## Step 1: Install the tools

You need four things. If you already have one, run its check and skip it.

1. **Git.** Download it from https://git-scm.com/downloads and install it with
   the defaults.
   Check: `git --version` prints a version.

2. **Node.js 22.** The project says which major version it uses in `.nvmrc`
   (`22`), and refuses to install with an older one (`engine-strict` in
   `.npmrc`). The easiest way to get it is a version manager:
   - macOS or Linux, with [nvm](https://github.com/nvm-sh/nvm): after cloning
     (step 3), run `nvm install` in the project folder. It reads `.nvmrc`.
   - Windows, with [nvm-windows](https://github.com/coreybutler/nvm-windows):
     `nvm install 22`, then `nvm use 22`.
   - Or download the "22.x LTS" installer from https://nodejs.org.

   Check: `node -v` prints `v22.` followed by anything.

3. **pnpm**, through Corepack (a tool that comes with Node 22 and installs the
   exact pnpm version a project asks for):

   ```bash
   corepack enable
   ```

   On Windows, if this fails with "permission denied", open the terminal as
   administrator once and run it again.
   The project pins pnpm `10.34.5` in `package.json` (`packageManager`).
   Corepack downloads that version the first time you run `pnpm` inside the
   project folder; if it asks "Do you want to continue?", answer `Y`.
   Check (inside the project folder, after step 3): `pnpm -v` prints `10.34.5`.

4. **Docker.** The API runs its database, Redis and Mailpit in containers.
   Install Docker Desktop from https://www.docker.com/products/docker-desktop/
   (on Linux, Docker Engine with the compose plugin), and start it.
   Check: `docker compose version` prints a version, and `docker ps` prints a
   table (even an empty one) rather than an error.

**You are done when** `git --version`, `node -v` (v22), `corepack --version`
and `docker ps` all answer without an error.

## Step 2: Get the API running

The web app has no sign-in of its own: every form calls the API. Without the
API, the pages load but every sign-in fails.

1. Clone the API starter (`Nest-Hexagonal-No-Keycloak`) next to this one.
2. Follow its `docs/setup/prepare-for-development.md` up to the point where its
   development stack runs (`pnpm docker:dev` in the API's folder).
3. Keep these two values in the **API's** `.env.development` as its
   `.env.example` has them. They name this web app:

   ```bash
   FRONTEND_URL=http://localhost:3001    # links in emails point here
   CORS_ORIGINS=http://localhost:3001    # the API answers the browser only from here
   ```

   Why: the browser sends the sign-in cookie to the API only from an address
   listed in `CORS_ORIGINS`. If the web app ran on another port, every sign-in
   would end the moment you reload.

**You are done when** both of these work:

- `http://localhost:8888/api/v1/health/live` opens in the browser and answers
  with a small JSON body (or `curl http://localhost:8888/api/v1/health/live`
  does).
- `http://localhost:8025` opens Mailpit's inbox (empty for now).

## Step 3: Get the code and install the packages

```bash
git clone <your repository URL> react-app
cd react-app
pnpm install
```

`pnpm install` downloads the packages and sets up the git hooks (Husky), which
check your code before each commit ([../git-hooks.md](../git-hooks.md)).

**You are done when** `pnpm install` ends without a red `ERR_` line, and
`pnpm -v` in this folder prints `10.34.5`.

## Step 4: Create .env.development

Your settings for development live in `.env.development`, which git ignores.
Make it from the template:

```bash
cp .env.example .env.development                 # macOS, Linux, Git Bash
Copy-Item .env.example .env.development          # Windows PowerShell
```

Open it. Only one line matters for now:

| Setting | Value in development | Why |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8888/api/v1` (already there) | Where the API is. Include `/api/v1`. Change the port only if you changed the API's `PORT`. |
| `VITE_SENTRY_DSN` | Leave empty | Error tracking, step 8 |
| `VITE_SENTRY_RELEASE` | Leave it commented out | Set by the production build |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Leave them commented out | Only the production build uploads sourcemaps |
| `CSP_IMG_SRC`, `FRONTEND_PORT`, `DEPLOY_*` | Leave as they are | Read only by the production container and `deploy.sh` |

Every `VITE_*` value ends up in the JavaScript the browser downloads, so
anyone can read it. Never put a secret in a `VITE_*` setting.

**You are done when** `.env.development` exists and its `VITE_API_URL` points
at the API from step 2.

## Step 5: Start the web app

Pick one way. Both serve the app at `http://localhost:3001` and reload the page
when you save a file.

**On your machine (quickest):**

```bash
pnpm dev
```

**In Docker** (if you would rather not install Node, or want the same setup as
a teammate):

```bash
pnpm docker:dev                              # build and start, in the background
docker logs -f nezfocus-web-frontend-dev        # watch its output; Ctrl-C stops watching
pnpm docker:down                             # stop it
```

Vite checks your settings when it starts. If `VITE_API_URL` is missing or is
not a URL, it stops with `Missing or invalid environment variables for mode
"development"` and names the setting. Fix `.env.development` and start again.

**You are done when** `http://localhost:3001` shows the sign-in page, and the
browser's developer console (F12, "Console" tab) shows no red error.

## Step 6: Make your first account

This checks the whole chain: the web app, the API, its database and its email.

1. On `http://localhost:3001` (it opens the sign-in page), click **Create
   one**.
2. Type an email address (any address: in development the email never leaves
   your machine, it lands in Mailpit) and a password, twice. The checklist
   under the password ticks off the API's rules as you type. A very common
   password such as `Password1!` passes the checklist but is refused by the
   API: that is on purpose.
3. Click **Create account**. The page changes to "check your email" and shows
   the address.
4. Open Mailpit at `http://localhost:8025`. Open the newest email (its subject
   contains "Verify") and copy the 6-digit code.
5. Back in the app, type the code in **Code** and click **Confirm**. You are
   signed in, and a toast says "Your email is confirmed. Welcome!".
6. A window asks you to **Choose your username**. Type one and click
   **Confirm Username**.
7. Reload the page (F5).

**You are done when**, after the reload, you are still signed in: you stay
on the app, with your avatar at the foot of the rail, not sent to the
sign-in page. This proves the refresh cookie travels
between `localhost:3001` and `localhost:8888`.

If no email arrives, the problem is on the API: see its
`docs/setup/email.md` and its Mailpit section. To make yourself an admin, the
API has a command for it: see its `docs/auth/accounts.md`.

## Step 7 (optional): Google and avatar storage

Both are switched on **in the API's env file**, never here. The web app
asks the API what is on (`GET /api/v1/auth/options`) every time a sign-in page
opens, so after you restart the API they simply appear.

| Feature | Set up on the API with | What you then see here |
|---|---|---|
| Sign in with Google | The API starter's `docs/setup/google-sign-in.md` (a development OAuth client whose redirect URI is `http://localhost:8888/api/v1/auth/google/callback`) | "Continue with Google" on the sign-in and sign-up pages |
| Avatars in S3-style storage | The API starter's `docs/setup/storage-s3-r2.md` (locally: its RustFS container) | Nothing different: the avatar shows as before. In development there is no Content-Security-Policy, so an `http://localhost:9100` bucket works without `CSP_IMG_SRC` |

**You are done when** the feature you turned on shows up after a reload of the
sign-in page. If it does not, open
`http://localhost:8888/api/v1/auth/options`: `providers` should list `google`.
If it doesn't, the API did not
pick up its new settings: restart it.

## Step 8 (optional): Error tracking

Sentry collects errors that happen in the browser. Follow
[sentry.md](./sentry.md) to make the web project, then put its DSN in
`.env.development`:

```bash
VITE_SENTRY_DSN=https://<key>@<something>.ingest.us.sentry.io/<project number>
```

Restart `pnpm dev` (Vite reads env files only when it starts).

**You are done when** the test error in [sentry.md](./sentry.md#check-it-works)
appears in Sentry under the `development` environment. To save your free
quota, you can empty the line again afterwards.

## Step 9: Run the checks

These are the same checks GitHub runs on every push ([../ci.md](../ci.md)):

```bash
pnpm lint            # code mistakes ESLint can spot
pnpm format:check    # layout (pnpm format fixes it)
pnpm test            # unit tests (Vitest)
pnpm build           # type-check everything and build the production files
```

`pnpm build` needs no settings: the production files hold no addresses (the
container adds them when it starts, see [../deploy.md](../deploy.md)).

**You are done when** all four end without an error. `pnpm test` ends with a
line like `Tests  NNN passed`.

## Step 10: Run the end-to-end tests

The end-to-end tests drive real Chrome and Firefox browsers through the app
([../e2e-testing.md](../e2e-testing.md)). They are not run by CI because they
need the whole API, so run them yourself before a release and after
changing anything around sign-in.

**What they need:**

| Suite | Needs |
|---|---|
| `e2e/account.spec.ts` | This app, the API on `8888`, and Mailpit on `8025` (it reads the codes from there) |
| `e2e/oauth.spec.ts` | The API with Google set up (step 7). Skipped when the API does not offer Google |

And on the API's side:

- `CORS_ORIGINS` containing `http://localhost:3001` (the default).

**Run them:**

1. Once, install the browsers:

   ```bash
   pnpm exec playwright install chromium firefox
   ```

2. Make sure the API (step 2) and this app (`pnpm dev`) are running.
3. Run:

   ```bash
   pnpm test:e2e             # every suite, both browsers
   ```

If something runs on other addresses, tell the tests:

| Variable | Default | Meaning |
|---|---|---|
| `E2E_BASE_URL` | `http://localhost:3001` | The web app under test |
| `E2E_API_URL` | `http://localhost:8888/api/v1` | The API |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | Mailpit, where the codes are read |

For example `E2E_BASE_URL=http://localhost:8081 pnpm test:e2e` in bash
(PowerShell: `$env:E2E_BASE_URL = "http://localhost:8081"; pnpm test:e2e`).
Running them against the production image, where the Content-Security-Policy
applies, is described in [../e2e-testing.md](../e2e-testing.md#running-it).

**You are done when** the run ends with every test passed (the oauth suite may
say "skipped" if you have no Google keys). Each run makes test accounts with
`@example.test` addresses in your local API.

## Common mistakes

| What you see | Cause | Fix |
|---|---|---|
| `pnpm install` says `Unsupported engine` | Node older than 22 | Step 1: install Node 22 and open a new terminal |
| `pnpm -v` prints another version than `10.34.5` | You ran it outside the project folder, or Corepack is not enabled | `corepack enable`, then run `pnpm` inside the folder |
| `pnpm dev` stops with `Missing or invalid environment variables` | No `.env.development`, or `VITE_API_URL` is empty or not a URL | Step 4 |
| Every form says "Can't reach the server" | The API is not running, or `VITE_API_URL` has the wrong port or is missing `/api/v1` | Step 2's check, then compare with `VITE_API_URL` |
| The browser console shows a CORS error on every API call | The API's `CORS_ORIGINS` does not contain `http://localhost:3001` exactly | Fix it in the API's `.env.development` and restart the API |
| You are signed out after a reload | The refresh cookie did not come back: usually the same `CORS_ORIGINS` problem, or you opened the app as `http://127.0.0.1:3001` instead of `http://localhost:3001` (a different origin for the browser) | Use `http://localhost:3001` |
| No email in Mailpit | The API cannot reach Mailpit, or its email queue is stuck | The API starter's `docs/setup/email.md` |
| The Google button does not appear | The API has no keys for it, or was not restarted | Step 7's check |
| `pnpm test` fails in many React tests with odd errors | Your shell sets `NODE_ENV=production` (some setups do) | Run `unset NODE_ENV` (bash) or `Remove-Item Env:NODE_ENV` (PowerShell) first |
| `pnpm docker:dev` says `port is already allocated` | `pnpm dev` (or something else) already uses 3001 | Stop the other one |
| Changes don't show up with `pnpm docker:dev` | You added a dependency: the container still has the old `node_modules` | Run `pnpm docker:dev` again; it rebuilds and refreshes them |

## Where to go next

- How sign-in works in the web app: [../auth/README.md](../auth/README.md).
- Every setting: [../environment.md](../environment.md).
- Keeping the generated API types in step with the API:
  [../api-types.md](../api-types.md).
- Putting it online: [prepare-for-production.md](./prepare-for-production.md).
