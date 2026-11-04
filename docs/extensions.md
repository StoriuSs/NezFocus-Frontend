# Extensions

Things this starter deliberately does **not** include, each of which some
projects genuinely need. For each: what it is, the sign you have reached the
point of needing it, and how it would fit here.

None of this is in the repository, and that is the point — a starter that
ships every feature anyone might want is not a starter.

- [Storybook](#storybook)
- [Progressive web app](#progressive-web-app)
- [Feature flags](#feature-flags)
- [Analytics and session replay](#analytics-and-session-replay)
- [Real-time updates](#real-time-updates)
- [More than one language of content](#more-than-one-language-of-content)
- [In the backend's list too](#in-the-backends-list-too)

## Storybook

**What it is.** A second application that renders your components on their
own, in every state, without needing the rest of the app or a signed-in user
or the right data in the database.

**The sign you need it.** A designer or a non-React developer wants to see the
components. Or you have a component with six states and reaching the sixth in
the real app takes five minutes of clicking. Or you keep breaking a shared
component and finding out from a page that uses it.

**How it fits.**

```bash
pnpm dlx storybook@latest init
```

- Stories live next to the component: `Button.stories.tsx` beside
  `Button.tsx`. A story in a distant folder is a story nobody updates.
- Start with the shared things — `src/components/ui/` and
  `src/components/form/`. Feature components usually need context and are
  less worth the effort.
- Components that read from TanStack Query or the auth store need those
  providers in a decorator, which is the moment you discover which components
  are doing more than rendering.
- It has a real cost: another dependency tree, another build, and stories that
  go stale exactly like documentation does. Worth it for a design system
  several people use; rarely worth it for an application one person is
  building.

## Progressive web app

**What it is.** A service worker that lets the site load without a network,
plus a manifest so it can be installed to a home screen.

**The sign you need it.** Users on phones, on unreliable connections, who come
back often. A dashboard people open once a week on a laptop does not need one.

**How it fits.**

```bash
pnpm add -D vite-plugin-pwa
```

- Precache the built assets. They are hashed and immutable, which is exactly
  what a cache wants.
- **Do not cache API responses in the service worker.** TanStack Query already
  owns that, and two caches with different ideas of what is fresh is a
  debugging job nobody enjoys.
- **Never let it cache `index.html` or `/config.js`.** Those are the two files
  the runtime configuration depends on; a cached copy pins users to an old
  build pointed at an old API. `nginx.conf` sends `no-store` on both, and the
  service worker has to respect it.
- Plan for the update prompt. A service worker serves the old version until
  the tab is closed, so you need a "new version available, reload" toast or
  people will keep reporting bugs you fixed last week.

## Feature flags

**What it is.** Turning a feature on and off without deploying, and turning it
on for some users before everyone.

**The sign you need it.** A branch stays open because the UI is not ready to
be seen, or you want a beta group, or you want to switch something off without
a rollback.

**How it fits.** The backend decides — see the backend's `docs/extensions.md`
for the storage side. On this side, flags arrive in one of two ways:

- **In the profile response**, as a list of enabled flags. Simplest: no new
  request, and it refreshes with everything else.
- **From a service** (PostHog, Unleash, Flagsmith) with its own React SDK and
  its own provider.

Either way, one hook — `useFeature('new-checkout')` — so the source can change
without touching every component. And delete the flag in the same PR that
makes the feature permanent: four stale flags mean sixteen combinations, and
nobody tests sixteen combinations.

## Analytics and session replay

**What it is.** What people actually do: which pages, which buttons, where
they give up. Session replay records the interactions so you can watch one
back.

**The sign you need it.** You are guessing about how the product is used, and
the guesses are starting to decide things.

**How it fits.** [Sentry](./error-tracking.md) is already wired, and the
`@sentry/react` package it uses also does session replay — so it needs no new
dependency, which makes it the cheapest starting point. It is not a pure
configuration change: the app loads only the parts of the SDK it uses
(`src/lib/error-sdk.ts`), so export `replayIntegration` there and add it to
`init` in `src/lib/error-tracking.ts`, and expect that chunk to grow
noticeably. PostHog and Plausible are the usual alternatives; Plausible if you
want page-level numbers without personal data.

Three things to get right, and they are the same three every time:

- **The Content-Security-Policy.** Anything that sends data to a third party
  needs its origin in `connect-src` (and a script from elsewhere in
  `script-src`). The policy is generated by `scripts/csp.mjs` during the
  build, and the origins only known per deployment are filled in at container
  start by `nginx/40-runtime-config.sh` — add a fixed origin in
  `scripts/csp.mjs`, a per-deployment one in both, rather than loosening the
  policy.
- **Consent**, if your users are in the EU or the UK. Load the script after
  consent, not before, and remember that a replay of a form is a recording of
  what someone typed into it.
- **Masking.** Session replay records everything by default. Mask inputs,
  tokens and anything personal before you turn it on, not after.

## Real-time updates

**What it is.** The server pushing changes to the browser instead of waiting
to be asked.

**The sign you need it.** Something must update without the user acting:
notifications, a live feed, presence, collaborative editing.

**How it fits.** Try polling first — genuinely. TanStack Query does it in one
line:

```ts
useQuery({ queryKey: userKeys.profile(), queryFn: fetchProfile, refetchInterval: 30_000 })
```

Thirty seconds is fresh enough for most things people call "real-time", it
survives every proxy in the world, and it needs no server work at all.

When it is not enough, the backend side is in its `docs/extensions.md`. On
this side:

- **Server-sent events** are a browser built-in (`EventSource`) and one-way,
  which is usually all you need. It cannot send an `Authorization` header —
  so fetch a short-lived ticket and connect with that, rather than putting a
  token in the query string where it lands in every access log.
- **Websockets** when the browser must send too. `socket.io-client`, or the
  native `WebSocket` with your own reconnection.
- Either way, **update the TanStack Query cache** with what arrives
  (`queryClient.setQueryData`) rather than keeping a second copy in a store.
  Two sources of truth for the same data is the bug you will be chasing for a
  week.

## More than one language of content

**What it is.** [i18n](./i18n.md) already translates the interface. This is
about *content* — articles, product descriptions, anything stored in the
database — existing in several languages.

**The sign you need it.** You are about to put a second language of content
into a `title` column.

**How it fits.** It is mostly a backend and schema question: a translations
table, or a JSON column keyed by locale. On this side, send the user's locale
with the request (`Accept-Language`, or an explicit parameter) and **include
it in the query key**, or React Query will serve the English copy after the
user switches to Vietnamese:

```ts
export const articleKeys = {
    detail: (id: string, locale: string) => ['articles', id, locale] as const
}
```

## In the backend's list too

The backend starter's `docs/extensions.md` covers audit logs, tracing,
circuit breakers and the transactional outbox. Feature flags and real-time
updates appear in both, because they need a half on each side.

## Related

- [project-structure.md](./project-structure.md) — where a new feature goes
- [data-fetching.md](./data-fetching.md) — query keys and invalidation
- [error-tracking.md](./error-tracking.md) — Sentry, already wired
- [environment.md](./environment.md) — settings and the generated CSP
