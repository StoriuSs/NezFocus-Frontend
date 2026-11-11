# Project structure

Where everything lives, and the one rule that decides where new code goes.

- [The rule](#the-rule)
- [The tree](#the-tree)
- [What is in each folder](#what-is-in-each-folder)
- [Adding a page](#adding-a-page)
- [Adding a feature](#adding-a-feature)
- [How data flows](#how-data-flows)
- [Growing it further](#growing-it-further)

## The rule

**Code that belongs to one feature lives with that feature. Everything else is
shared.**

The alternative — a `components/` folder, a `queries/` folder, a `stores/`
folder, each holding bits of every feature — reads well in a tree diagram and
badly in practice: working on "profile" means jumping between four folders,
and deleting a feature means hunting its pieces out of all of them.

So `src/features/users/` holds the profile page, the components only that page
uses, its API hooks, its types and its routes. `src/components/ui/` holds the
button that everything uses.

## The tree

```
react-starter/
├── docs/                      # Documentation
├── e2e/                       # Playwright tests (a real browser)
├── k6/                        # Load-test script
├── nginx/                     # The production container's web server
├── public/                    # Served as-is, not processed by Vite
├── scripts/                   # API types, the CSP generator, CI's image check and pull retries;
│                              #   constraints/: the checks behind check:fast, check:task, check:full and CI (CONSTRAINTS.md)
└── src/
    ├── app/                   # The shell: routing and layout
    │   ├── App.tsx            # Restores the session, then the query client, router and toaster
    │   ├── router.tsx         # The route tree
    │   └── layout/            # AuthShell + BrandPanel (sign-in pages);
    │                          #   app-shell/ — AppShell, Rail, ListColumn, MeMenu
    ├── assets/mascot/         # The mascot's still pictures, shown until Rive is ready
    ├── components/            # Shared UI, used by more than one feature
    │   ├── ui/                # shadcn/ui primitives (button, dialog, input, tooltip…) and the project's own
    │   │                      #   (icon-button, segmented-control, select, option-cards, empty-state…)
    │   ├── shell/             # ShellPage, RightPanel — what a page in the AppShell draws
    │   ├── brand/             # Logo; mascot/ (Mascot, RiveMascot)
    │   ├── form/              # FormField — the label/control/error pattern; FormMessage, TimeZoneCombobox
    │   ├── settings/          # SaveBar, SettingsRow, SwitchRow — the rows of a settings page
    │   └── ErrorBoundary.tsx, PageLoader.tsx, LanguageToggle.tsx, Banner.tsx, ImageCropDialog.tsx, …
    ├── config/                # env.ts and its zod schema; site.ts (the product's name); zod.ts (zod without eval, imported first)
    ├── features/              # ← most new code goes here
    │   ├── auth/              # The session, the eight auth pages, Google, route guards
    │   │   ├── pages/         # SignIn, Register, Verify, Welcome, ForgotPassword,
    │   │   │                  #   ResetPassword, OAuthCallback, Settings
    │   │   ├── components/    # AuthCard, PasswordInput, PasswordRules, CodeInput, OAuthButtons,
    │   │   │                  #   CodeReset, ChangePasswordDialog, ConfirmPasswordDialog, SessionsSection,
    │   │   │                  #   DeleteAccountSection, DeleteAccountDialog, PendingDeletionDialog,
    │   │   │                  #   ProtectedRoute, RequireRole
    │   │   ├── api/           # auth.api.ts (every call to /auth), keys.ts, the query hooks
    │   │   ├── hooks/         # useOAuthProviders, useCodeReset
    │   │   ├── lib/           # The pages' paths, the access token (in memory only), tab sync,
    │   │   │                  #   form errors and problems, password rules, sign-out reasons,
    │   │   │                  #   the sign-in way remembered, the deletion day, sending a reset code
    │   │   ├── auth.store.ts  # Who is signed in; sign-in, refresh, sign-out
    │   │   ├── routes.tsx     # authRoutes (sign-in pages, GuestOnlyRoute; /welcome, IncompleteOnlyRoute),
    │   │   │                  #   authAppRoutes (/settings/account; /settings redirects)
    │   │   ├── types.ts
    │   │   └── index.ts       # What other features may import
    │   ├── servers/           # Servers: the rail's list, channels, invites, server settings
    │   │   ├── api/           # servers.api.ts, layout.api.ts, invites.api.ts, roles.api.ts, moderation.api.ts,
    │   │   │                  #   keys.ts; the hooks: useServers, useCreateServer, useChannelLayout, useInvites,
    │   │   │                  #   useRoles, useModeration, useServerSettings, useMembership
    │   │   ├── components/    # CreateServerDialog, NoServers, ServerIcon, ServerMenuItems; channel-list/,
    │   │   │                  #   dialogs/ (channels, categories), invites/, membership/ (leave, hand over, delete),
    │   │   │                  #   settings/ (ServerNameForm, ServerIconSetting, WelcomeChannelSetting, OwnerSettings,
    │   │   │                  #   InvitesSettings, Pagination; members/, roles/)
    │   │   ├── hooks/         # useFoldedCategories (the categories folded, kept in this browser), useMoveAwayFrom,
    │   │   │                  #   useServerGoneWatch (D-143, run by the AppShell)
    │   │   ├── lib/           # paths (SERVERS_PATHS and channelPath, invitePath, serverSettingsPath, roleEditPath),
    │   │   │                  #   layout-messages (the words for a refused name or move), invite-problem,
    │   │   │                  #   channel-layout, channel-list, drop-target, layout-error, invites, moderation,
    │   │   │                  #   membership, permissions, roles, server-name, settings-sections, typed-name
    │   │   ├── pages/         # ChannelPage (/channels/:serverId/:channelId?), ServerSettingsPage
    │   │   │                  #   (/servers/:serverId/settings/…), InvitePage (/invite/:code)
    │   │   ├── *.store.ts     # create-server, channel-dialogs, invite-dialogs, membership-dialogs: which dialog
    │   │   │                  #   the AppShell shows
    │   │   ├── routes.tsx     # serversInviteRoutes (AuthShell), serversChannelRoutes, serversSettingsRoutes (AppShell)
    │   │   ├── types.ts
    │   │   └── index.ts       # What other features may import
    │   └── users/             # The profile and the account's settings
    │       ├── api/           # users.api.ts (fetchProfile, removeAvatar),
    │       │                  #   settings.api.ts (fetchSettings, settingsQuery, updateSettings), hooks, keys
    │       ├── components/    # AvatarSection, AvatarCropDialog, ProfileForm, ProfileSkeleton,
    │       │                  #   SettingsLoader, TimeZoneSetting
    │       ├── hooks/         # useAvatarErrorRefresh, useAccountSettings (the AppShell applies
    │       │                  #   the account's theme and language)
    │       ├── lib/           # USERS_PATHS, profile-text (the API's name and bio rules),
    │       │                  #   avatar-removal (Undo, then DELETE) and its pending flag,
    │       │                  #   settings-sync (the other tabs)
    │       ├── pages/         # Profile.tsx (/settings/profile); Appearance, Notifications, Privacy
    │       │                  #   (/settings/appearance, /notifications, /privacy), one chunk via Preferences.tsx
    │       ├── routes.tsx     # This feature's routes
    │       ├── types.ts
    │       └── index.ts       # What other features may import
    ├── hooks/                 # Shared hooks: useTheme, useMediaQuery, useDebouncedValue, useCountdown, useMinuteClock,
    │                          #   useDocumentTitle, useIdempotentMutation
    ├── i18n/                  # i18next setup and the translation catalogues (settings.ts, deletion.ts, servers.ts: words loaded with their pages)
    ├── lib/                   # Shared, feature-free: the API client, and friends
    ├── pages/                 # Pages that belong to no feature: Study, Legal, NotFound
    ├── styles/fonts.css       # The self-hosted fonts
    ├── test/                  # Vitest setup
    ├── main.tsx               # Entry point
    └── index.css              # Tailwind and the design tokens (DESIGN.md)
```

## What is in each folder

### `public/`

| File | Why it matters |
| --- | --- |
| `config.js` | An empty placeholder (`window.__APP_CONFIG__ = {}`) for development. In production the container serves its own `/config.js` instead, written at start from its environment ([environment.md](./environment.md)). `index.html` loads it before the app |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon-180.png` | The app tile (DESIGN.md › Logo), from `design/assets/brand/` |
| `email-logo-64.png` | The logo in the backend's emails, which link to it here (the API serves no files of its own); nothing in the web app uses it |
| `mascot/runtime.riv` | The Rive mascot `RiveMascot` loads; `src/assets/mascot/` holds the still pictures shown until it is ready |

### `src/app/`

The shell. `src/main.tsx` sets up i18n and error tracking, then renders
`App.tsx`, which restores the session (`initAuth`, showing a spinner until it
knows) and then renders the `QueryClientProvider`, the `RouterProvider` and
the `Toaster`, with a `TooltipProvider` around the router. There is no theme
provider: the theme is a small Zustand store
(`src/hooks/useTheme.ts`), applied before React loads by a script in
`index.html`.

`router.tsx` assembles the route tree with `createBrowserRouter` from each
feature's own `routes.tsx`, so adding a feature does not mean editing one
central list of every route in the application. Its `AppRoot` holds what
sits outside any layout: the navigation progress bar. `/` redirects: to
`/study` when signed in, to `/login` otherwise. `/terms` and `/privacy` sit
outside both layouts, for everyone.

Two layouts, each lazy, each with the page's error boundary and Suspense
boundary around its outlet:

- `layout/AuthShell.tsx` — the sign-in pages, "complete your account", and
  an invite (`/invite/:code`) opened by a visitor:
  the logo, the form, the language toggle (with **Sign out** beside it on
  `/welcome`), and `BrandPanel` from 1024 up.
- `layout/app-shell/AppShell.tsx` — every page after sign-in, behind
  `ProtectedRoute` (which also sends an account that has not done "complete
  your account" to `/welcome`): the rail (with your menu, `MeMenu`), the list column and
  the page. Each route in it says which list column it wants in
  `handle: { column }`: `study`, `server`, `serverSettings` or `settings`.
  It also draws the servers feature's dialogs (create a server, the channel
  and category dialogs, invite, join from an invite), each loaded with
  `lazy()` the first time its store opens it.

### `src/components/`

Shared UI only. `ui/` is [shadcn/ui](https://ui.shadcn.com) — components
copied into the repository rather than installed, so they can be edited —
and a few written for this project in the same style (`select`,
`option-cards`, `empty-state`, … : [components.md](./components.md)).
`form/FormField.tsx` is the one place that decides how a label, a control and
a validation error are laid out; `form/FormMessage.tsx` does the same for a
message about the whole form. `shell/` is what a page inside the AppShell
draws: `ShellPage` (its header, body and optional right panel) and
`RightPanel` with `usePanel`.

**A component used by exactly one feature does not belong here.** It belongs
in that feature's `components/`.

### `src/config/`

`env.ts` reads settings and validates them with zod (`env.schema.ts`), so a
missing or malformed value fails immediately and by name instead of surfacing
as `undefined` somewhere far away. It merges `window.__APP_CONFIG__` — written
by the container at start-up — over Vite's build-time values, which is what
lets one image serve every environment. See
[environment.md](./environment.md). `site.ts` holds the product's name
(`siteConfig.name`, the tab title's suffix); `zod.ts` turns off zod's
`eval`-based parser for the CSP and is imported first by `main.tsx`.

### `src/features/`

Where most new code goes. Each feature owns its pages, its components, its API
hooks and its types.

`auth/` is a capability as much as a set of pages: the auth store,
`ProtectedRoute`, `GuestOnlyRoute` and `RequireRole` are used by everything
else, beside the eight pages — sign-in, create an account, enter the code,
complete your account, forgotten and reset password, the Google return page,
and settings
([auth/in-the-code.md](./auth/in-the-code.md)). Deleting an account is the
**Delete account** group on the account page (`/settings/account`,
`DeleteAccountSection`); restoring one is the dialog `GuestOnlyRoute` shows
over a sign-in page (`PendingDeletionDialog`).

`servers/` is the rail's servers, their channel list (drag to reorder,
categories folded), the channel and category dialogs, invites (the visitor's
`/invite/:code` page, a join dialog when signed in) and the server settings
pages (overview, roles, members, invites, bans). Its dialogs open from many
places, so which one is open lives in three small stores the AppShell reads
([state-management.md](./state-management.md)).

### `src/lib/`

Shared and feature-free.

| File | What it does |
| --- | --- |
| `api.ts` | The axios instance: the token, `snake_case` ⇄ `camelCase`, and the response interceptor: a 401 for an expired, unreadable or revoked token (`REFRESHABLE`: `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_REVOKED`, since another tab may have left a newer session in the shared cookie, D-74) is refreshed and retried once; a 401 that a refresh cannot fix, or a 403 `AUTH_ACCOUNT_DISABLED`, signs out; a 403 `ACCOUNT_INCOMPLETE` opens "complete your account"; a 403 `ACCOUNT_PENDING_DELETION` opens the restore dialog |
| `api-error.ts` | Turns an error into the message the user sees, keyed on `meta.type` |
| `api-types.ts`, `api-schema.d.ts` | Types generated from the backend's OpenAPI document — see [api-types.md](./api-types.md) |
| `case-transform.ts` | The key conversion, which survives `FormData`, `Blob` and arrays |
| `idempotency.ts` | Makes an `Idempotency-Key` value; `src/hooks/useIdempotentMutation.ts` keeps one per user intent |
| `query-client.ts` | TanStack Query defaults: what gets retried, and one error toast per failed mutation |
| `error-tracking.ts`, `error-sdk.ts` | Sentry: loaded only when a DSN is set, and what is scrubbed — see [error-tracking.md](./error-tracking.md) |
| `safe-storage.ts` | `localStorage` and `sessionStorage` that do not throw when site data is blocked |
| `navigation.ts` | A full page load (`hardNavigate`), e.g. after signing out |
| `utils.ts` | `cn()`, which merges Tailwind classes |
| `crop-image.ts` | Cuts the chosen area out of a picture as a JPEG, longest edge 1024; used by `ImageCropDialog` |
| `image-file.ts` | `imageProblem()`: JPG, PNG or WEBP up to 8 MB (an avatar, a server icon), checked before the cropper opens |
| `before-sign-out.ts` | Work that must be sent before the tab signs out or closes (a removed avatar waiting out its Undo); the auth store runs it while the token is still in hand |
| `time-zones.ts` | The time zones to pick from (C-25), named and ordered, and the search over them; `wallClock()`, the calendar and clock in a zone (times shown in the account's zone) |
| `phase-sound.ts` | `playPhaseSound()`: the phase sound, two short notes (C6 then E6) made with Web Audio (D-140), silent where the browser cannot play. "Play sample" on Notifications now, the end of a study phase later |
| `simple-markdown.ts` | The small Markdown subset the legal pages are written in, read into blocks React draws (never `innerHTML`) |

### `src/pages/`

Only pages that belong to no feature: `Study` (the app's home after
sign-in), `Legal` (`/terms` and `/privacy`, from the Markdown in
`pages/legal/content/<vi|en>/`), `NotFound`.
Anything with its own data or components belongs in `features/`.

## Adding a page

For a page that is just a page — no data of its own:

1. `src/pages/MyPage.tsx`, drawing its header with `ShellPage`
   (`src/components/shell/ShellPage.tsx`).
2. Add it to the AppShell's `children` in `src/app/router.tsx`, with the list
   column it wants:

```tsx
// Lazy, like the others: the page is fetched when someone goes there, not
// bundled into the first load. See code-splitting.md.
const MyPage = lazy(() => import('@/pages/MyPage'))

// in the AppShell entry's children:
...column('study')([{ path: '/my-page', element: <MyPage /> }]),
```

Everything in the AppShell's `children` is behind sign-in: the AppShell is
wrapped in `ProtectedRoute`. A route listed next to that entry, rather than
inside it, is public.

Behind a role as well: wrap the page's content (or a button) in
`<RequireRole role='admin'>`. That only hides it; the API must check the role
too ([auth/in-the-code.md](./auth/in-the-code.md)).

## Adding a feature

For anything with its own data, components or state:

```
src/features/orders/
├── api/
│   ├── orders.api.ts      # the calls to the API; only the hooks import it
│   ├── keys.ts            # the query keys, in one place
│   ├── useOrders.ts
│   └── useCreateOrder.ts
├── components/
│   └── OrderCard.tsx
├── pages/
│   └── Orders.tsx
├── hooks/                 # hooks that are not data fetching, if any
├── lib/
│   └── paths.ts           # ORDERS_PATHS (the patterns routes.tsx declares) and the functions links build paths with
├── orders.store.ts        # a small Zustand store, only for state several far-apart components share
├── index.ts               # what other features may import
├── routes.tsx
└── types.ts
```

Then add the feature's routes in `src/app/router.tsx`. A feature exports one
list per place its pages go; `servers/routes.tsx` has three. The invite page
is a visitor's, so it goes in the AuthShell; the other two go in the
AppShell's `children`, each with its own list column:

```tsx
{ element: <AuthShell />, children: [...authRoutes, ...serversInviteRoutes] },
// in the AppShell entry's children:
...column('server')(serversChannelRoutes),
...column('serverSettings')(serversSettingsRoutes),
...column('settings')([...authAppRoutes, ...usersRoutes])
```

A new column name goes in `ShellHandle['column']`
(`src/components/shell/shell-context.ts`) and in `ListColumn.tsx`.
`routes.tsx` imports its paths from `./lib/paths`, not from the feature's
`index.ts`: the router is in the first download
([code-splitting.md](./code-splitting.md)).

Habits worth keeping:

- **Query keys in one file per feature.** Two files each inventing
  `['profile']` is how a mutation ends up invalidating the wrong query — or
  failing to invalidate the right one. See
  [data-fetching.md](./data-fetching.md).
- **Keep cross-feature imports few, and through `index.ts`.** Each feature
  exports what others may use from its `index.ts`, and an ESLint rule refuses
  a deep import from one feature into another (every folder under
  `src/features` is held by it from its first file), or from `src/pages` into
  a feature. Needing
  many is the first sign the boundary is in the wrong place — either the thing
  belongs in `lib/` or `components/`, or the two features are really one.
  Features import one way (`users ← auth ← servers`). When the one imported
  needs the other, it declares a port and is handed it: deleting the account
  (auth) asks the servers it owns through `ServerOwnership`
  (`auth/lib/server-ownership.ts`), the servers feature answers
  (`servers/api/serverOwnership.ts`), and the AppShell connects the two
  ([auth/account-settings.md](./auth/account-settings.md#an-owner-of-servers)).
- **Shared code imports no feature.** `src/lib`, `src/components` and
  `src/hooks` are refused any `@/features/...` import. When shared code needs
  something a feature owns, it says what in an interface and is handed it: the
  API client declares `ApiSession`, auth implements it, and `main.tsx`
  connects the two. `src/app` is the exception: it wires the features into the
  app, so it may reach in.
- **A component or page reaches the API through a hook.** A feature's
  `components/` and `pages/` may not import `@/lib/api` or an `api/*.api.ts`
  file (types excepted); the sign-in pages of auth are the exception
  ([data-fetching.md](./data-fetching.md)).
- **Features do not make idempotency keys.** `@/lib/idempotency` is refused
  in `src/features`: send the request from a hook built on
  `useIdempotentMutation`, which keeps one key per intent. The one exception
  is `servers/api/useCreateServer.ts` (CONSTRAINTS.md, exception E1): "Try
  again" on a new server's picture runs from a toast after the dialog has
  closed, so the key travels with the retry.
- **An index is not free.** A feature's `index.ts` imported from the first
  download puts every module it re-exports there too, if any chunk uses it.
  Export from it what other features need, and keep page-only modules out
  ([code-splitting.md](./code-splitting.md#what-lands-in-the-first-download)).

## How data flows

```
Component
   ↓  calls a hook
src/features/<feature>/api/useThing.ts    (TanStack Query)
   ↓  calls
src/lib/api.ts                            (axios: token, case conversion)
   ↓  HTTP
the backend
```

State splits the same way:

- **Server state** — anything the backend owns — belongs to TanStack Query.
  Do not copy it into a store; the copy is what goes stale.
- **Client state** — the theme, whether a dialog is open, the auth session —
  belongs in a hook or a small Zustand store.

See [state-management.md](./state-management.md) and
[data-fetching.md](./data-fetching.md).

## Growing it further

This structure carries an application a long way. One thing to do as it
grows:

**Split shared UI when it earns it.** If `src/components/` grows past a screen
or two, the usual next step is separating the design-system primitives from
the application's own composite components — often as a package, if more than
one application uses them.

What **not** to do: move things back into `components/`, `hooks/` and `api/`
folders at the root because a feature folder looks empty. A feature folder
with three files in it is fine. A shared folder with three features' worth of
files in it is the problem this structure exists to avoid.

## Related

- [components.md](./components.md) — shadcn/ui and the component conventions
- [data-fetching.md](./data-fetching.md) — TanStack Query, keys, invalidation
- [state-management.md](./state-management.md) — what goes where
- [code-splitting.md](./code-splitting.md) — lazy routes
- [environment.md](./environment.md) — settings, build-time and runtime
