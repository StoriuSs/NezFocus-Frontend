# End-to-end tests (Playwright)

`pnpm test:e2e` drives real Chromium and Firefox browsers through the app:
five tests, one per main flow. The suites have different needs:

| Suite | Needs | What it checks |
|---|---|---|
| `e2e/oauth.spec.ts` | This app and **the API with Google configured** (skipped otherwise) | "Continue with Google" on `/login`, pointing at the API with the page to return to; the API's redirect to Google with PKCE, the registered return address and the `oauth_state` cookie. Not the sign-in at Google itself, which needs a real Google account: that is a manual test |
| `e2e/mascot.spec.ts` | This app only | At 1440 × 900, Rive takes over from the mascot's still picture on `/login`, its WebAssembly from this site, with no page errors; with movement reduced, Rive is never loaded |
| `e2e/account.spec.ts` | This app, **the API**, and the **Mailpit** it sends email to | An account's whole life: create it on `/register` with only the email, type the code read from Mailpit on `/verify` (the address shown; the sixth digit sends it and signs in), then complete it on `/welcome` (any other page sends back there; a password missing two conditions refused; the time zone found by searching "tokyo"); a deep link coming back after sign-in; a reload keeping the session (the refresh cookie crossing origins); a forgotten password reset, which signs in (the old password refused after); the account deleted |

Any CSP violation or uncaught page error fails a run.

The browser tests are not in CI: they need the whole API
running, with its Mailpit.
Run them before a release, and after changing anything around sign-in, the
API client, the CSP or nginx. They create accounts, so run them against your
own development stack, not a live site.

## Running it

Once, to install the browsers:

```bash
pnpm exec playwright install chromium firefox
```

Start the API with its development stack (in the API repository):

```bash
pnpm docker:dev     # the API on :8888 by default, Postgres, Redis, Mailpit on :8025
```

What the API's `.env.development` needs (its `.env.example` already has the
first three):

| API setting | Why |
| --- | --- |
| `CORS_ORIGINS` includes `http://localhost:3001`, `CORS_CREDENTIALS=true` | The browser may call the API, and send the refresh cookie |
| `FRONTEND_URL=http://localhost:3001` | The return from Google (the OAuth suite) comes back to this app |
| `EMAIL_*` pointing at Mailpit | The codes are read from Mailpit. The API's development stack sets this up |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Only for the OAuth suite, which is skipped without them |
| Trusts one proxy hop | `asOwnClient()` gives each browser its own address with `X-Forwarded-For` ([below](#how-the-account-suite-avoids-the-apis-limits)). The API starter trusts one hop by default |

Then this app, and the tests.

**Against the dev server** (quickest, but no CSP):

```bash
pnpm dev          # http://localhost:3001
pnpm test:e2e
```

**Against the production image** (where the CSP and nginx apply — do this
before a release):

```bash
docker build --target prod -t react-starter:e2e .
docker run -d --name react-e2e -p 127.0.0.1:3001:8080 \
  -e VITE_API_URL=http://localhost:8888/api/v1 react-starter:e2e

pnpm test:e2e

docker rm -f react-e2e
```

## Options

| Variable | Default | Purpose |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:3001` | The app under test |
| `E2E_API_URL` | `http://localhost:8888/api/v1` | The API, for the account suite |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | Where the codes are read from |

Useful flags: `pnpm test:e2e --headed` shows the browsers,
`pnpm test:e2e --project=firefox` runs one browser, `pnpm test:e2e --ui` opens
Playwright's interactive runner. After a failure, screenshots and traces are in
`test-results/`; open a trace with `pnpm exec playwright show-trace <trace.zip>`.

## How the account suite avoids the API's limits

The API limits code emails, wrong codes and failed sign-ins per client
address (30 in 5 minutes each), and every test run comes from `127.0.0.1` —
a few runs in a row would be refused. So each browser gets an address of its own: `asOwnClient()` in
`e2e/helpers.ts` adds a random `X-Forwarded-For` to every request to the API,
which the API trusts from one proxy hop.

The limit per email address (one code email a minute) is met head-on instead:
the reset asks for an email within a minute of the sign-in code's, the page says "We've
sent several codes to this email in the past hour. Try again in N seconds.", and `submitPatiently()` waits that long
and submits again. That checks the message along the way. It is why that test
takes up to a minute.

Each run makes one account per browser (`e2e-chromium…@example.test`). The
account suite deletes its account at the end (that is its last test). One
left behind by a failed run is harmless in a development database, and the
`example.test` addresses make it easy to find.

## When it fails

| Message | Cause |
| --- | --- |
| `net::ERR_CONNECTION_REFUSED` | Nothing is serving the app at `E2E_BASE_URL` |
| `The API is not answering at …` | Start the API (`pnpm docker:dev` there) or set `E2E_API_URL` |
| `a "code to create" email to …` (or `a "Reset" email`) timed out | The API could not send mail: look at Mailpit, and at the `auth` queue on the API's `/admin/queues` |
| The reload test finds the user signed out | The refresh cookie is not coming back: the API's `CORS_ORIGINS` or `CORS_CREDENTIALS`, or cookies blocked ([auth/session.md](./auth/session.md)) |
| `port is already allocated` | Something else uses 3001; pick another and set `E2E_BASE_URL` |
| `CSP violation: …` | The policy blocks something the page needs. The directive and the blocked address are in the message; the policy is built by `scripts/csp.mjs` |
| The container exits at once | It was started without `VITE_API_URL`; `docker logs react-e2e` names it |

## Adding a test

Tests live in `e2e/`; shared helpers in `e2e/helpers.ts`:
`watchForProblems(page)` (collects CSP violations and page errors to assert on
at the end), `codeFromEmail()` (reads a code from Mailpit), `asOwnClient()`,
`openAccountMenuItem()`. Prefer role and label selectors
(`getByRole('button', { name: 'Sign in' })`) over CSS classes; they also keep
the accessibility labels honest.

Keep these suites to the few flows that must never break. Component behaviour
belongs in the Vitest tests ([testing.md](./testing.md)), which are much
faster.
