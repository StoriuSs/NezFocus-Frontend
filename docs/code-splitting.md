# Code splitting

The built app is split into several JavaScript files ("chunks"), so a visitor
downloads the code for the page they open, not for every page. This page is
how the starter splits it, what the loading indicators do, and why the
spinner is usually not seen.

- [What code splitting is](#what-code-splitting-is)
- [Lazy routes](#lazy-routes)
- [The chunks a build makes](#the-chunks-a-build-makes)
- [What lands in the first download](#what-lands-in-the-first-download)
- [Why the spinner is often skipped](#why-the-spinner-is-often-skipped)
- [The two loading indicators](#the-two-loading-indicators)
- [When to split, and when not to](#when-to-split-and-when-not-to)
- [Prefetching](#prefetching)
- [Further reading](#further-reading)

## What code splitting is

Without it, every page is in one bundle:

```tsx
import Study from '@/pages/Study'
import Profile from '@/features/users/pages/Profile'
// Both are downloaded on the first visit, whichever page it is.
```

With it, a page is its own chunk, fetched the first time someone opens it:

```tsx
const Study = lazy(() => import('@/pages/Study'))
const Profile = lazy(() => import('@/features/users/pages/Profile'))
// Profile's chunk is downloaded when someone goes to /settings/profile.
```

While a lazy page's chunk downloads, React shows the nearest `<Suspense>`
fallback.

## Lazy routes

Every page is lazy. The routes are `RouteObject` lists — one per feature —
that `src/app/router.tsx` assembles with `createBrowserRouter`, next to the
few pages it declares itself:

```tsx
// src/app/router.tsx
const AuthShell = lazy(() => import('@/app/layout/AuthShell'))
const AppShell = lazy(() => import('@/app/layout/app-shell/AppShell'))
const Study = lazy(() => import('@/pages/Study'))
const NotFound = lazy(() => import('@/pages/NotFound'))
```

The auth pages (`src/features/auth/routes.tsx`) and the profile
(`src/features/users/routes.tsx`) are lazy the same way. So are the two
layouts: a visitor on the sign-in page does not download the AppShell, and a
signed-in user does not download the AuthShell.

Small pages on the same data can share one lazy import. Appearance &
language, Notifications and Privacy are one chunk:
`src/features/users/pages/Preferences.tsx` imports the three and renders the
one its route names, and `src/features/users/routes.tsx` makes one
`lazy(() => import('@/features/users/pages/Preferences'))` for the three
routes. Each lazy import adds its loader to the first download, so three
small pages read together are cheaper as one.

Each layout (`src/app/layout/AuthShell.tsx`,
`src/app/layout/app-shell/AppShell.tsx`) has a `<Suspense>` boundary around
its page outlet, inside the error boundary, so the logo or the rail stays on
screen while a page loads:

```tsx
<ErrorBoundary key={pathname} onReset={resetQueryErrors}>
    <Suspense fallback={<PageLoader />}>
        <Outlet />
    </Suspense>
</ErrorBoundary>
```

`AppRoot` in `router.tsx` has one more `<Suspense>`, around the layouts, for
while a layout itself loads.

## The chunks a build makes

`pnpm build` prints every chunk with its size. Besides one chunk per page,
`vite.config.ts` puts the libraries that change rarely in chunks of their
own — `react` (React and React Router), `i18n` and `query` (TanStack Query,
axios, Zustand). A deploy that changes only app code leaves those file
names, and the browser's cached copies, untouched.

UI libraries (Radix, lucide, sonner) have no chunk of their own on purpose:
Rollup puts them with the pages that use them. As one shared chunk, every UI
library any lazy page used was downloaded before the first screen, and that
chunk grew with each new page.

Fonts (`src/styles/fonts.css`, self-hosted `.woff2` files) are never inlined
into the stylesheet (`assetsInlineLimit` in `vite.config.ts`): each stays a
file, so the browser downloads only the subsets a page uses.

Two more are loaded only when needed: **`error-sdk`**, the Sentry SDK (about
30 kB gzipped). The browser downloads it only when error tracking is on, that
is when the deployment has a DSN ([error-tracking.md](./error-tracking.md)).
And **`socket`**, socket.io-client with `src/lib/socket.ts` (about 13 kB
gzipped), fetched with `import()` by `useRealtimeConnection` once the
AppShell has painted: the first screen loads over REST, live updates start a
moment later.

The files are named with a hash of their content (`index-D7I3D5tE.js`), so
nginx can tell browsers to cache them for a year: a changed file gets a new
name.

## What lands in the first download

The first download is the entry chunk: `src/main.tsx` and everything it
imports, directly or not, whichever page opens. A module there pulls its
imports in with it, and Rollup does not split a feature's `index.ts`
(a barrel) by what each importer uses:

- `src/features/auth/auth.store.ts` is in the first download (`main.tsx`
  and `App.tsx` import the auth feature), and it imports `@/features/users`.
  So the users index is there, and **every module it re-exports that any chunk uses**
  is placed there too, even if the first screen never runs it.
- Hence a module only lazy pages need stays out of the index. The AppShell
  imports `useAccountSettings` by its file path
  (`@/features/users/hooks/useAccountSettings`); `src/app` may import deep,
  as it wires the features in. A feature cannot (the ESLint rule), so
  another feature reads the settings straight from the cache the AppShell
  fills: `useQuery(settingsCache)`, the key with
  `queryFn: skipToken` (`api/settingsCache.ts`, exported by the index; a query
  without a queryFn logs an error). It imports only `userKeys`, so no new
  module reaches the first download.
- What only the AppShell and the settings pages use is kept apart:
  `src/features/users/api/settings.api.ts` (`fetchSettings`,
  `settingsQuery`, `updateSettings`) is not in `users.api.ts`, and the
  `settings` words load with the pages
  ([i18n.md](./i18n.md#words-that-load-with-their-pages)).
- The same trap, met in M0's slice L14: `src/features/auth/index.ts`
  exported `DeleteAccountDialog`. That index is imported by the entry, so
  the dialog came with the first download, and with it react-hook-form, zod
  and the `Dialog` code, though only the account page shows it. Removing
  the export (the account page imports the group by its file path) took the
  first download's JS from 246.72 kB to 235.31 kB gzipped, under the same
  246.75 kB limit. Likewise the restore dialog, which only an account
  waiting to be deleted sees, is a `lazy()` import in `GuestOnlyRoute`, and
  the `deletion` words come with the chunks that use them.

When another feature does need a heavy component, the index exports it
lazily: `src/features/auth/index.ts` has
`export const ConfirmPasswordDialog = lazy(() => import('./components/ConfirmPasswordDialog'))`.
The first download carries only that `lazy()` wrapper; the dialog, its form
and the emailed-code reset are a chunk of their own, fetched the first time
the servers feature's handover step opens it (inside a `Suspense`). A
channel's chat is the same: `src/features/messaging/index.ts` exports
`ChannelChat` lazily, and the servers feature's `ChannelPage` shows it in a
`Suspense`; its hooks, words and components come with it (6.9 kB gzipped at
M2 L3, 12 kB at L4a). Its classes come with it too: a second Tailwind
config (`tailwind.messaging.config.js`) builds `messaging.css` from the
messaging feature's files only, `ChannelChat` imports it, and Vite emits it
as the chunk's own stylesheet; `tailwind.config.js` leaves that folder out,
so the stylesheet loaded before the first screen does not grow with the chat
(CONSTRAINTS.md, "Chat CSS" in `.size-limit.mjs`; owner's call at M2 L4a).

The pins panel (S-CHAT-02) is in the same chunk: `index.ts` exports
`PinsPanel` as `lazy(() => import('./components/ChannelChat').then((chat) =>
({ default: chat.PinsPanel })))`, and `ChannelChat.tsx` re-exports it, so it
comes with the chat's stylesheet and no second copy of the chat's code.
The emoji picker's data, `emojibase-data` in the person's language (about 93
kB gzipped each), is read with `import()` the first time the picker opens
(`lib/emoji-data.ts`): two chunks of their own, never in the chat's. Vite
warns that they are over 500 kB before gzip; they are data, read once.

The chat's file holds only the classes the rest of the app does not use:
its config blocks every class candidate of the other files, read with
Tailwind's own extractor. It loads after the main file, and a class written
in both would beat the main file's rules everywhere in the app, not only in
the chat (first seen at L4a: the chat's plain `text-center` turned
DialogHeader's `text-center sm:text-left` centred in every dialog once a
channel opened). `pnpm size` fails if the two files share a class. A class
the chat starts using that another feature already uses simply comes from
the main file.
A type
export (`export type { ConfirmPasswordDialogProps }`) costs nothing.

Check after adding to an index, or importing one from somewhere new: run
`pnpm build` and look at the entry chunk (`index-*.js`) in the list it prints.

## Why the spinner is often skipped

React Router runs navigations as **transitions**: while the next page's chunk
loads, the current page stays on screen and usable, and the Suspense fallback
is skipped. React considers a moment of the old page better than a spinner
flashing for 50–200 ms. So:

| You see the `PageLoader` spinner | You don't |
| --- | --- |
| On the first load of the app, while the first page's chunk arrives | When navigating on a fast connection |
| On a slow connection, for a page not loaded before | In development (Vite serves modules quickly) |
| | For a page whose chunk is already cached |

## The two loading indicators

### `PageLoader` — the Suspense fallback

`src/components/PageLoader.tsx`: a centred spinner, shown in place of the
page while its chunk loads, when React shows a fallback at all (above).

### `NavigationProgress` — the bar at the top

`src/components/NavigationProgress.tsx`: a thin bar (NProgress) that starts
on every navigation (`PUSH`) and finishes when the new location renders. It
gives feedback even when the transition hides the spinner. It is rendered
once, in `AppRoot` in `src/app/router.tsx`, outside any layout.

| Situation | PageLoader | Progress bar |
|----------|------------|-----------|
| First load of the app | Shows | — |
| Fast navigation | Hidden by the transition | Shows |
| Slow navigation | May show | Shows |

To change the bar's look, edit `src/components/nprogress-custom.css`:

```css
#nprogress .bar {
    background: rgb(var(--primary)); /* follows the theme */
    height: 2px;
}
```

## When to split, and when not to

**Split:** pages (already done), heavy components that only some pages use
(charts, editors), dialogs that are rarely opened.

**Don't split:** small helpers, anything every page uses (the rail), very
small components — each chunk is one more request.

## Prefetching

To make a page instant, start downloading its chunk before the click, for
example on hover:

```tsx
const ProfileLink = () => {
    const prefetch = () => import('@/features/users/pages/Profile')

    return (
        <Link to='/settings/profile' onMouseEnter={prefetch}>
            Profile
        </Link>
    )
}
```

The same `import()` is used by the lazy route, so the browser fetches the
chunk once.

## Further reading

- [React: `lazy`](https://react.dev/reference/react/lazy)
- [Vite: code splitting](https://vitejs.dev/guide/features.html#code-splitting)
- [load-testing.md](./load-testing.md) — checks the cache headers on the chunks
