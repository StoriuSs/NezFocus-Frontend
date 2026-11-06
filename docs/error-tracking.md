# Error tracking

When the app breaks in a user's browser (a component that crashes while
rendering, a script error, a bug in a query), the error goes to
[Sentry](https://sentry.io). Nothing else would tell you: a browser's console
reaches no server you own. Sentry groups identical errors into one **issue**,
with the browser, the page, what the user did just before, the release it
appeared in, and the stack trace.

It is **off unless `VITE_SENTRY_DSN` is set** — in `.env.development` for
`pnpm dev`, and in the server's `.env.production` for the production
container, which reads it **when it starts** (it is not built into the
image). The SDK is a separate file (the `error-sdk` chunk, about 30 kB
gzipped) that the browser downloads only when a DSN is set: without one,
visitors download none of it. With one, `src/main.tsx` waits for that chunk
before the first render, so an error in the very first render is reported
too. If the chunk cannot load (a network blip, a content blocker), the app
starts anyway, without error tracking.

The step-by-step account and project setup is
[setup/sentry.md](./setup/sentry.md); this page is how the app uses it.

The backend has its own guide (Nest starter, `docs/error-tracking.md`). Both
report the signed-in user by the same id, so one person's frontend and
backend issues can be found together.

- [Setting it up](#setting-it-up)
- [Production](#production)
- [Readable stack traces (sourcemaps)](#readable-stack-traces-sourcemaps)
- [What is reported](#what-is-reported)
- [What is sent, and what is not](#what-is-sent-and-what-is-not)
- [Notifications](#notifications)
- [Ad blockers](#ad-blockers)
- [Tracing](#tracing)
- [Troubleshooting](#troubleshooting)

## Setting it up

1. At [sentry.io](https://sentry.io), create a project with platform
   **React**, and only **Error Monitoring**. One organization can hold this
   project and the backend's; the free plan's 5,000 errors a month are shared
   between them.
2. Copy the project's DSN (**Settings → Projects → your project → Client Keys
   (DSN)**) into `.env.development`:

   ```bash
   VITE_SENTRY_DSN=https://<key>@o<org>.ingest.us.sentry.io/<project>
   ```

   The DSN ends up in the JavaScript every visitor downloads. That is how it
   is meant to be used: it only allows sending events to this project, not
   reading anything.
3. Restart `pnpm dev` (Vite reads env files at start, and checks the DSN's
   shape: `https://<key>@<host>/<project>`).
4. Check it: open the app, then in the browser's developer console run

   ```js
   setTimeout(() => { throw new Error('Sentry test') })
   ```

   Within a minute the issue "Sentry test" appears in the project, under the
   `development` environment.

**Turning it off:** remove the line (or leave it empty) and restart
`pnpm dev`, or run `./deploy.sh` on the server. No rebuild either way.

## Production

`VITE_SENTRY_DSN` is a setting of the deployment, wherever the image was
built (on the server or by CI): put it in the server's `.env.production` and
run `./deploy.sh`. When the container starts, `nginx/40-runtime-config.sh`
writes it into `/config.js` and adds its host to the Content-Security-Policy
so the browser may send events there. The start-up log line says
`error tracking on (https://<host>)` or `error tracking off`.

Nothing else needs changing:

- **The release** is the commit `deploy.sh` deploys: `docker-compose.prod.yaml`
  passes `APP_TAG` to the container as `VITE_SENTRY_RELEASE`, which reaches
  the browser through `/config.js` too. Each issue shows the release it first
  appeared in.
- **The Content-Security-Policy** allows the DSN's host: `scripts/csp.mjs`
  leaves a placeholder at build time, and the start-up script fills it in.
  Without that, the browser would block every report.
- **The environment** is Vite's mode: `production` for the image.

## Readable stack traces (sourcemaps)

A production bundle is minified, so a stack trace reads
`at t (index-D7I3D5tE.js:1:40213)`. Sourcemaps turn that back into
`at ProfileForm (ProfileForm.tsx:42:7)`. They are uploaded to Sentry during the
image build, and never served: anyone could otherwise read the original
source.

Set all three for the build: in `.env.production` when the server builds, or
in GitHub when CI does ([ci.md](./ci.md), "Setting it up": `SENTRY_ORG` and
`SENTRY_PROJECT` as repository variables, the token as the repository secret
`SENTRY_AUTH_TOKEN`).

```bash
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=react-starter
SENTRY_AUTH_TOKEN=sntrys_...
```

- The org slug is in your Sentry URLs (`https://sentry.io/organizations/<slug>/`).
- The token: **Settings → Developer Settings → Organization Tokens → Create
  New Token**. It is shown once. Unlike the DSN, it **is** a secret.
- The token reaches the build as a
  [BuildKit secret](https://docs.docker.com/build/building/secrets/), not a
  build argument, so it is not kept in the image or its build history.

With the three set, `vite build` makes hidden sourcemaps (no
`sourceMappingURL` comment in the bundle), uploads them, and deletes them. The
image build then removes any `.map` file left over. Without them, the build
makes no sourcemaps at all.

The maps are filed under the release the build was given
(`VITE_SENTRY_RELEASE` as a build argument: `APP_TAG` from `deploy.sh`, or the
commit in CI). The running container reports the same commit, so Sentry
matches an event to its maps. This upload is the one part of error tracking
that happens at build time.

If the upload fails (a wrong token, Sentry unreachable), the build prints
`[sentry] Sourcemaps were NOT uploaded` and carries on: the deploy goes ahead,
and that release's stack traces stay minified.

Docker reuses a build step when only a secret changed. If you add the token
and deploy a commit that was already built, run `docker builder prune` first,
or the upload is skipped. In CI, the next commit's build uploads.

## What is reported

| Reported                                                                      | From                               |
| ----------------------------------------------------------------------------- | ---------------------------------- |
| A component that throws while rendering (caught by an error boundary or not) | React's root (`rootErrorHandlers`) |
| An uncaught error or an unhandled promise rejection                           | The SDK                            |
| An error thrown inside a query or mutation function, other than a request     | `src/lib/query-client.ts`          |

| Not reported                                                         | Why                                                                                                                                                  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A failed API request (4xx, 5xx, no response)                         | A 4xx or a network error isn't a bug in the app, and the backend reports its own 5xx.                                                               |
| "Failed to fetch dynamically imported module"                        | A tab opened before a deploy asks for chunk files that no longer exist. Every open tab would report it; the error screen asks the user to reload. |
| `ResizeObserver loop` warnings, errors from browser extensions       | Noise from the browser, not the app.                                                                                                                 |

**Limits.** An error in a loop, in one open tab, would otherwise send events
until the tab is closed. Each page load sends each error at most 5 times, then
once more every 5 minutes, and at most 30 events in total. The limits are at
the top of the "What is sent" part of `src/lib/error-tracking.ts`.

To report something yourself, where the app catches an error and carries on
but a person should still know:

```ts
import { reportError } from '@/lib/error-tracking'

reportError(error, { feature: 'avatar-crop' })
```

## What is sent, and what is not

- **The user as an id only**: their id from `/users/me` — set
  at sign-in and cleared at sign-out. Never the name or email. No IP address
  (`sendDefaultPii: false`). The backend reports the same id.
- **The page URL, without its fragment** (everything after `#` is dropped).
  Query parameters named like credentials are replaced by `[REDACTED]`: the
  fields below, plus `code`, `state` and `session_state`. Google's own `code`
  and `state` go to the API, not to this app — the app's `/auth/callback`
  only ever receives `redirect` and `error` — so this
  is a safety net.
- **Breadcrumbs**: what happened before the error, such as navigations,
  clicks (the element's tag, id, classes and a few attributes such as
  `aria-label`; not the text in it), console messages and requests (method,
  URL, status; no bodies). URLs in them are cleaned the same way.
- **Never the values of these fields**, wherever they appear in an event
  (headers, request data, extra data, breadcrumbs), compared without case,
  `-` or `_`: `Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`,
  `Idempotency-Key`, every password field (`password`, `currentPassword`,
  `newPassword`, …), every token (`token`, `accessToken`, `refreshToken`,
  `idToken`), and `secret`.
- **Sessions**: a small record at each page load and navigation, marked when
  an error happens in it. No page content. Not billed; they give each release
  a crash-free rate under **Releases**.

The rules are in `src/lib/error-tracking.ts` (`scrubEvent`), with tests in
`src/lib/__tests__/`. One of those runs the real SDK and checks what it would
send.

## Notifications

On the free plan Sentry notifies **by email only** (new issues, regressions).
Slack, Discord and other integrations need a paid plan. The backend's
Discord alerts don't cover browser errors, so keep the email notifications on.

## Ad blockers

Many ad blockers block requests to `*.sentry.io`, so some users' errors never
arrive. If that matters, Sentry's
[`tunnel` option](https://docs.sentry.io/platforms/javascript/troubleshooting/#using-the-tunnel-option)
sends events to your own domain, which forwards them. That means a `location`
in nginx that proxies to your Sentry ingest host, and `tunnel: '/monitoring'`
in `initErrorTracking`. It isn't set up here.

## Tracing

Only errors are sent; the frontend records no traces (timelines of page loads
and requests, split into steps with their durations). Sentry's
`browserTracingIntegration` would add them, and a larger bundle with it. The
backend can trace its side of each request; its `docs/error-tracking.md`,
"Tracing", explains what traces show next to metrics and logs, and when they
are worth turning on. For slow pages, the browser's own Performance panel and
Lighthouse come first.

## Troubleshooting

**Nothing arrives.**

1. **Is the DSN reaching the browser?** `curl https://app.example.com/config.js`
   — it should name `VITE_SENTRY_DSN`. That file is written when the
   container starts, from its environment, so a missing entry means
   `VITE_SENTRY_DSN` was not set for the container: set it in
   `.env.production` and run `./deploy.sh`. **Do not go looking in the
   bundle** — the DSN is not built into it, and grepping `assets/*.js` finds
   nothing whether error tracking is working or not. In the browser's network
   tab, a page load with error tracking on fetches an `error-sdk-….js` file.
2. **The console says "Error tracking is off: its script did not load."** The
   `error-sdk` chunk was blocked or failed to download (a content blocker, a
   network blip). The app runs without tracking until the next load.
3. The browser console shows `Refused to connect … Content Security Policy`:
   the policy is generated at container start from that same DSN, so the two
   have come apart. Restart the container. If it persists, check that
   `config.js` is served with `Cache-Control: no-store` — a cached copy is an
   old DSN against a new policy.
4. The request to `…ingest…sentry.io` is **attempted and blocked** in the
   network tab: an ad blocker (see above). Nothing you can change on the
   server fixes it; either accept the gap or use the `tunnel` option.
5. Sentry's issue list filters by environment: `development` and `production`
   are separate.
6. **No request is attempted at all**, and there is no CSP error: the event
   was dropped before it was sent. This is the usual answer, and it is almost
   always deliberate — a failed API request and a stale-chunk error are both
   on the not-reported list. See [What is reported](#what-is-reported). To
   test the path with something that cannot be dropped, throw a plain error
   from the console:

   ```js
   setTimeout(() => { throw new Error('sentry check') })
   ```

   `setTimeout`, not a bare `throw`: devtools catches an error thrown straight
   at the prompt, so it never reaches the handler that reports it.

**Stack traces are minified.** The sourcemaps weren't uploaded for that
release: look for `[sentry] Sourcemaps were NOT uploaded` in the build output,
check the three `SENTRY_*` values, and see the note on Docker's build cache
above.

**A test error is cluttering the list.** Resolve or delete the issue.
