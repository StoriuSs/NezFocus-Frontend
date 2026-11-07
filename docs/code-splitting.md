# Code splitting

The built app is split into several JavaScript files ("chunks"), so a visitor
downloads the code for the page they open, not for every page. This page is
how the starter splits it, what the loading indicators do, and why the
spinner is usually not seen.

- [What code splitting is](#what-code-splitting-is)
- [Lazy routes](#lazy-routes)
- [The chunks a build makes](#the-chunks-a-build-makes)
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

One more is loaded only when needed: **`error-sdk`**, the Sentry SDK (about
30 kB gzipped). The browser downloads it only when error tracking is on, that
is when the deployment has a DSN ([error-tracking.md](./error-tracking.md)).

The files are named with a hash of their content (`index-D7I3D5tE.js`), so
nginx can tell browsers to cache them for a year: a changed file gets a new
name.

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
