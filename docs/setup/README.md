# Setting up the outside services

This folder takes you from a fresh clone to a running web app, first on your
own machine, then on the internet. Read this page first: it says which
services the web app needs, which ones it does not, and in what order to set
them up.

- [The short answer](#the-short-answer)
- [The pages, in order](#the-pages-in-order)
- [Every service at a glance](#every-service-at-a-glance)
- [Set up on the API, not here](#set-up-on-the-api-not-here)
- [What the web app reads from the API by itself](#what-the-web-app-reads-from-the-api-by-itself)

## The short answer

The web app needs **almost no outside services of its own**. It is a set of
static files in the visitor's browser. Everything about sign-in (passwords,
codes, Google, email, avatars) is done by the API, which
is a separate starter (the Nest API starter, `Nest-Hexagonal-No-Keycloak`).
So most "keys" you will collect go into the **API's** env file, not this one.

What the web app itself needs:

| You want to... | You need |
|---|---|
| Run it on your machine | Node, pnpm and the API running locally. No accounts anywhere. |
| See errors that happen in visitors' browsers | A Sentry project for the web app (optional) |
| Have GitHub test every push and build the production image | A GitHub repository (optional, but recommended) |
| Put it on the internet | A server, a domain name with a DNS record, and an HTTPS certificate |

## The pages, in order

1. [prepare-for-development.md](./prepare-for-development.md): from a fresh
   machine to the app running at `http://localhost:3001`, with a first account
   signed in. Start here.
2. [sentry.md](./sentry.md): error tracking for the browser, click by click.
   Optional in development, recommended in production.
3. [github.md](./github.md): CI, the image registry, the Deploy button and
   Renovate, click by click.
4. [prepare-for-production.md](./prepare-for-production.md): from nothing to
   `https://app.example.com`, step by step, with the checks that catch the
   mistakes between the web app and the API.

Each page ends a step with "You are done when ...". Do not go to the next step
until that is true: almost every problem later on comes from a step that
looked finished but was not.

## Every service at a glance

| Service | What it is for here | Development | Production | Cost | Page |
|---|---|---|---|---|---|
| The API (Nest API starter) | Sign-in, accounts, every piece of data | **Required** | **Required** | Your server | The API starter's `docs/setup/README.md` |
| Node 22 and pnpm | Running and building the app | **Required** | Not needed: the image is built inside Docker, on the server or on GitHub | Free | [prepare-for-development.md](./prepare-for-development.md#step-1-install-the-tools) |
| Docker | The API's local stack; the production container | **Required** for the API | **Required** | Free (Docker Desktop is free for personal and small business use) | [prepare-for-development.md](./prepare-for-development.md#step-1-install-the-tools) |
| Sentry (a React project) | Errors from visitors' browsers | Optional | Recommended | Free plan: 5,000 errors a month, shared with the API's project | [sentry.md](./sentry.md) |
| GitHub | Code, CI checks, the image registry (GHCR), the Deploy button, Renovate | Optional | Recommended | Free; private repositories get 2,000 Actions minutes a month | [github.md](./github.md) |
| A domain and DNS | `app.example.com` pointing at your server | No | **Required** | About 10 USD a year for the domain | [prepare-for-production.md](./prepare-for-production.md#step-2-point-the-sites-name-at-the-server), and the API starter's `docs/setup/domain-dns-tls.md` |
| A server | Runs the container and the host's nginx | No | **Required** | From about 5 USD a month | [../server.md](../server.md) |
| Let's Encrypt (certbot) | The HTTPS certificate | No | **Required** | Free | [prepare-for-production.md](./prepare-for-production.md#step-8-put-nginx-and-https-in-front) |

## Set up on the API, not here

These services are configured once, in the **API's** env file. The web app has
no setting for any of them. Follow the API starter's pages, which are in its
own repository (they are named here, not linked, because the two repositories
are cloned separately):

| Service | API starter page | What changes in the web app |
|---|---|---|
| Sign in with Google | `docs/setup/google-sign-in.md` | The "Continue with Google" button appears by itself |
| Email (the codes people type to sign up and reset a password) | `docs/setup/email.md` | Nothing. Without email, nobody can finish signing up |
| Storage for avatars (S3, R2) | `docs/setup/storage-s3-r2.md` | Nothing, as long as the bucket is served over `https`. See `CSP_IMG_SRC` in [prepare-for-production.md](./prepare-for-production.md#step-5-fill-in-envproduction) |
| Off-site backups | `docs/setup/offsite-backups.md` | Nothing: the web app stores no data |
| Sentry (the API's own project) | `docs/setup/sentry.md` | Nothing. Use the same Sentry organisation; the web app gets a project of its own ([sentry.md](./sentry.md)) |
| Grafana Cloud | `docs/setup/grafana-cloud.md` | Nothing |
| Discord alerts | `docs/setup/discord-alerts.md` | Nothing |
| Uptime check | `docs/setup/uptime-check.md` | Add a second monitor for `https://app.example.com/` |
| Domain, DNS, HTTPS | `docs/setup/domain-dns-tls.md` | Add one more DNS record, for the web app's name |

The API starter also has the same kind of walkthroughs: its
`docs/setup/prepare-for-development.md` and
`docs/setup/prepare-for-production.md`. Do the API's walkthrough first, then
this one: the web app is useless without an API to talk to.

## What the web app reads from the API by itself

When a page with a sign-in form opens, the web app asks the API
`GET /api/v1/auth/options` and gets back:

- `providers`: the sign-in providers the API has keys for (`google`, or none).
  The app shows a button for each one it knows.

So turning Google on or off is a change to the API's env file and
an API restart. The web app needs no new setting, no rebuild and no deploy.

The one address the web app does need is the API's: `VITE_API_URL`
(for example `https://api.example.com/api/v1`). Every other setting is
optional. The full list is in [../environment.md](../environment.md), and how
the app handles sign-in is in [../auth/README.md](../auth/README.md).
