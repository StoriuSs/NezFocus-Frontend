# Going to production

You have the site running locally and you want it on the internet. This page
is the route: what to do, in what order, with a link to the page that explains
each step. Nothing is explained twice, so follow the links.

- [What this half needs](#what-this-half-needs)
- [The first deploy](#the-first-deploy)
- [Once it is live](#once-it-is-live)
- [The checklist](#the-checklist)
- [Later, when it matters](#later-when-it-matters)

## What this half needs

The built site is static files served by nginx in a container. It is the
*cheap* half: it has no database, keeps no state, and will happily serve more
traffic than you are likely to send it.

What it does need:

- **A backend to talk to.** That is the API starter's side of the
  deployment; its `docs/deployment-guide.md` covers the server, and the same
  server can host this container.
- **A domain name**, with a DNS `A` record for the site — `app.example.com`,
  say — pointing at the server.
- **HTTPS.** Not optional: the API's refresh cookie is `Secure` in
  production, so a browser on plain `http` never stores it, and every reload
  signs everyone out.
- **The API told about the site** — `CORS_ORIGINS` and `FRONTEND_URL` on the
  API name `https://app.example.com` ([below](#the-api)).

If the API and the site are on the same server, this is one more container and
one more nginx vhost. The step-by-step version of this page, including the
services set up on the API's side, is
[setup/prepare-for-production.md](./setup/prepare-for-production.md).

## The first deploy

1. **[Prepare the server](./server.md)** if it is not already done — security
   updates, a firewall, SSH keys, fail2ban. Once per machine.

2. **Clone the repository onto the server** and create `.env.production` from
   `.env.example`. One setting is required and the container refuses to
   start without it:

   ```bash
   VITE_API_URL=https://api.example.com/api/v1
   ```

   It is **not** baked into the bundle — the container writes them into
   `/config.js` when it starts, so one image runs in every environment and
   changing an address needs a restart rather than a rebuild. See
   [environment.md](./environment.md).

3. **Put a reverse proxy in front.** The container publishes
   `127.0.0.1:8081` (`FRONTEND_PORT`); visitors arrive at 443 asking for a
   hostname.

   ```bash
   sudo ./nginx/bootstrap-nginx.sh \
       --frontend-domain app.example.com \
       --email you@example.com
   ```

   It installs nginx and certbot, writes the vhost, obtains a certificate and
   leaves the renewal timer running. **The DNS record has to resolve first** —
   Let's Encrypt proves you own the name by fetching a file over HTTP from it.

4. **Deploy.** `./deploy.sh` builds or pulls the image, starts the new
   release, waits for it to become healthy and rolls back by itself if it does
   not. See [deploy.md](./deploy.md).

5. **Tell the API about the site.** On the API: `CORS_ORIGINS` must include
   `https://app.example.com`, or every request from the browser is refused;
   `FRONTEND_URL` must be `https://app.example.com`, or the links in its
   emails and the return from Google go to the wrong place. The full list is
   under [The API](#the-api).

## Once it is live

Check these by hand the first time. All four are quick, and none of them is
covered by the tests that ran before the deploy:

| Check | Why |
| --- | --- |
| Sign in, reload the profile page, sign out | The whole auth path: the reload restores the session from the refresh cookie (`POST /auth/refresh`), which only works when the cookie crosses from the API to the site |
| Open `https://app.example.com/profile` directly, in a new tab | Deep links go through nginx's `try_files`, not the router |
| `curl -I https://app.example.com/config.js` | Must say `no-store`. Cached, it pins users to the old API |
| The browser console on first load | A Content-Security-Policy mistake shows up here and nowhere else |

The middle two — the deep link and the cache headers — are also checked under
load by `k6/spa.js`, which takes about a minute: see
[load-testing.md](./load-testing.md). Signing in and the console are yours.

Then:

- **[Error tracking](./error-tracking.md)** — optional, off unless you set a
  DSN, and the only way you will hear about an error in somebody else's
  browser.
- **An uptime check** from outside, on the site as well as the API.

## The checklist

Work through this on the day. If you have not yet renamed the starter for your
project, do that first: [making-it-yours.md](./making-it-yours.md).

### The environment file

Created **on the server**, from `.env.example`. In production these are read
when the **container starts**, not when the image was built, so getting one
wrong means a restart — not a rebuild ([environment.md](./environment.md)).

**The one the container refuses to start without:**

- [ ] `VITE_API_URL` — your API, **including** the `/api/v1` prefix. Without
      it every request 404s

**Everything here reaches the browser.** Anything named `VITE_*` is visible to
anyone who opens devtools, so:

- [ ] No secret behind a `VITE_` prefix. `SENTRY_AUTH_TOKEN` in particular has
      none, and must never get one

**The optional ones, decided rather than skipped:**

- [ ] `VITE_SENTRY_DSN` — a project of its own, not shared with staging.
      Read at container start. Empty: error tracking is off and the browser
      never downloads the SDK
- [ ] `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` — all three or none.
      Without them stack traces arrive minified and are close to useless
- [ ] `CSP_IMG_SRC` — only if avatars come from a bucket served over plain
      `http`. `https` is already allowed
- [ ] `FRONTEND_PORT` — only if `8081` is taken on the server

**If CI builds your images:**

- [ ] `DEPLOY_IMAGE_SOURCE=registry` and `DEPLOY_IMAGE` set to the published
      image
- [ ] The server can log in to the registry

**Then:**

- [ ] No unquoted `$` in any value — compose expands `$NAME` in env files
- [ ] `./deploy.sh` checks the required set before it changes anything; let it

### The API

These live on the other side, in the API's `.env.production`, and each fails
in a way that looks like a bug in this app. This app itself has no sign-in
settings ([environment.md](./environment.md#no-sign-in-settings-here)).

- [ ] The API's `CORS_ORIGINS` names your site (`https://app.example.com`),
      and `CORS_CREDENTIALS=true` — otherwise every request is refused, or
      the refresh cookie is never sent
- [ ] The API's `FRONTEND_URL` is your site — the links in its emails, and
      the return from Google (`/auth/callback`), go there
- [ ] The site and the API share a registrable domain (`app.example.com`,
      `api.example.com`), or the API sets `AUTH_COOKIE_SAMESITE=none`.
      Otherwise the browser drops the session cookie and everyone is signed
      out when the access token expires (15 minutes by default)
- [ ] The API can send email: a new account is confirmed with an emailed
      code, and a forgotten password is reset with one
- [ ] With Google sign-in: the redirect URI registered at Google is **the
      API's** (`https://api.example.com/api/v1/auth/google/callback`), not
      this site's
- [ ] With Turnstile: the widget's hostname list in Cloudflare includes your
      site's domain (`app.example.com`), or the widget refuses to load there

The API starter's `docs/setup/prepare-for-production.md` walks through each.

### The server

- [ ] Prepared ([server.md](./server.md)) — the API's half of the deployment
      usually covers this
- [ ] A DNS `A` record for the site, resolving **before** you run certbot
- [ ] nginx and a certificate:
      `sudo ./nginx/bootstrap-nginx.sh --frontend-domain app.example.com --email you@example.com`
- [ ] **HTTPS, not HTTP.** The API's refresh cookie is `Secure` in
      production; over plain `http` it is never stored, and a reload signs
      everyone out

### After the first deploy

Four quick checks, none of which any test before the deploy could have made:

- [ ] Sign in, reload the profile page, sign out
- [ ] Open `https://app.example.com/profile` directly in a new tab — deep
      links go through nginx's `try_files`, not the router
- [ ] `curl -I https://app.example.com/config.js` says
      **`Cache-Control: no-store`**. Cached, it pins users to the old API
- [ ] The browser console on first load is clean. A
      Content-Security-Policy mistake shows up here and nowhere else

The middle two are also checked under load by `k6/spa.js`
([load-testing.md](./load-testing.md)).

### Before you call it done

- [ ] A **rollback rehearsed** — `./deploy.sh --rollback` — while it is calm
- [ ] An **uptime check from outside**, on the site as well as the API
- [ ] **Error tracking seen working**: throw something from the console and
      watch the event arrive ([error-tracking.md](./error-tracking.md))
- [ ] The chunk sizes `pnpm build` prints are ones you are happy to send to a
      phone on mobile data

## Later, when it matters

| When | Do | Where |
| --- | --- | --- |
| Deploying by hand gets annoying | Turn on the **Deploy button** | [deploy.md](./deploy.md) |
| First load feels slow | Look at the chunk sizes `pnpm build` prints | [code-splitting.md](./code-splitting.md) |
| You want the sign-in path checked on every release | Run the **Playwright** suites against the **production image** on your machine, with the API's development stack. Not against the live site: the suites need Mailpit, refuse a real Turnstile key, and create accounts | [e2e-testing.md](./e2e-testing.md) |
| You need something this starter does not have | PWA, Storybook, analytics, feature flags | [extensions.md](./extensions.md) |

## Related

- [setup/prepare-for-production.md](./setup/prepare-for-production.md) — the same route as numbered steps, with every outside service
- [server.md](./server.md) — preparing the machine
- [deploy.md](./deploy.md) — releases, rollback, the Deploy button
- [docker.md](./docker.md) — the image, and why settings are not built into it
- [environment.md](./environment.md) — every setting, build-time and runtime
- [ci.md](./ci.md) — what runs on a push, and the published image
