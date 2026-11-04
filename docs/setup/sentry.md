# Sentry: error tracking for the web app

When the app breaks in a visitor's browser, nothing tells you: the browser's
console reaches no server you own. [Sentry](https://sentry.io) collects those
errors, groups identical ones into one *issue*, and shows the page, the
browser, what the visitor did just before, and the stack trace. This page sets
it up, click by click. How the app uses it (what is sent, what is scrubbed) is
in [../error-tracking.md](../error-tracking.md).

| | |
|---|---|
| Required? | No. Without it the app works the same, and the browser downloads none of Sentry's code |
| Development | Optional: useful once, to see it work |
| Production | Recommended |
| Cost | The free **Developer** plan: 5,000 errors a month (shared by all projects in the organisation, so with the API's too), one user, alerts by email only |
| Time | About 15 minutes; 10 more for readable stack traces |

- [What goes where](#what-goes-where)
- [Step 1: Make an account and an organisation](#step-1-make-an-account-and-an-organisation)
- [Step 2: Create the web app's project](#step-2-create-the-web-apps-project)
- [Step 3: Copy the DSN into the env file](#step-3-copy-the-dsn-into-the-env-file)
- [Step 4: The release (nothing to do)](#step-4-the-release-nothing-to-do)
- [Step 5: Readable stack traces (sourcemaps)](#step-5-readable-stack-traces-sourcemaps)
- [Step 6 (optional): Email alerts](#step-6-optional-email-alerts)
- [Check it works](#check-it-works)
- [Common mistakes](#common-mistakes)

## What goes where

| Value | Example | Goes into | Read when |
|---|---|---|---|
| The project's **DSN** | `https://<key>@o<number>.ingest.us.sentry.io/<number>` | `VITE_SENTRY_DSN` in `.env.development` (development) and in the server's `.env.production` (production). Never in GitHub | Development: when `pnpm dev` starts. Production: when the container starts (it is written into `/config.js`) |
| The release | The commit's first 12 characters | Nothing to set: `deploy.sh` and CI fill in `VITE_SENTRY_RELEASE` | At build and at container start |
| The **organisation slug** | `your-org` | GitHub **variable** `SENTRY_ORG` if GitHub builds the image; `SENTRY_ORG` in `.env.production` if the server builds it | While the image is built |
| The **project slug** | `react-starter` | GitHub **variable** `SENTRY_PROJECT`, or `SENTRY_PROJECT` in `.env.production` (same rule) | While the image is built |
| An **organisation auth token** | `sntrys_...` | GitHub **secret** `SENTRY_AUTH_TOKEN`, or `SENTRY_AUTH_TOKEN` in `.env.production` (same rule) | While the image is built |

The DSN is not a secret. It ends up in the JavaScript every visitor downloads,
and it only allows *sending* events to this one project, never reading. The
auth token **is** a secret: it can upload to and change your Sentry
organisation.

## Step 1: Make an account and an organisation

Skip this if you already made one for the API (the API starter's
`docs/setup/sentry.md`): use the same organisation.

1. Go to https://sentry.io/signup/ and create an account.
2. When asked to **create an organisation**, type an **Organization Name**
   (your company or project).
3. Choose the **Data Storage Location**: **United States** or **European
   Union**. It **cannot be changed later**; moving means a new organisation.
   - Choose the EU only if your users' data must stay in the EU. Hint: in 2026
     some EU organisations' tokens failed to upload sourcemaps (`401 Invalid
     org token`). The bug reports are closed, but if you choose the EU, look
     for `[sentry] Sourcemaps were NOT uploaded` in your first build's output
     (step 5).
4. Finish the sign-up. If the screens differ from these names, the choices are
   the same: a name and a region.

**You are done when** you see Sentry's dashboard, and its address is
`https://<your-org>.sentry.io/`. The part before `.sentry.io` is your
**organisation slug**: write it down.

## Step 2: Create the web app's project

A *project* is where one app's errors go. The web app gets its own, separate
from the API's, so their errors and alerts don't mix.

1. In the left menu, open **Projects**, then click **Create Project**.
2. **Choose a platform**: **React** (under Browser).
3. Under the features to set up, keep only **Error Monitoring**. The starter
   sends no traces or replays, so the others would only waste quota.
4. **Set your alert frequency**: **Alert me on high priority issues** is a
   good start (step 6 explains alerts).
5. **Project name**: for example `react-starter`. This becomes the
   **project slug**: write it down. Pick a **Team** (the default one is fine).
6. Click **Create Project**.
7. Sentry now shows a setup guide with code to paste, or offers to run a
   "wizard". **Skip both**: the starter already contains everything
   (`src/lib/error-tracking.ts`). You only need the DSN, next step.

**You are done when** the project appears in **Projects**, and you have the
organisation slug and the project slug written down.

## Step 3: Copy the DSN into the env file

1. Open the project: **Settings** (bottom of the left menu) → **Projects** →
   `react-starter` → **Client Keys (DSN)**. (In some versions the page is
   under **SDK Setup** → **Client Keys (DSN)**: it is the same page.)
2. Copy the **DSN**. It looks like
   `https://<key>@o<number>.ingest.us.sentry.io/<number>` (`.de.` instead of
   `.us.` in the EU).

**In development**, put it in `.env.development` and restart `pnpm dev` (Vite
reads env files only when it starts):

```bash
VITE_SENTRY_DSN=https://<key>@o<number>.ingest.us.sentry.io/<number>
```

**In production**, put the same line in `.env.production` **on the server**,
then run `./deploy.sh`. No rebuild is needed: the container reads it when it
starts, writes it into `/config.js` for the browser, and adds Sentry's host to
the Content-Security-Policy so the browser may send errors there. The same
image works with or without a DSN.

Do not put the DSN in GitHub. It is a setting of each deployment, like the
API's address.

The value is checked: it must look like `https://<key>@<host>/<project>`, with
no spaces or quotes, and not still be the template's placeholder. In
development `pnpm dev` refuses to start otherwise; in production the container
does.

One project can serve development and production: each error carries an
*environment* (`development` from `pnpm dev`, `production` from the image),
and Sentry filters by it. To keep the free quota for production, empty the
line in `.env.development` once you have seen it work.

**You are done when** the DSN is in the env file of every place you want
tracked, and [Check it works](#check-it-works) shows a test error.

## Step 4: The release (nothing to do)

A *release* tells you which version an error happened in. The starter uses the
commit: `deploy.sh` and CI set `VITE_SENTRY_RELEASE` to the first 12
characters of the commit being deployed, which is also the image's tag. Leave
`VITE_SENTRY_RELEASE` out of your env files.

**You are done when** you have left it out.

## Step 5: Readable stack traces (sourcemaps)

The production app is *minified*: squeezed into short unreadable names, so a
stack trace reads `at t (index-D7I3D5tE.js:1:40213)`. A *sourcemap* is a file
that maps that back to `at ProfileForm (ProfileForm.tsx:42:7)`. The build
uploads the sourcemaps to Sentry and then deletes them, so they are never
served to visitors (who could otherwise read your source code).

It needs three values, **all three or none**: without them the build simply
makes no sourcemaps and says so.

### 5a. The two slugs

- **Organisation slug**: the part before `.sentry.io` in your Sentry address
  (step 1), also shown in **Settings** → **General Settings** →
  **Organization Slug**.
- **Project slug**: the project's name from step 2, also shown in the
  project's **Settings** → **General Settings** (the **Name** field; if the
  label differs, it is the name in the project's address).

### 5b. An organisation auth token

1. **Settings** → **Developer Settings** → **Organization Tokens** →
   **Create New Token**.
2. Give it a name, for example `react-starter sourcemaps`. Its permissions are
   fixed (`org:ci`: enough to upload sourcemaps and releases, nothing else).
3. Click **Create**, then **copy the token now**: it is shown only once. It
   starts with `sntrys_`.

If you cannot find **Organization Tokens**, a *personal* token also works
(**User settings** → **Personal Tokens**, with **Project: Read & Write** and
**Release: Admin**), but it acts as you, in every organisation you belong to:
prefer the organisation token.

### 5c. Where the three values go

It depends on who builds the image (`DEPLOY_IMAGE_SOURCE` in
`.env.production`, see [prepare-for-production.md](./prepare-for-production.md#step-5-fill-in-envproduction)):

**GitHub builds it (`registry`)**: on GitHub, open the repository →
**Settings** → **Secrets and variables** → **Actions**.

1. **Variables** tab → **New repository variable** → **Name** `SENTRY_ORG`,
   **Value** your organisation slug → **Add variable**.
2. Again: **Name** `SENTRY_PROJECT`, **Value** your project slug → **Add
   variable**.
3. **Secrets** tab → **New repository secret** → **Name**
   `SENTRY_AUTH_TOKEN`, **Secret** the token → **Add secret**.

The next image built on `main` uploads. More on GitHub's settings:
[github.md](./github.md#step-7-error-tracking-uploads-sentry).

**The server builds it (`build`)**: add the three lines to `.env.production`
on the server, then `./deploy.sh`:

```bash
SENTRY_ORG=your-org
SENTRY_PROJECT=react-starter
SENTRY_AUTH_TOKEN=sntrys_...
```

The token reaches the build as a Docker *build secret*, never as a build
argument, so it is not kept inside the image or its history. In `registry`
mode `deploy.sh` warns that these three lines are ignored: the image is built
by GitHub, so they belong there.

**You are done when** the build output has no
`[sentry] Sourcemaps were NOT uploaded` line (on GitHub: **Actions** → the run
→ **Production image** → **Build**; on the server: the output of
`./deploy.sh`), and the project's **Source Maps** settings list the upload
([Check it works](#check-it-works)).

## Step 6 (optional): Email alerts

On the free plan Sentry notifies **by email only**. Slack, Discord and other
integrations need a paid plan, and the API's Discord alerts do not cover
browser errors. So keep the emails on.

The choice in step 2 already made an alert for high-priority issues. To add one
for every new issue:

1. Left menu: **Monitors** → **Alerts** → **Create Alert**. (In older
   versions: **Alerts** → **Create Alert Rule** → **Issues**.)
2. Choose the `react-starter` project and the `production` environment.
3. **When**: *A new issue is created*, and *The issue changes state from
   resolved to unresolved* (a "regression").
4. **Then**: notify **Suggested Assignees**, falling back to **Recently Active
   Members** (on a one-person plan, that is you).
5. Save it.
6. Check your own settings: **User Settings** → **Notifications** →
   **Alerts** must be on for email.

If the labels differ, the idea is the same: an issue alert, for this project,
for new issues, by email.

**You are done when** the alert is listed, and your notification settings send
alerts by email.

## Check it works

**In development** (DSN in `.env.development`, `pnpm dev` restarted):

1. Open `http://localhost:3001`.
2. Open the browser's developer console (F12 → **Console**) and run:

   ```js
   setTimeout(() => { throw new Error('Sentry test') })
   ```

   (`setTimeout`, not a bare `throw`: the console swallows an error thrown
   straight at its prompt.)
3. In Sentry, open the project's **Issues**. Within a minute, "Sentry test"
   appears. Set the environment filter at the top to `development` if it is
   not shown.

**In production** (DSN in `.env.production`, deployed):

1. `curl https://app.example.com/config.js` must contain `VITE_SENTRY_DSN`.
   And `docker logs react-starter-auth-prod 2>&1 | grep runtime-config` on the
   server says `error tracking on (https://o<number>.ingest...)`.
2. On the live site, run the same line in the console, with
   `'Sentry check'`.
3. In Sentry: the issue appears under the `production` environment, with the
   release set to the deployed commit.
4. Resolve or delete the test issue.

**Sourcemaps** (step 5): the console's test error contains none of the app's
code, so it cannot show them. Instead, open the project's **Settings** →
**Source Maps**: each build that uploaded is listed there (as an "artifact
bundle"). If the page is named differently, search the project's settings for
"source maps". The next real error from the app then shows file names like
`ProfileForm.tsx` in its stack trace, instead of `index-D7I3D5tE.js`.

## Common mistakes

| What you see | Cause | Fix |
|---|---|---|
| `pnpm dev` stops: `VITE_SENTRY_DSN: Not a DSN` or `Still the placeholder` | The value is not a full DSN, or still has `your-` in it | Copy it again from step 3 |
| Nothing arrives, and `/config.js` has no `VITE_SENTRY_DSN` | The container started without it: the line is missing from `.env.production`, or you edited it after deploying | Add it, `./deploy.sh` |
| The console says `Refused to connect ... Content Security Policy` when the error is sent | The page and the policy came from different starts of the container (a cached `/config.js`) | `./deploy.sh` again; check that `/config.js` is served with `no-store` |
| The request to `...ingest...sentry.io` is blocked in the browser's network tab | An ad blocker. Nothing on the server fixes this; see [../error-tracking.md](../error-tracking.md#ad-blockers) | Test in a window without extensions |
| A failed API request or a "Failed to fetch dynamically imported module" never shows up | Not sent on purpose: they are not bugs in the app ([../error-tracking.md](../error-tracking.md#what-is-reported)) | Test with the console line above |
| The test error was sent (the network tab shows a `200` from `...ingest...`) but the issue list is empty | The list is filtered by environment or time | Change the environment filter at the top of **Issues** (`development` and `production` are separate) |
| Stack traces are minified | No sourcemaps for that release: one of the three values is missing, or the token is wrong | Look for `[sentry] Sourcemaps were NOT uploaded` in the build output; check step 5 |
| Added the token, redeployed the same commit on the server, still minified | Docker reused the earlier build of that commit, which had no token | Deploy a new commit, or run `docker builder prune` on the server first |
| `401` or `Invalid org token` in the upload message, with an EU organisation | The EU token issue mentioned in step 1 | Try a new organisation token; if it persists, a personal token |
| The DSN is in GitHub's variables or secrets | Not read there: the image holds no DSN | Move it to the server's `.env.production` |
| You reach the 5,000-error limit | One noisy error repeating, or development errors counted | Resolve the noisy issue and fix its cause; empty the DSN in development. The app already limits each error to a few events per page load ([../error-tracking.md](../error-tracking.md#what-is-reported)) |
