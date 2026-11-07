# CI: what happens after you push

This guide assumes you have never used CI. It explains what happens on
GitHub after `git push`, where to see it, what each check means, what to do
when one fails, and how the result reaches your server. Words in *italics*
are in the [glossary](#glossary) at the end.

- [What CI is](#what-ci-is)
- [What runs, and when](#what-runs-and-when)
- [Seeing the result](#seeing-the-result)
- [The checks, one by one](#the-checks-one-by-one)
- [The production image](#the-production-image)
- [Setting it up: error tracking (optional)](#setting-it-up-error-tracking-optional)
- [Running it by hand](#running-it-by-hand)
- [When a check fails](#when-a-check-fails)
- [The free minutes](#the-free-minutes)
- [Turning it off](#turning-it-off)
- [What CI doesn't do](#what-ci-doesnt-do)
- [Where it is configured](#where-it-is-configured)
- [Glossary](#glossary)

## What CI is

**CI (continuous integration)** means a computer re-checks the project every
time you push, without you asking. GitHub's service for this is called
**GitHub Actions**. On each push it:

1. borrows a fresh Linux machine (a *runner*) that has never seen your
   project;
2. downloads your code and installs everything from scratch, the way a new
   developer would after cloning;
3. runs the tests and checks;
4. marks the commit with ✓ (all passed) or ✗ (something failed).

Why bother, when the tests pass on your machine? Your machine has things a
fresh one doesn't: files you forgot to commit, an `.env` file only you have,
an old version of a package. CI catches "works on my machine". It also builds
the exact package your server will run.

The instructions are in the repository (`.github/workflows/ci.yml`), and
GitHub reads them on every push. Nothing needs setting up: the image holds no
addresses, so the same one runs anywhere ([deploy.md](./deploy.md)).

## What runs, and when

| You… | CI runs | Takes |
|---|---|---|
| push to `main` | every check, then builds, tests and **publishes** the production image | about 4 minutes |
| push to any other branch | the checks only | about 2 minutes |
| push to a branch that changes the Dockerfile, nginx or a dependency | the checks and the image: built, started and scanned, not published | about 4 minutes |
| push to a branch where only documentation differs from `main` (`docs/`, `.md` files) | nothing (a few seconds to notice) | seconds |
| click **Run workflow** (below) | everything, on the branch you pick; publishes only from `main` | about 4 minutes |
| open a pull request from a fork | the checks | about 2 minutes |

A pull request from a branch of this repository runs nothing extra: that
branch's pushes are already checked.

A branch is compared with `main`, not with its own previous push: a
documentation commit pushed after code whose run was cancelled still runs the
checks, over everything the branch changes.

If you push twice quickly to the same branch, the first run is cancelled, as
only the newest commit matters. On `main` nothing is cancelled: each commit
is its own run, and gets its own image.

```
git push
   │
   ▼
What changed ──── only docs, not main ──▶ stop
   │
   ▼
┌───────────────── in parallel ─────────────────┐
│ Lint, types, tests      Dependency advisories │
│ and build                                     │
└───────────────────────────────────────────────┘
   │ (the first must pass; main, Run workflow, or a branch that changes
   │  the Dockerfile, nginx or a dependency)
   ▼
Production image: build → check it → scan it → publish (main only)
```

## Seeing the result

**On a commit:** on GitHub, open the repository. Next to the latest commit
(above the file list) is a yellow dot (running), a green ✓ or a red ✗. Click
it for the list of jobs.

**All runs:** the **Actions** tab at the top of the repository. Each row is
one run: the commit message, the branch, how long it took.

**Inside a run:**

1. Click the run. The page shows each *job* as a box, with a ✓, ✗, or a
   grey ⊘ (skipped: not needed this time).
2. Click a job to see its *steps*.
3. Click a step to open its log: exactly what the command printed. A failed
   step opens by itself.
4. Grey boxes under "Annotations" are notes the workflow left, such as
   "Checks skipped: This branch differs from main only in documentation".

GitHub also emails you when a run you started fails (your GitHub account →
Settings → Notifications, "Actions").

## The checks, one by one

Every check is a command you can run yourself, from the project folder.

**Lint, types, tests and build** (about 1½ minutes)

| Check | Catches | Yourself |
|---|---|---|
| Lint (ESLint) | Code mistakes a program can spot: a missing hook dependency, an unhandled promise, an accessibility problem | `pnpm lint` |
| Format (Prettier) | Code not laid out the house way | `pnpm format:check` (`pnpm format` fixes it) |
| Unit tests (Vitest) | A component or function that no longer does what its test says, or a page with a critical or serious accessibility problem (axe-core, [testing.md](./testing.md#accessibility)) | `pnpm test` |
| Changed-line coverage | New or changed lines in the logic files (`src/lib`, `src/hooks`, a feature's `api/`, `hooks/`, `lib/`, the stores) that fewer than 80% of are run by a test ([CONSTRAINTS.md](../CONSTRAINTS.md)); read from the coverage report of the unit run | `pnpm check:task` |
| Build | Type errors anywhere (`tsc -b`), and anything that stops `vite build` | `pnpm build` |
| Bundle size | What the first screen downloads, gzipped (`.size-limit.mjs`), over the budget CONSTRAINTS.md records (JS 246.75 kB, CSS 8.17 kB) | `pnpm build && pnpm size` |

The build checks no settings: the image holds none, and the container gets
them when it starts. The settings are checked by `pnpm dev`, by `deploy.sh`
and by the container at start ([environment.md](./environment.md#validation)).
That every setting reaches the image build and the container is checked by
the unit tests (`src/config/__tests__/env-files.test.ts`).

**Dependency advisories** (about 15 seconds): none of the packages the app
ships has a known security hole rated high or critical. The list of known
holes (*advisories*) is public and grows every day, so this check can fail
on a day you changed nothing. Yourself: `pnpm audit --prod --audit-level high`.

**Constraints floor and secrets** (under a minute, documentation-only
pushes included, since weakening [CONSTRAINTS.md](../CONSTRAINTS.md) is one):
no new suppression comments, stubs, skipped tests, tests removed without a
`Tests-removed:` line in a commit message, or loosened constraints; and
gitleaks finds no secret in the pushed commits. Yourself: `pnpm check:fast`.

**Code scan** (a few minutes): Semgrep's `p/default` rules over the source
files the push changed; a finding rated high, critical or `ERROR` fails it.
CI only, since Semgrep is heavy for a laptop.

## The production image

An **image** is your app packed with everything it needs to run: here, the
built files and the nginx web server that serves them. The server runs the
image. (`docker build` makes one; this is the same thing, done by CI.)

After the checks pass, CI:

1. **builds** the image, on the newest version of nginx's base image, so its
   security fixes arrive with every build. No address is built in: the
   container reads them when it starts ([deploy.md](./deploy.md));
2. **checks** it: starts it and makes sure nginx answers, every page carries
   the Content-Security-Policy (the header that tells the browser which
   scripts and servers the page may use), a link deep into the app opens the
   app instead of a 404, no sourcemap (a file that reveals the original
   source code) is served, and `/config.js` carries the address the container
   was started with, uncached, with no address left in the built files;
3. **scans** it with **Trivy**, a security scanner that checks every package
   inside the image against public lists of known security holes. It fails
   only for high or critical holes that already have a fix: those you can do
   something about;
4. **publishes** it to **GHCR** (GitHub Container Registry), GitHub's storage
   for images. Only from `main`; nothing needs setting up for it.

Steps 1 to 3 also run on a branch that changes what goes into the image — the
Dockerfile, the nginx configuration, `package.json`, the lockfile or the Node
version — so a base image or dependency update (most of Renovate's) is built,
started and scanned before you merge it.

**Where the images are:** your GitHub profile → **Packages** tab (also linked
from the repository page, right column, "Packages"). Open the package to see
every published version. Each one's *tag* is the first 12 characters of its
commit, e.g. `ghcr.io/<owner>/react-starter:3f9c2a1b7d4e`. The package is
private, like the repository. The same 12 characters are the *release* errors
are filed under in Sentry.

**How it reaches the server:** with `DEPLOY_IMAGE_SOURCE=registry` in the
server's `.env.production`, `./deploy.sh` downloads the image of the commit
it deploys instead of building it on the server ([deploy.md](./deploy.md),
"`registry`"). What runs is exactly what CI tested. If CI hasn't published
that commit (still running, or failed), the deploy
stops before changing anything.

**Trying an image on your own machine:**

```powershell
gh auth refresh -s read:packages            # once: lets the GitHub CLI read packages
gh auth token | docker login ghcr.io -u <your GitHub username> --password-stdin
docker pull ghcr.io/<owner>/<repository>:<12-character commit>
docker run --rm -p 127.0.0.1:8081:8080 ghcr.io/<owner>/<repository>:<12-character commit>
```

Then open http://localhost:8081.

Old images are never deleted automatically. To delete some: the package page
→ Package settings, or a version's ⋯ menu.

## Setting it up: error tracking (optional)

**Nothing has to be set up for CI to publish an image.** The image holds no
addresses: the API address reaches the container when it starts, from the env file on your server, and it
writes them into `/config.js` for the browser ([deploy.md](./deploy.md)). One
image therefore runs in any environment, and changing an address is a
`./deploy.sh`, not a rebuild.

The only thing worth giving GitHub is what makes Sentry's stack traces
readable, and only if you use it ([error-tracking.md](./error-tracking.md)).
As **repository variables**:

1. On GitHub, open the repository → **Settings** (top right of the repository
   tabs; you need to be its owner).
2. Left column: **Secrets and variables** → **Actions**.
3. The **Variables** tab → **New repository variable**.
4. Add `SENTRY_ORG` and `SENTRY_PROJECT` (for example `my-org` and
   `react-starter`).

And one **secret**: the **Secrets** tab → **New repository secret**, name
`SENTRY_AUTH_TOKEN`. A secret is like a variable, but GitHub never shows it
again after saving and hides it in the logs. Without all three, the build
simply skips the upload and says so.

The DSN itself is not here: it is a setting of the deployment, like the
addresses, and lives in the server's env file, read when the container
starts. Click-by-click, for the Sentry side and for GitHub:
[setup/sentry.md](./setup/sentry.md) and [setup/github.md](./setup/github.md).

## Running it by hand

A branch that changes the `Dockerfile`, the nginx configuration or the
dependencies builds the image by itself. A branch that changes only the app's
code doesn't, to save minutes. To build one anyway:

1. **Actions** tab → **CI** in the left column.
2. **Run workflow** (right side) → choose the branch → **Run workflow**.

It runs everything. From `main` it also publishes; from another branch it
only checks.

The button appears only once `.github/workflows/ci.yml` is on `main`: GitHub
reads manual workflows from the default branch.

## When a check fails

1. Open the failed run (the red ✗ on the commit, or the Actions tab).
2. Click the job with the ✗, then the step with the ✗. The end of its log
   says what went wrong.
3. Run the same command locally (the tables above), fix, commit, push. The
   new push starts a new run.

If a run failed because of GitHub itself (a download that timed out, a
runner that died), the run page has **Re-run jobs** → **Re-run failed jobs**.
On `main`, do that: the image job waits for the other checks, so the commit
has no image until they pass.

The most common one is Docker Hub not answering in time ("context deadline
exceeded" or "Client.Timeout exceeded" while downloading an image). The
workflow downloads the images first with `scripts/pull-images.sh`, which
tries each one four times over about a minute and a half, so this now fails
only when Docker Hub is down for longer.

### Per check

**Lint or format:** `pnpm lint:fix` and `pnpm format` fix most of it. The
pre-commit hook normally catches these before they reach CI.

**Tests:** the log shows the test, the file and the expectation that failed,
exactly as locally.

**Build:** a type error shows its file and line. A missing or invalid
`VITE_*` value never fails the build; it fails `pnpm dev`, or stops the
container at start on the server.

**Dependency advisories:** `pnpm audit --prod --audit-level high` names the package and the
version that fixes it.

1. A package listed in `package.json`: update it
   (`pnpm add <package>@^<fixed version>`) and run the tests.
2. A package pulled in by another one: `pnpm why <package>` shows which.
   Update that one first. If no release of it has the fix yet, add an
   *override* in `pnpm-workspace.yaml`, staying within the major version it
   asks for, with a comment saying why. Remove it once the parent catches up.

The image doesn't wait for this check: a newly published hole shouldn't block
an urgent fix. It stays red until dealt with.

**The image check ("Serves the app with its Content-Security-Policy"):** the
step names what failed and prints nginx's log.

**The image scan:** almost always a package of the nginx base image. The
`Dockerfile` upgrades the image's Alpine packages as it builds (`apk upgrade`),
so a hole Alpine has fixed is fixed in the next build, even before nginx
rebuilds its image. When the scan still fails, the fix isn't in Alpine yet:
wait, or move the `Dockerfile` to a newer nginx version (the even numbers, like
1.30, are the stable ones). A hole that doesn't affect you: add
its ID (e.g. `CVE-2026-12345`) to a file named `.trivyignore` at the root of
the repository, one per line, with a comment saying why and when to look
again.

## The free minutes

GitHub gives a free account **2,000 minutes a month** of runners for private
repositories, shared by all of your repositories. Public repositories are
free and unlimited.

Minutes are counted per job, each rounded up to a whole minute, so one run
counts more than it takes:

| Run | Takes | Counts |
|---|---|---|
| Push to `main` | about 4 minutes | about 7 minutes |
| Push to a branch | about 2 minutes | about 4 minutes |
| Documentation only, on a branch | seconds | 1 minute |

This workflow saves minutes by:

- **caching**: the packages, the image's build layers and Trivy's database
  are downloaded once and reused;
- **skipping documentation**: a branch push that changes only `docs/` or
  `.md` files runs no checks;
- **building the image only on `main`**, when you click Run workflow, or on a
  branch that changes what goes into it;
- **cancelling** a branch's older run when you push again.

Usage so far: your GitHub account → Settings → **Billing and licensing**. If
the minutes run out, new runs fail to start until the next month begins (or
until you add a payment method and a budget); nothing else breaks.

## Turning it off

Nothing in the env files controls CI: GitHub runs whatever is in
`.github/workflows/`. To stop it:

| To… | How | Undo |
|---|---|---|
| Pause this workflow, keeping the file | **Actions** tab → **CI** (left column) → **⋯** (top right) → **Disable workflow** | The same menu → **Enable workflow** |
| Turn off Actions for the whole repository | **Settings** → **Actions** → **General** → *Actions permissions* → **Disable actions** → **Save** | Choose "Allow all actions…" again |
| Skip CI for one push | Put `[skip ci]` in the commit message | — |
| Remove it | Delete `.github/workflows/ci.yml` and commit | Restore the file |

While CI is off, nothing publishes images: `deploy.sh` in `registry` mode
then has nothing to download, so deploy with `DEPLOY_IMAGE_SOURCE=build`
([deploy.md](./deploy.md)).

## What CI doesn't do

- **Deploy.** CI publishes the image; you deploy it with `./deploy.sh` on the
  server ([deploy.md](./deploy.md)). Deploying automatically after CI is
  *CD* (continuous deployment), not set up here.
- **Run the end-to-end tests** ([e2e-testing.md](./e2e-testing.md)), in real
  browsers against the production image. The account and Google suites need
  the API running and its Mailpit to read the emailed codes from. So they are
  run by hand, against your development stack. (The image check CI does run starts the image and checks nginx, the
  CSP and `/config.js`.)
- **Check the API types.** `pnpm api:types:check` compares
  `src/lib/api-schema.d.ts` with the backend's `openapi.json`, which lives in
  the backend's repository. Run it after the backend's API changes
  ([api-types.md](./api-types.md)).

## Where it is configured

Everything is in `.github/workflows/ci.yml`, with a comment on each part.
Change it like any file: edit, commit, push. The next run uses the new
version. What the image talks to lives on the server, not here
([deploy.md](./deploy.md)); only error tracking's upload settings are in the
repository's settings ([above](#setting-it-up-error-tracking-optional)).

## Glossary

| Word | Meaning |
|---|---|
| **Workflow** | The instructions: `.github/workflows/ci.yml`. |
| **Run** | One execution of the workflow, for one commit. |
| **Job** | A group of steps with its own runner. The jobs of a run go in parallel unless one waits for another. |
| **Step** | One command or action inside a job. |
| **Runner** | The fresh Linux machine GitHub lends for a job, deleted afterwards. |
| **Image** | The app packed with everything it needs to run, what the server starts. |
| **Tag** | The name of one version of an image; here, the commit it was built from. |
| **Registry** | Storage for images. GHCR is GitHub's; Docker Hub is another. |
| **Repository variable / secret** | A setting stored in GitHub for the workflows. A secret is hidden after saving. |
| **Advisory / CVE** | A published security hole in a package version. CVE IDs look like `CVE-2026-12345`. |
| **Override** | A rule in `pnpm-workspace.yaml` forcing a package pulled in by another one to a fixed version. |
| **Release** | In Sentry, the version an error happened in; here, the commit. |
| **CD** | Continuous deployment: CI's result is put on the server automatically. |
