# GitHub: CI, the image registry, the Deploy button and Renovate

GitHub does four jobs for this starter, all optional but worth having:

- **CI**: on every push it runs the checks, and on `main` it builds, tests and
  publishes the production image ([../ci.md](../ci.md)).
- **The image registry (GHCR)**: stores those images, so the server downloads
  a tested image instead of building one ([../deploy.md](../deploy.md)).
- **The Deploy button**: runs `./deploy.sh` on your server from the GitHub
  website.
- **Renovate**: opens pull requests that keep the dependencies up to date
  ([../renovate.md](../renovate.md)).

This page sets each one up, click by click, and says exactly which secret or
variable receives which value.

| | |
|---|---|
| Required? | No. You can work and deploy without GitHub (`DEPLOY_IMAGE_SOURCE=build`, `./deploy.sh` in a terminal) |
| Cost | Free. Private repositories get 2,000 Actions minutes a month; a push to `main` uses about 7 ([../ci.md](../ci.md#the-free-minutes)). Renovate is free |
| Time | About 45 minutes for everything |

- [Every secret and variable](#every-secret-and-variable)
- [Step 1: Your own repository](#step-1-your-own-repository)
- [Step 2: Turn on Actions and watch the first run](#step-2-turn-on-actions-and-watch-the-first-run)
- [Step 3: Find the published image](#step-3-find-the-published-image)
- [Step 4: Let the server download images](#step-4-let-the-server-download-images)
- [Step 5: Let the server clone the repository](#step-5-let-the-server-clone-the-repository)
- [Step 6: The Deploy button](#step-6-the-deploy-button)
- [Step 7: Error tracking uploads (Sentry)](#step-7-error-tracking-uploads-sentry)
- [Step 8: Renovate](#step-8-renovate)
- [Check it works](#check-it-works)
- [Common mistakes](#common-mistakes)

## Every secret and variable

These are everything the two workflows read (`.github/workflows/ci.yml` and
`.github/workflows/deploy.yml`). All are set in the repository: **Settings** →
**Secrets and variables** → **Actions**. A **secret** is hidden after you save
it and masked in logs; a **variable** stays readable.

| Kind | Name | Read by | Value | Needed for |
|---|---|---|---|---|
| Secret | `DEPLOY_SSH_KEY` | `deploy.yml` | A private SSH key that may log in to the server (step 6) | The Deploy button |
| Variable | `DEPLOY_HOST` | `deploy.yml` | The server's IP address (or a name that is **not** behind Cloudflare's proxy) | The Deploy button |
| Variable | `DEPLOY_USER` | `deploy.yml` | The user to log in as, for example `ubuntu` | The Deploy button |
| Variable | `DEPLOY_PATH` | `deploy.yml` | The full path of the checkout on the server, for example `/home/ubuntu/web` | The Deploy button |
| Variable | `DEPLOY_HOST_KEY` | `deploy.yml` | The server's public host key, as `ssh-ed25519 AAAA...` (no host name in front) | The Deploy button |
| Variable | `SENTRY_ORG` | `ci.yml` | Your Sentry organisation slug | Readable stack traces (optional) |
| Variable | `SENTRY_PROJECT` | `ci.yml` | The web app's Sentry project slug | Readable stack traces (optional) |
| Secret | `SENTRY_AUTH_TOKEN` | `ci.yml` | A Sentry organisation auth token, `sntrys_...` | Readable stack traces (optional) |
| (automatic) | `GITHUB_TOKEN` | `ci.yml` | Nothing to set: GitHub gives each run one, allowed to publish to GHCR | Publishing images |

Nothing else is needed: the image holds no addresses, so CI needs no
`VITE_API_URL` or DSN. Those stay in the server's `.env.production`.

To add one: open the **Secrets** or **Variables** tab → **New repository
secret** (or **variable**) → type the **Name** exactly as above → paste the
value → **Add secret** (or **Add variable**). Names are case-sensitive.

## Step 1: Your own repository

Your project needs a repository of its own, not the starter's.

1. On GitHub: **+** (top right) → **New repository**.
2. **Repository name**: your project's name. Lower case is easiest: the image
   is named after it, in lower case.
3. **Private** (recommended). Do **not** add a README, `.gitignore` or
   licence: the starter has its own files.
4. **Create repository**.
5. In your local copy of the starter, point git at it and push:

   ```bash
   git remote rename origin starter          # keep the starter's address, to pull its updates later
   git remote add origin git@github.com:<owner>/<repository>.git
   git push -u origin main
   ```

(If the starter's own page shows a **Use this template** button, that does the
same in one step: **Use this template** → **Create a new repository**.)

**You are done when** the repository page on GitHub shows the starter's files.

## Step 2: Turn on Actions and watch the first run

Actions are on by default for a new repository. Check anyway:

1. Repository → **Settings** → **Actions** → **General**.
2. **Actions permissions**: **Allow all actions and reusable workflows** →
   **Save**.
3. **Workflow permissions** further down can stay on GitHub's default. The CI
   workflow asks for the one extra right it needs (publishing packages)
   itself.
4. Open the **Actions** tab. If it shows "I understand my workflows, go ahead
   and enable them" (repositories created from a fork do), click it.

Your push in step 1 started a run. Click it to watch: "What changed", "Lint,
types, tests and build", "Dependency advisories", then "Production image"
([../ci.md](../ci.md#seeing-the-result) explains each).

**You are done when** the run for your latest `main` commit has a green tick,
including the **Production image** job.

## Step 3: Find the published image

Nothing to set up: the **Production image** job of every green `main` run
publishes the image to GitHub's registry, GHCR (GitHub Container Registry), as:

```
ghcr.io/<owner>/<repository>:<first 12 characters of the commit>
```

`<owner>/<repository>` is your repository's name **in lower case**.

To see it: your GitHub profile → **Packages** tab (also on the repository page,
right column, **Packages**). Open the package: every version is listed by its
tag.

The package is **private**, like the repository, and linked to it (the image
carries the repository's address), so it follows the repository's access.

**You are done when** the package page lists a version tagged with your latest
`main` commit's first 12 characters (`git rev-parse --short=12 HEAD` prints
them).

## Step 4: Let the server download images

A private package needs a login. The server uses a **personal access token
(classic)** that can only read packages. (The newer "fine-grained" tokens do
not work with GHCR: GitHub's registry accepts only classic ones.)

1. On GitHub: your avatar (top right) → **Settings** → **Developer settings**
   (bottom of the left menu) → **Personal access tokens** → **Tokens
   (classic)** → **Generate new token** → **Generate new token (classic)**.
2. **Note**: `server ghcr pull`.
3. **Expiration**: pick a date, and put a reminder in your calendar a week
   before. When it expires, deploys stop with `Could not pull`. ("No
   expiration" also works; it is then valid until you delete it.)
4. **Select scopes**: tick only **`read:packages`**.
5. **Generate token**, and copy it (it starts with `ghp_`). It is shown once.
6. On the server, **as the user that runs `deploy.sh`** (the login is saved in
   that user's `~/.docker/config.json`):

   ```bash
   read -rs CR_PAT        # paste the token, press Enter (nothing is shown)
   echo "$CR_PAT" | docker login ghcr.io -u <your GitHub username> --password-stdin
   unset CR_PAT
   ```

   It prints `Login Succeeded`. `read -s` keeps the token out of your shell
   history.
7. In the server's `.env.production`:

   ```bash
   DEPLOY_IMAGE_SOURCE=registry
   DEPLOY_IMAGE=ghcr.io/<owner>/<repository>
   ```

   No tag: `deploy.sh` adds the commit itself.

The token can read every package your account can read. If the API's image is
in GHCR under the same account, this one login serves both. For tighter
control, make the token on a separate GitHub account that only has access to
these repositories.

(The alternative, making the package public in its **Package settings**,
needs no login, but anyone could download your app. Only sensible for a
public repository.)

**You are done when**, on the server:

```bash
docker pull ghcr.io/<owner>/<repository>:<tag from step 3>
```

downloads the image.

## Step 5: Let the server clone the repository

`deploy.sh` runs `git pull` on the server, so the server needs to read a
private repository. A **deploy key** is an SSH key that can read one
repository and nothing else. (A public repository needs none: clone it over
`https://` and skip this step.)

1. On the server, make a key for this repository:

   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/web_deploy -N "" -C "server web"
   cat ~/.ssh/web_deploy.pub
   ```

2. Copy the line `cat` printed (it starts with `ssh-ed25519`).
3. On GitHub: repository → **Settings** → **Deploy keys** → **Add deploy
   key**. **Title**: `server`. **Key**: paste. Leave **Allow write access**
   **unticked**. **Add key**.
4. GitHub accepts a deploy key in **one** repository only, so the API's
   repository needs its own key. To use the right key for each, give each an
   alias in `~/.ssh/config` on the server:

   ```
   Host github-web
     HostName github.com
     User git
     IdentityFile ~/.ssh/web_deploy
     IdentitiesOnly yes
   ```

   (The API's block would be `Host github-nest` with its own key file.)
5. Clone with the alias:

   ```bash
   git clone git@github-web:<owner>/<repository>.git ~/web
   ```

   The first time, SSH asks whether to trust `github.com`. GitHub publishes its
   key fingerprints in its documentation ("GitHub's SSH key fingerprints"); the
   ed25519 one is `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`. If it
   matches, type `yes`.

**You are done when** `git -C ~/web pull` prints "Already up to date." without
asking for anything.

## Step 6: The Deploy button

The **Deploy** workflow logs in to your server over SSH and runs `./deploy.sh`
there (or `./deploy.sh --rollback`). It never runs by itself: you press it.

```mermaid
sequenceDiagram
    participant You
    participant GitHub as GitHub runner
    participant Server
    You->>GitHub: Actions, Deploy, Run workflow
    GitHub->>Server: SSH as DEPLOY_USER with DEPLOY_SSH_KEY, checking DEPLOY_HOST_KEY
    Server->>Server: cd DEPLOY_PATH and ./deploy.sh
    Server-->>GitHub: deploy.sh output, live in the run log
```

### 6a. A key for GitHub to log in with

Make a new key for this, not your own, so you can withdraw it alone. On your
computer:

```bash
ssh-keygen -t ed25519 -f deploy_key -N "" -C "github-actions-deploy"
```

(If it asks for a passphrase, press Enter twice: GitHub cannot type one.) This
makes two files: `deploy_key` (private) and `deploy_key.pub` (public).

Allow the public one to log in to the server as the deploy user:

```bash
ssh <user>@<server IP> 'cat >> ~/.ssh/authorized_keys' < deploy_key.pub                 # bash
Get-Content deploy_key.pub | ssh <user>@<server IP> "cat >> ~/.ssh/authorized_keys"      # PowerShell
```

That user must be able to run Docker without `sudo` (in the `docker` group:
`sudo usermod -aG docker <user>`) and own the checkout.

### 6b. The server's host key

So the runner can tell it is really your server (and not someone in between),
it needs the server's own public key. On the **server**:

```bash
cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub
```

It prints one line: `ssh-ed25519 AAAA...`. That whole line, and nothing else,
is the value. (From your computer, `ssh-keyscan -t ed25519 <server IP>` prints
the same with the address in front: drop the address.)

### 6c. The secret and the four variables

Repository → **Settings** → **Secrets and variables** → **Actions**:

1. **Secrets** tab → **New repository secret**:
   - `DEPLOY_SSH_KEY`: the **whole** content of the private file `deploy_key`,
     including the `-----BEGIN OPENSSH PRIVATE KEY-----` and
     `-----END OPENSSH PRIVATE KEY-----` lines.
2. **Variables** tab → **New repository variable**, four times:
   - `DEPLOY_HOST`: the server's IP address. A name works too, but not one
     behind Cloudflare's proxy (orange cloud): the proxy does not carry SSH.
   - `DEPLOY_USER`: for example `ubuntu`.
   - `DEPLOY_PATH`: the full path of the checkout, for example
     `/home/ubuntu/web`.
   - `DEPLOY_HOST_KEY`: the line from 6b.
3. Delete `deploy_key` from your computer: GitHub has it now, and the server
   only needs the public half.

### 6d. Let GitHub reach port 22

GitHub's runners have no fixed address. A firewall that allows SSH only from
your own address refuses them. Either allow port 22 from anywhere (the server
accepts keys only, never passwords, and fail2ban bans repeated failures:
[../server.md](../server.md)), or keep it closed and deploy from your own
terminal. The workflow always uses port 22: there is no setting for another
port.

**You are done when** **Actions** → **Deploy** (left column) → **Run
workflow** → action `deploy` → **Run workflow** finishes green, and its log
ends with `Release <12 characters> is live`.

To roll back from the same button: choose `rollback`, and leave **tag** empty
for the previous release, or give a 12-character commit.

## Step 7: Error tracking uploads (Sentry)

Only if GitHub builds your image (`DEPLOY_IMAGE_SOURCE=registry`) and you want
readable stack traces in Sentry. Make the values with
[sentry.md](./sentry.md#step-5-readable-stack-traces-sourcemaps), then:

1. **Variables** tab → `SENTRY_ORG` = your organisation slug.
2. **Variables** tab → `SENTRY_PROJECT` = the web app's project slug.
3. **Secrets** tab → `SENTRY_AUTH_TOKEN` = the organisation token.

All three or none. Without them CI skips the upload and the image is the same.

**You are done when** the next `main` run's **Production image** → **Build**
step has no `[sentry] Sourcemaps were NOT uploaded` line.

## Step 8: Renovate

Renovate is a bot that opens pull requests updating your dependencies. It runs
on its maker's (Mend's) servers, not on your Actions minutes.

1. Open https://github.com/apps/renovate → **Install** (or **Configure** if
   you have it already).
2. Choose **Only select repositories**, pick this repository (and the API's) →
   **Install**. If the screen offers **All repositories** instead, avoid it:
   every repository you own would get a pull request.
3. Sign in at https://developer.mend.io with GitHub, open the repository, and
   check its mode is **Scan and Alert** ("Scan Only" makes Renovate silent). If
   the labels differ, look for the setting that lets Renovate open pull
   requests.
4. The repository already has `renovate.json`. Change its `timezone` (Vietnam's
   by default) to yours, and push.

Later repositories are added at: your avatar → **Settings** → **Applications**
→ **Installed GitHub Apps** → **Renovate** → **Configure** → **Repository
access**.

**You are done when** an issue named **Dependency Dashboard** appears in the
repository's **Issues** tab (within a few hours). Hint: if Renovate opens a
"Configure Renovate" pull request first, merge it.
[../renovate.md](../renovate.md) explains the weekly routine.

## Check it works

- [ ] A push to a branch runs the checks; a push to `main` also runs
      **Production image** and publishes it (step 2, 3).
- [ ] On the server, `docker pull ghcr.io/<owner>/<repository>:<tag>` works
      (step 4).
- [ ] On the server, `git -C <checkout> pull` works without a password (step 5).
- [ ] **Actions** → **Deploy** → **Run workflow** deploys, and the site shows
      the new release (step 6).
- [ ] With Sentry's values set, the build log shows no "NOT uploaded" line
      (step 7).
- [ ] The Dependency Dashboard issue exists (step 8).

## Common mistakes

| What you see | Cause | Fix |
|---|---|---|
| **Publish** fails with `denied` or `permission_denied: write_package` | A package with this name already exists and belongs to another repository, or an organisation policy forbids publishing | Package page → **Package settings** → **Manage Actions access** → **Add Repository** → this one, role **Write**. In an organisation, also check its **Settings** → **Actions** → **General** → **Workflow permissions** |
| No **Run workflow** button | GitHub shows it only for workflows on the default branch | Merge `.github/workflows/` to `main` first |
| `Deploy is not set up: Missing: variable DEPLOY_HOST, ...` | One of the five settings is missing or misspelled | Step 6c; the message names what to add |
| `Host key verification failed` | `DEPLOY_HOST_KEY` has the address in front, or is another key type, or `DEPLOY_HOST` points at Cloudflare's proxy | Step 6b: only `ssh-ed25519 AAAA...`; use the server's IP |
| `Permission denied (publickey)` | The public key is not in that user's `~/.ssh/authorized_keys`, or the secret lost its `BEGIN`/`END` lines | Step 6a and 6c |
| The run hangs, then `Connection timed out` | The firewall does not let GitHub reach port 22 | Step 6d |
| `permission denied while trying to connect to the Docker daemon socket` | `DEPLOY_USER` is not in the `docker` group | `sudo usermod -aG docker <user>`, then log in again |
| `The working tree has uncommitted changes ... Commit or stash them` | Someone edited files in the server's checkout. The button cannot answer the question a terminal would | On the server: `git -C <checkout> status`, then commit, stash or discard the changes |
| `Could not pull ghcr.io/...:<tag>` | CI has not finished publishing that commit, the commit is not on `main`, the server is not logged in, or the token expired | Wait for the green run; step 4 again with a new token |
| `DEPLOY_IMAGE must be lowercase` | The repository name has capitals | Write `DEPLOY_IMAGE` in lower case; CI publishes in lower case too |
| `git pull` on the server asks for a password | The checkout was cloned over `https://` from a private repository | Step 5, then `git -C <checkout> remote set-url origin git@github-web:<owner>/<repository>.git` |
| Renovate opened nothing | The schedule (Monday morning), the mode in the Mend portal, or the app does not see the repository | [../renovate.md](../renovate.md#when-something-looks-wrong) |
