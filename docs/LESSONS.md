# Lessons from the first production deploy

Mistakes found while taking this starter from "works in dev compose" to "runs
on a server behind nginx", and what the starter now does about each. Every fix
is already in place; this page is here so you know why, and don't undo one by
accident. The current, complete guides are [docker.md](./docker.md),
[deploy.md](./deploy.md) and [environment.md](./environment.md).

- [1. Ports bound to every interface](#1-ports-bound-to-every-interface)
- [2. A healthcheck that gave up too early](#2-a-healthcheck-that-gave-up-too-early)
- [3. Addresses built into the bundle](#3-addresses-built-into-the-bundle)
- [4. Install scripts inside Docker](#4-install-scripts-inside-docker)
- [5. pnpm versions that drifted](#5-pnpm-versions-that-drifted)
- [6. A port still held by an old container](#6-a-port-still-held-by-an-old-container)
- [7. `.env.production` is not in git](#7-envproduction-is-not-in-git)
- [The checklist](#the-checklist)

## 1. Ports bound to every interface

**What happened:** a port published as `"8081:8080"` binds to `0.0.0.0`: every
network interface, the public one included. The container was reachable on
the server's IP directly, around the host's nginx and its TLS.

**Now:** `docker-compose.prod.yaml` publishes `127.0.0.1:${FRONTEND_PORT:-8081}:8080`.
nginx inside the container listens on **8080** (the unprivileged image cannot
use 80); only the host's nginx, on the same machine, reaches 8081. The dev
compose file binds `127.0.0.1:3001:3001` the same way.

**Keep:** the `127.0.0.1:` prefix on every published port.

## 2. A healthcheck that gave up too early

**What happened:** with `start_period: 10s`, a busy server's first probes could
fail while the container was still starting, and a deploy script reads that
as a failed release.

**Now:** `start_period: 30s` (failures in that window don't count) with
`start_interval: 2s`, so a healthy release is still seen within seconds. This
needs Docker Engine 25 or newer.

## 3. Addresses built into the bundle

**What happened:** Vite inlines `VITE_*` values when it builds. Changing
`VITE_API_URL` on the server and restarting changed nothing, and each
environment needed its own image.

**Now:** nothing is built in. At every start, `nginx/40-runtime-config.sh`
writes `/config.js` from the container's environment and fills in the
Content-Security-Policy; the app reads `window.__APP_CONFIG__`. One image runs
anywhere, and **changing a setting is `./deploy.sh`, not a rebuild**. Error
tracking's DSN works the same way; only the sourcemap upload belongs to the
build ([environment.md](./environment.md)).

## 4. Install scripts inside Docker

**What happened:** `pnpm install` runs the `prepare` script (husky), which
fails in a Docker build: there is no `.git` there.

**Now:** the `deps` stage runs `pnpm install --frozen-lockfile --ignore-scripts`.
`--ignore-scripts` also stops a malicious package's install script from
running during the build. `--frozen-lockfile` fails the build if the lockfile
would need to change.

## 5. pnpm versions that drifted

**What happened:** a Dockerfile that installs "the latest pnpm" builds with a
different version than your machine, and install behaviour changed between
pnpm majors.

**Now:** `packageManager` in `package.json` pins pnpm's exact version; the
Dockerfile only runs `corepack enable`, and Corepack uses that version on your
machine, in CI and in the image alike.

## 6. A port still held by an old container

**What happened:** `docker compose up` failed with
`Bind for 127.0.0.1:8081 failed: port is already allocated`: a container from
another compose project still held the port.

**Now:** each compose file has its own project `name:`, and `deploy.sh`
recreates the container itself. If you change `FRONTEND_PORT`, or another
project holds the port:

```bash
docker ps --format "{{.Names}} | {{.Ports}}" | grep 8081
docker compose -f docker-compose.prod.yaml down   # this project's own container
```

## 7. `.env.production` is not in git

**What happened:** a setting changed in a local copy of `.env.production`
never reached the server. The file is gitignored on purpose, so `git pull`
cannot bring it.

**Now:** the server has its own `.env.production`, and `.env.example` (in git)
documents every setting. To change one: edit it on the server, then
`./deploy.sh`. The container reads it at start; no rebuild.

## The checklist

- [ ] Every published port starts with `127.0.0.1:`
- [ ] `FRONTEND_PORT` doesn't collide with anything else on the server (80 and
      443 belong to the host's nginx; the API's container uses its own port)
- [ ] The healthcheck's `start_period` is at least 30s
- [ ] After changing a setting in `.env.production`: `./deploy.sh` (no rebuild needed)
- [ ] `--frozen-lockfile --ignore-scripts` stays in the Dockerfile
- [ ] `packageManager` pins an exact pnpm version
- [ ] `.env.production` exists on the server, with `VITE_API_URL`
- [ ] `.dockerignore` keeps `node_modules`, `dist`, `.env*` (except the example), `.git` and `docs` out
