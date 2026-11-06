# Docker

One `Dockerfile` with a development and a production target, and a compose
file for each. This page says what each piece is; the settings are in
[environment.md](./environment.md) and deploying is in [deploy.md](./deploy.md).

- [The files](#the-files)
- [The Dockerfile's stages](#the-dockerfiles-stages)
- [Development](#development)
- [Production](#production)
- [The settings are not built in](#the-settings-are-not-built-in)
- [Dev and production side by side](#dev-and-production-side-by-side)

## The files

| File | What it is |
|------|---------|
| `Dockerfile` | Five stages; `dev` and `prod` are the two you run |
| `docker-compose.dev.yaml` | The Vite dev server in a container, with hot reload through a bind mount |
| `docker-compose.prod.yaml` | The production image: nginx serving the built files, bound to `127.0.0.1` for the host's nginx |
| `nginx.conf` | The container's nginx: the deep-link fallback, cache headers, `/config.js` |
| `nginx/security-headers.conf` | The security headers every response carries, the Content-Security-Policy included |
| `nginx/40-runtime-config.sh` | Runs at every container start: writes `/config.js` and the CSP from the container's environment |
| `.dockerignore` | Keeps `node_modules`, env files, docs and the like out of the build |

## The Dockerfile's stages

| Stage | From | What it does |
|-------|------|-------------|
| `base` | `node:22.23.2-alpine` | Node, and pnpm through Corepack at the version `packageManager` pins |
| `deps` | `base` | `pnpm install --frozen-lockfile --ignore-scripts`, with the pnpm store in a BuildKit cache |
| `build` | `deps` | `pnpm run build` (type-check and `vite build`), deletes any sourcemap, and writes the CSP template (`scripts/csp.mjs`) |
| **`dev`** | `deps` | The Vite dev server on port 3001 |
| **`prod`** | `nginxinc/nginx-unprivileged:1.30.6-alpine` | The built files, served by nginx running as a non-root user on port **8080**; Alpine's security updates applied at build time |

`--ignore-scripts` skips the `prepare` script (husky), which fails in Docker
because there is no `.git` there. `--frozen-lockfile` fails the build if
`pnpm-lock.yaml` would need to change.

## Development

```bash
pnpm docker:dev      # build and start
pnpm docker:down     # stop
```

- It reads `.env.development`, like `pnpm dev`.
- The app is at http://localhost:3001: the container's port 3001 published as
  `127.0.0.1:3001`, so only your machine reaches it. For a phone on your
  network, change it to `0.0.0.0:3001:3001` for a while.
- The source is bind-mounted, so edits reload at once. Vite's file watcher
  polls (`CHOKIDAR_USEPOLLING`), because Docker Desktop's bind mounts raise no
  file events.
- `node_modules` is the container's own (an anonymous volume), renewed on each
  `pnpm docker:dev` so a dependency you add reaches it.

Running `pnpm dev` on your machine is quicker; this is for when you want no
Node installed, or the same environment as a colleague.

## Production

On a server, deploy with `./deploy.sh` ([deploy.md](./deploy.md)): it tags
each release with its commit, waits for it to become healthy, and rolls back
if it does not. On your own machine, to try the production image:

```bash
cp .env.example .env.production   # VITE_API_URL is the one required setting
pnpm docker:prod                  # build and start: http://localhost:8081
pnpm docker:down:prod             # stop
```

What runs:

- The image holds the built files and nginx, and **no settings**. When the
  container starts, `nginx/40-runtime-config.sh` writes `/config.js` from the
  container's environment, finishes the Content-Security-Policy with the same
  origins, and then nginx starts.
- nginx listens on **8080** inside the container (the unprivileged image
  cannot use 80). Compose publishes it as `127.0.0.1:8081` (`FRONTEND_PORT`),
  for the host's nginx to proxy to.
- **Deep links**: a path that is not a file (`/profile`, `/login`) gets
  `index.html` through nginx's `try_files`, an internal fallback rather than
  a redirect, and the router takes it from there. A missing file under
  `/assets/` is a real 404 instead: serving HTML as a script after a deploy
  only produces a confusing error.
- **Caching**: the hashed files under `/assets/` are cached for a year
  (`immutable`); `index.html` and `/config.js` are never cached.
- A healthcheck asks nginx for `/` every 30 seconds; memory is capped at
  128 MB and the logs at 15 MB.

`pnpm docker:prod` runs
`docker compose --env-file .env.production -f docker-compose.prod.yaml up -d --build`.
Don't drop `--env-file`: without it compose reads only `./.env`, which this
project never creates, and stops at once because `VITE_API_URL` is unset.

## The settings are not built in

Vite normally inlines `VITE_*` values into the JavaScript at build time, which
would mean one image per environment and a rebuild every time an address
changes. This starter does not do that: the container writes `/config.js`
when it starts, and the app reads `window.__APP_CONFIG__` from it
(`src/config/env.ts`).

So one image runs in every environment, changing a setting needs a restart
(`./deploy.sh`) rather than a rebuild, and a missing `VITE_API_URL` stops the
container, by name. Only the Sentry sourcemap upload happens at build time.
The whole story, and every setting: [environment.md](./environment.md).

## Dev and production side by side

| | Dev | Prod |
|--------|-----|------|
| Dockerfile target | `dev` | `prod` |
| Base image | `node:22.23.2-alpine` | `nginxinc/nginx-unprivileged:1.30.6-alpine` |
| Serves with | The Vite dev server | nginx |
| Port inside → on the host | 3001 → `127.0.0.1:3001` | 8080 → `127.0.0.1:8081` |
| Settings | `.env.development`, read by Vite | `.env.production`, read by the container at start |
| Compose project | `nezfocus-web-frontend-dev` | `react-starter-auth-prod` |

The two compose files name different projects, so stopping one never removes
the other's container.
