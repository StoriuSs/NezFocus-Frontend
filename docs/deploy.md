# Deploying

`./deploy.sh` puts a new version of the app live on the server, checks that it
is healthy, and puts the previous version back if it isn't.

```
./deploy.sh                    # deploy the latest commit of the current branch
./deploy.sh --rollback         # go back to the previous version
./deploy.sh --rollback <tag>   # go back to a specific version
./deploy.sh --list             # which versions exist, which one is live
./deploy.sh --help             # every option
```

The backend starter has the same script and the same commands; its guide adds
database migrations.

## How it works

### Releases: one image per commit

The app is packaged as a Docker image: the built files plus nginx. Every deploy
builds (or downloads) the image for the commit being deployed and labels it with
the first 12 characters of the commit ID, e.g.
`react-starter-auth-prod-app:3f9c2a1b7d4e`. That labelled image is a **release**.

Because each release has its own label, deploying a new one doesn't destroy the
old one. The last few stay on the server (3 by default), ready to start again.

### A deploy, step by step

1. **Checks.** The working tree must be clean: a release is labelled with its
   commit, and an image built from uncommitted changes wouldn't match its label.
2. **Pull** the branch (`git pull --ff-only`), then look over `.env.production`
   and warn about keys that have no effect: keys neither the compose file nor
   the script reads (usually a typo), keys set twice, values with an unquoted
   `$`, and in `registry` mode the sourcemap settings (`SENTRY_AUTH_TOKEN`,
   `SENTRY_ORG`, `SENTRY_PROJECT`), which only matter where the image is
   built. The warnings don't stop the deploy. Then **check** that
   `VITE_API_URL` is set: without it the deploy stops here, before anything
   changes. The container checks the values again when it starts.
3. **Get the image** for the commit: build it, or download it from a registry
   (see [Where images come from](#where-images-come-from)).
4. **Switch**: recreate the container from the new image.
5. **Wait until healthy**: nginx must answer its healthcheck. A container that
   exits, restarts or turns unhealthy fails the deploy immediately; otherwise
   the wait lasts up to `DEPLOY_HEALTH_TIMEOUT` (120s). If `docker compose up`
   itself reports an error, the release is still judged by this.
6. **Healthy**: the release is recorded as live. The images of the last
   `DEPLOY_KEEP_IMAGES` releases stay; older ones, and images of failed
   deploys, are removed.
   **Not healthy**: the container's logs are printed, the previous release is
   started again, and the script exits with an error. The site stays up on the
   old version; fix the problem and deploy again.

Every deploy that gets past the pull is written to `.deploy/history.log`,
including ones that stopped before switching; so is every rollback. (A deploy
refused earlier — uncommitted changes, a failed pull — isn't, and neither is
one interrupted with Ctrl-C.) Only one deploy can run at a time; a second one
stops with a message. The lock is released when the script ends, however it
ends.

The script updates itself with `git pull`; a deploy always finishes with the
version of the script it started with.

**Requirements on the server**: bash, git, flock (util-linux, installed on every
common Linux distribution), and Docker Engine 25 or newer with the
compose plugin (the healthcheck uses `start_interval`).

**The server itself** — security updates, fail2ban, swap, SSH, the firewall —
is [server.md](./server.md). Worth half an hour before the first deploy.

### Rollback

`./deploy.sh --rollback` starts the release that was live before the current
one — no build, so it takes seconds. If that release doesn't become healthy,
the one that was live is started again. `./deploy.sh --list` shows the
releases on this server; `./deploy.sh --rollback <tag>` picks one. Rolling back
twice returns to where you started.

In `build` mode a release whose image was already pruned can't be started
again; build that commit instead: `git checkout <tag> && ./deploy.sh --no-pull`,
then `git switch <branch>` so later deploys can pull again. That runs the
`deploy.sh` and compose file of that commit, not the current ones. In
`registry` mode it is downloaded again.

A rollback swaps the **image**, not the files in this checkout. If the release
you are rolling back from changed `docker-compose.prod.yaml` — a wrong address,
a service that can't start — the previous image runs with that same broken
file, and the rollback fails too. Go back to the commit instead, which brings
its own compose file with it:
`git checkout <tag> && ./deploy.sh --no-pull`.

It does not change this deployment's settings either: the API address comes
from `.env.production` when the container starts, so the older
image talks to the same places the newer one did. If the backend changed its
API since, roll the two back together.

## Where images come from

Set in `.env.production` on the server:

```
DEPLOY_IMAGE_SOURCE=build          # default
# or
DEPLOY_IMAGE_SOURCE=registry
DEPLOY_IMAGE=ghcr.io/you/your-frontend
```

Releases, health checks and rollback are identical in both.

### Settings are read when the container starts

The app runs in the visitor's browser; the server only hands out files. A
browser can't read the server's environment, so something has to put the
addresses where the app can see them. This starter does that at **container
start**, not while building:

1. The container's environment holds the `VITE_*` values, from
   `.env.production` through the compose file.
2. Before nginx starts, `/docker-entrypoint.d/40-runtime-config.sh` writes
   them into `/config.js`:
   `window.__APP_CONFIG__ = { "VITE_API_URL": "https://api.example.com/api/v1", … }`
3. `index.html` loads that file before the app, and the app reads its settings
   from there (`src/config/env.ts`).
4. The Content-Security-Policy is finished at the same moment, so it allows
   exactly the API and error-tracking origins this deployment uses.

So **one image runs in any environment**, like the backend's. Changing an
address is `./deploy.sh`, not a rebuild, and the container refuses to start
when the one required value, `VITE_API_URL`, is missing. `/config.js` is
served with `no-store`, so a browser never reuses the previous deployment's
addresses. Error tracking's DSN and release travel the same way; only the
sourcemap upload belongs to the build ([environment.md](./environment.md)).

(In development none of this applies: Vite inlines the values from
`.env.development` as usual.)

### `build`: the server builds the image

The `VITE_*` values (and `CSP_IMG_SRC`, if needed) go in the server's
`.env.production`, and `deploy.sh` checks the required ones before anything
happens. Changing one needs no rebuild: the container reads them again when it
starts, so `./deploy.sh` is enough. If you upload sourcemaps to Sentry, their
three settings (`SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`) go in the
same file: in this mode the server's build uploads them
([error-tracking.md](./error-tracking.md)).

Every deploy compiles the app on the server: it takes a few minutes, needs spare
memory and competes with whatever else runs there for CPU.

### `registry`: CI builds, the server downloads

CI builds and tests the image on every push to `main` and publishes it to a
registry as `DEPLOY_IMAGE:<12-character commit>`: the GitHub Actions workflow
in this repository does, to GitHub Container Registry ([ci.md](./ci.md)). A
branch that changes what goes into the image has it built and tested too, but
only `main` publishes one, so deploy commits that are on `main`. The deploy downloads
that image instead of building. Deploys are faster, the server needs no build
headroom, and what runs is exactly what CI tested. Older releases stay in the
registry, so you can roll back even to one already removed from the server.

The `VITE_*` values stay on the server either way. The image holds no
addresses: the container reads them when it starts and writes them into
`/config.js` for the browser, so the image CI published for any commit runs
in any environment. Changing one is a `./deploy.sh`, not a rebuild, and the
container refuses to start without the required one (`VITE_API_URL`) —
`deploy.sh` checks it before it touches anything.

Setup on the server, once:

1. Log in to the registry. For GitHub Container Registry, create a personal
   access token with the `read:packages` scope, then:
   ```
   echo <token> | docker login ghcr.io -u <github-username> --password-stdin
   ```
2. In `.env.production`: `DEPLOY_IMAGE_SOURCE=registry` and
   `DEPLOY_IMAGE=ghcr.io/<owner>/<image>`. With this repository's workflow the
   image is named after the repository, in lower case:
   `ghcr.io/<owner>/<repository>`.

If CI hasn't published the commit yet (still running, or failed), the deploy
stops before changing anything:

```
✗ Could not pull ghcr.io/you/your-frontend:3f9c2a1b7d4e. Has CI finished publishing commit 3f9c2a1b7d4e? Is this server logged in to the registry (docker login)? Nothing was changed.
```

The token belongs to your GitHub account: if it expires or is revoked, deploys
fail until you log in again with a new one.

Staging and production can run the **same** published image: neither address
is in it, so each server's `.env.production` points it at its own API.

## The Deploy button

`./deploy.sh` on the server is the whole deploy. The button is a way to run it
without opening a terminal: **Actions** → **Deploy** → **Run workflow**, choose
`deploy` or `rollback`, and GitHub logs in to your server over SSH and runs it
there. Nothing deploys by itself — a push to `main` only builds and publishes
the image ([ci.md](./ci.md)).

**What it needs**, once, under the repository's **Settings** →
**Secrets and variables** → **Actions**:

| | Name | Value |
|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | A private key that may log in to the server. Make a new one for this, not your own: `ssh-keygen -t ed25519 -f deploy_key -N ""`, then add `deploy_key.pub` to `~/.ssh/authorized_keys` on the server and paste the contents of `deploy_key` here |
| Variable | `DEPLOY_HOST` | The server's address |
| Variable | `DEPLOY_USER` | The user to log in as, e.g. `ubuntu` |
| Variable | `DEPLOY_PATH` | Where this repository is checked out there, e.g. `/home/ubuntu/react` |
| Variable | `DEPLOY_HOST_KEY` | The server's own host key, so the runner knows it is really your server: `ssh-keyscan -t ed25519 <address>` prints it; use the part from `ssh-ed25519` onwards |

With any of them missing the run stops at the first step and names what to add.

**The server must accept SSH from GitHub.** Runners have no fixed address, so
a firewall that only allows SSH from your own address will refuse them. Either
allow port 22 from anywhere — the server accepts keys only, never passwords,
which is how it is set up here — or keep it closed and deploy from your own
terminal, which needs no button at all. GitHub publishes the address ranges its
runners use (`https://api.github.com/meta`, the `actions` list) if you would
rather allow only those, but the list changes and has to be kept up to date.

**Rolling back** uses the same button: choose `rollback`, and leave the tag
empty for the previous release or give a 12-character commit to go further
back. It runs `./deploy.sh --rollback` on the server, with everything that
means above — the release must still have an image, and the environment file
must still suit it.

**What you see**: the deploy's own output, live, in the run's log — the same
lines `./deploy.sh` prints in a terminal, including which release went live
and any rollback. One deploy runs at a time; a second run waits.

## Options and settings

| Option | |
|---|---|
| `--no-pull` | Deploy the commit that is checked out, without pulling. Also for a detached HEAD. |
| `--skip-build` | `build` mode: reuse the image already built for this commit. |
| `--allow-dirty` | Deploy despite uncommitted changes. Without a terminal the script refuses rather than asks. |
| `--reload-nginx` | Validate and reload the host's nginx afterwards. Only needed after changing the nginx config: a normal deploy keeps the same port. |

| `.env.production` | Default | |
|---|---|---|
| `DEPLOY_IMAGE_SOURCE` | `build` | `build` or `registry` |
| `DEPLOY_IMAGE` | `react-starter-auth-prod-app` | Image name; the registry path in `registry` mode |
| `DEPLOY_KEEP_IMAGES` | `3` | Releases whose images stay on the server, the live one included. In `build` mode you can only roll back to these, so it must be 2 or more. |
| `DEPLOY_HEALTH_TIMEOUT` | `120` | Seconds to wait for the app to become healthy |

State is kept in `.deploy/` (gitignored): `releases` (live release last),
`history.log` (deploys and rollbacks, with the result) and `deploy.lock`.

## Downtime during a deploy

The switch recreates the container, so for the moment the new one takes to
start, the host's nginx has nothing to forward to and visitors get a 502. For
this app that is a second or two; the build or download happens before the
switch and doesn't add to it.

Avoiding even that needs **blue/green** deploys: start the new version next to
the old one on another port, wait until it is healthy, point nginx at it, then
stop the old one. That isn't built in. Options if it ever matters:

- **Kamal** (kamal-deploy.org) does blue/green on plain servers with its own
  small proxy in front of the containers.
- **Managed platforms** do it for you: on AWS, ECS behind an Application Load
  Balancer runs rolling or blue/green deploys with automatic rollback. It costs
  more (the load balancer alone is roughly $16/month) and takes more setup.
- For a static frontend specifically, a CDN or static host (Cloudflare Pages,
  S3 + CloudFront) swaps versions atomically with no downtime at all.
