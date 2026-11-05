# Environment configuration

Every setting this repository reads, where it is read, and **when**. The
"when" is the part worth understanding: most settings are read when the
production container **starts**, not when the app is built, which is the
opposite of what Vite does by default.

One setting is required (`VITE_API_URL`). Everything else is optional.

- [The files](#the-files)
- [Build, container start, or tooling?](#build-container-start-or-tooling)
- [No sign-in settings here](#no-sign-in-settings-here)
- [The reference](#the-reference)
- [Validation](#validation)
- [Things that will catch you out](#things-that-will-catch-you-out)
- [Adding a variable](#adding-a-variable)

## The files

```
.env.example        ← committed. The template, with a comment per setting
.env.development    ← gitignored. Yours: read by Vite (pnpm dev) and by pnpm docker:dev
.env.production     ← gitignored. Created on the server: read by docker compose and deploy.sh
```

```bash
cp .env.example .env.development
```

`.dockerignore` keeps every `.env*` file except the example out of the image
build, so no env file is ever baked into a layer.

Anything named `VITE_*` that the app reads ends up in the browser — in the
bundle in development, in `/config.js` in production. **Anyone can read it in
devtools**, so never put a secret behind that prefix.

## Build, container start, or tooling?

Vite normally inlines `VITE_*` values into the JavaScript when it builds. That
would mean one image per environment, and a rebuild every time an address
changes. **This starter keeps them out of the bundle**:

| Kind | Read when | How |
| --- | --- | --- |
| **The app's settings** — the API address, error tracking's DSN and release | Every time the **container starts** | `nginx/40-runtime-config.sh` writes them into `/config.js` as `window.__APP_CONFIG__`; `index.html` loads it before the app; `src/config/env.ts` reads it |
| **The deployment's settings** — host port, extra image origins for the CSP, which image to run | When **docker compose** and **`deploy.sh`** run on the server | Read from `.env.production` (`--env-file`) |
| **Build values** — the sourcemap upload | When the **image is built** (`vite build` inside the Dockerfile) | Docker build args and a BuildKit secret |
| **Tooling** — tests, load test, type generation, CI scripts | When you run that tool | Shell environment variables, or GitHub repository settings |

So in production:

- **One image runs everywhere.** The image CI publishes from `main` is the
  image that runs in staging and in production. `vite build` checks no
  settings and the image holds none.
- **Changing a setting needs `./deploy.sh` (or a container restart), not a
  new image.**
- **A missing `VITE_API_URL` stops the container**, naming it. A site that
  loads and cannot reach its API is a worse failure than one that does not
  start.
- The **Content-Security-Policy is filled in at the same moment**, from the
  same values, so it names exactly the API and Sentry origins this
  deployment uses.

In development none of that applies: `pnpm dev` reads `.env.development` the
ordinary Vite way, and `public/config.js` is an empty placeholder. Where both
exist, the container's value wins, and an empty one counts as unset.

## No sign-in settings here

The app has **no sign-in settings**. Google sign-in is configured on the API
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` in the API starter). This app asks
the API what is on (`GET /auth/options`: the providers to offer as buttons)
and shows the matching buttons. To turn it on, see the API starter's
`docs/setup/google-sign-in.md`.

What the API must know about this app is set on the API too: `CORS_ORIGINS`
(this app's address, with `CORS_CREDENTIALS=true`) and `FRONTEND_URL` (where
email links and the return from Google go). See
[setup/prepare-for-production.md](./setup/prepare-for-production.md).

## The reference

`.env.example` carries a comment beside each of the file settings.

### The app's settings — read at container start

In development they come from `.env.development` instead.

| Variable | Required | Read by | What it is |
| --- | --- | --- | --- |
| `VITE_API_URL` | **yes** | `src/config/env.ts` (via `/config.js`); checked by `nginx/40-runtime-config.sh`, `deploy.sh` and compose | The API base **including the version prefix**: `https://api.example.com/api/v1`. Development: `http://localhost:8888/api/v1`. A trailing `/` is dropped |
| `VITE_SENTRY_DSN` | no | `src/config/env.ts` (via `/config.js`); its host goes into the CSP | A Sentry project's DSN. Empty: error tracking is off, and the browser never downloads the SDK. Set: the SDK is loaded as its own chunk before the first render. It is public by design: it can only send events. See [error-tracking.md](./error-tracking.md) |
| `VITE_SENTRY_RELEASE` | no — **don't set it** | `src/config/env.ts` (via `/config.js`) | The release errors are filed under. `docker-compose.prod.yaml` sets it from `APP_TAG`, the commit `deploy.sh` deploys, both for the running container and as a build arg (below) |

### The deployment's settings — read by compose and `deploy.sh`

| Variable | Default | Read by | What it is |
| --- | --- | --- | --- |
| `CSP_IMG_SRC` | empty | `nginx/40-runtime-config.sh` (container start) | Extra origins avatars may load from, space-separated. Only for a bucket served over plain `http` (local RustFS, say): images from the API and from any `https://` host are already allowed |
| `FRONTEND_PORT` | `8081` | `docker-compose.prod.yaml` | The host port the container is published on, always bound to `127.0.0.1` for the host's nginx to proxy to. Inside the container nginx listens on 8080 |
| `DEPLOY_IMAGE_SOURCE` | `build` | `deploy.sh` | `build`: the server builds the image. `registry`: it pulls the one CI published for the commit ([deploy.md](./deploy.md)) |
| `DEPLOY_IMAGE` | `react-starter-auth-prod-app` | `deploy.sh`, `docker-compose.prod.yaml` (image name) | The image name, without a tag. In `registry` mode the registry path, lowercase: `ghcr.io/<owner>/<repository>` |
| `DEPLOY_KEEP_IMAGES` | `3` | `deploy.sh` | Releases whose images stay on the server, the live one included (2 or more in `build` mode) |
| `DEPLOY_HEALTH_TIMEOUT` | `120` | `deploy.sh` | Seconds to wait for a new release to become healthy before rolling back |
| `APP_TAG` | set by `deploy.sh` | `docker-compose.prod.yaml` | The 12-character commit being deployed: the image tag, and the Sentry release. **Not** for the env file; `deploy.sh` sets it on each run (`latest` when you run compose by hand) |

### Build values — read when the image is built

| Variable | Where it comes from | What it is |
| --- | --- | --- |
| `VITE_SENTRY_RELEASE` (build arg) | `APP_TAG` (compose), the commit (CI) | The release name the sourcemaps are uploaded under (`vite.config.ts`), matching the one the browser reports |
| `SENTRY_ORG`, `SENTRY_PROJECT` | `.env.production` when the server builds; repository **variables** when CI builds | Where the sourcemaps go. All three of these, or none |
| `SENTRY_AUTH_TOKEN` | `.env.production` when the server builds; the repository **secret** when CI builds | A Sentry organization token, a real secret: passed as a BuildKit secret (`sentry_auth_token`), never a build arg, so it stays out of the image and its history. No `VITE_` prefix, ever |

Without the three, the build makes no sourcemaps at all. Details:
[error-tracking.md](./error-tracking.md#readable-stack-traces-sourcemaps).

### Development only

| Variable | Where | What it is |
| --- | --- | --- |
| `CHOKIDAR_USEPOLLING` | Hard-set to `true` in `docker-compose.dev.yaml` | Makes Vite's file watcher poll inside the dev container, because Docker Desktop's bind mounts raise no file events. Not in any env file; `pnpm dev` on the host keeps event-based watching |

### Tooling — read when you run the tool

| Variable | Default | Read by | Documented in |
| --- | --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:3001` | `playwright.config.ts` | [e2e-testing.md](./e2e-testing.md#options) |
| `E2E_API_URL` | `http://localhost:8888/api/v1` | `e2e/helpers.ts` | [e2e-testing.md](./e2e-testing.md#options) |
| `E2E_MAILPIT_URL` | `http://localhost:8025` | `e2e/helpers.ts` | [e2e-testing.md](./e2e-testing.md#options) |
| `CI` | unset | `playwright.config.ts` | Set by CI systems: fails on a stray `test.only`, adds the HTML report |
| `APP_URL` | `http://localhost:8080` | `k6/spa.js` | [load-testing.md](./load-testing.md#running-it) |
| `RATE`, `DURATION`, `BUDGET_MS` | `50`, `1m`, `200` | `k6/spa.js` | [load-testing.md](./load-testing.md#running-it) |
| `OPENAPI_SPEC` | `http://localhost:8888/api-docs-json` | `scripts/generate-api-types.mjs` | [api-types.md](./api-types.md#commands) |
| `SMOKE_TIMEOUT` | `60` | `scripts/smoke-image.sh` | Seconds CI's image check waits for nginx to answer |
| `PULL_ATTEMPTS` | `4` | `scripts/pull-images.sh` | How often CI tries to pull an image before failing |

### GitHub repository settings

Read by the workflows, never by the app. **Settings → Secrets and variables →
Actions** in the repository:

| Name | Kind | Workflow | Documented in |
| --- | --- | --- | --- |
| `SENTRY_ORG`, `SENTRY_PROJECT` | variables | `ci.yml` (image build) | [ci.md](./ci.md#setting-it-up-error-tracking-optional) |
| `SENTRY_AUTH_TOKEN` | secret | `ci.yml` (image build) | [ci.md](./ci.md#setting-it-up-error-tracking-optional) |
| `DEPLOY_SSH_KEY` | secret | `deploy.yml` | [deploy.md](./deploy.md#the-deploy-button) |
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_HOST_KEY` | variables | `deploy.yml` | [deploy.md](./deploy.md#the-deploy-button) |

### Vite's own

`import.meta.env.MODE` (`development` or `production`) and
`import.meta.env.DEV` are Vite's, not settings: error tracking files events
under `MODE` as the environment, and the error screens show the error's
details only when `DEV` is true.

## Validation

Every `VITE_*` variable the app reads is declared in
`src/config/env.schema.ts` with zod. The values arrive at different moments,
so they are checked at each:

1. **`pnpm dev`** refuses to start when one is missing or invalid, naming it
   (`vite.config.ts`). `vite build` checks nothing: a production build has no
   settings to check.
2. **`docker compose`** stops at once without `VITE_API_URL`
   (`${VITE_API_URL:?…}` in `docker-compose.prod.yaml`).
3. **`deploy.sh`** checks that `VITE_API_URL` is set in `.env.production`
   *before* it changes anything. It also warns about keys nothing reads
   (usually a typo), keys set twice, and values with an unquoted `$`.
4. **The container's start-up script** (`nginx/40-runtime-config.sh`) refuses
   to start without `VITE_API_URL`, with a value containing quotes, spaces or
   backslashes, with an address that is not an `http(s)://` URL, or with a
   `VITE_SENTRY_DSN` that is not a DSN (`https://<key>@<host>/<project>`) or
   is still the template's placeholder. The browser would refuse such a value
   and show a blank page; refused at start, `deploy.sh` sees the container
   fail and keeps the release that works. `scripts/smoke-image.sh` checks
   this on every image CI builds.
5. **The browser** parses the values with the same schema
   (`src/config/env.ts`). A value the start-up script accepted but the schema
   does not — a DSN without its `key@` part, say — stops the app before it
   renders, with "Invalid environment configuration" in the console.

The app imports settings from `src/config/env.ts`, never from
`import.meta.env` directly. That is what lets `window.__APP_CONFIG__`
override the development values.

The code used to fall back to hard-coded defaults matching no real setup (an
API on `:3000`). A production build with a missing variable then succeeded and
shipped a bundle pointing at localhost. Hence: no defaults.

## Things that will catch you out

**`VITE_API_URL` includes `/api/v1`.** It is the base the client appends paths
to, not the host. Leaving the prefix off gives 404s on every request.

**An empty value counts as unset.** Compose passes an unset variable as `""`,
which an optional URL check would otherwise reject as invalid rather than
absent.

**A `$` in a value is eaten.** Compose reads `$NAME` in an env file as a
variable. Put such a value in single quotes, or write `$$`. `deploy.sh` warns
about it.

**`SENTRY_AUTH_TOKEN` has no `VITE_` prefix, and must not get one.** It is an
organization token; with the prefix, Vite would put it in the bundle.

**The image builds only what the build needs.** Setting `VITE_API_URL` as a
build arg does nothing; do not add one to the Dockerfile: an address in the
build would quietly undo one image running everywhere.

**HTTPS in production.** The API's refresh cookie is `Secure` in production,
so a browser on plain `http` never stores it, and a reload signs everyone out.
Serve the site over HTTPS ([deployment-guide.md](./deployment-guide.md)).

## Adding a variable

Which path depends on when it needs to be read.

**A setting of the deployment** — an address, or anything that differs
between environments. This is almost always what you want:

1. Declare it in `src/config/env.schema.ts` (`.optional()` if the app works
   without it) and read it from `env`.
2. Add it to `services.app.environment` in `docker-compose.prod.yaml`. Use
   `${NAME:?message}` if it is required, so compose stops with your message;
   `${NAME:-}` otherwise.
3. Write it into `/config.js` in `nginx/40-runtime-config.sh`, through
   `checked NAME`.
4. If it is required, add it to the `for key in …` list in `deploy.sh`'s
   `check_app_settings`.
5. If the browser must connect to it, add a placeholder for its origin in
   `scripts/csp.mjs` and fill it in from `nginx/40-runtime-config.sh`, as the
   API and Sentry origins are.
6. Document it in `.env.example`.

**A build value** — something that describes the build itself:

1. Declare it in the schema, if the app reads it.
2. `ARG NAME` in the `build` stage of the `Dockerfile` — an `ARG` in another
   stage never reaches `pnpm run build`.
3. `NAME: ${NAME:-}` under `build.args` in `docker-compose.prod.yaml`, and in
   the `build-args` of the image job in `.github/workflows/ci.yml`.
4. Document it in `.env.example`.

`pnpm test` fails if step 2 or the CI half of step 3 is missed
(`src/config/__tests__/env-files.test.ts`), as it does when a deployment
setting is missing from the compose file or the start-up script's checks.

## Related

- [setup/prepare-for-production.md](./setup/prepare-for-production.md) — `.env.production` field by field
- [making-it-yours.md](./making-it-yours.md) — what to change when you start a project from this
- [docker.md](./docker.md) — the images
- [deploy.md](./deploy.md) — releases and rollback
- [error-tracking.md](./error-tracking.md) — the Sentry settings in detail
