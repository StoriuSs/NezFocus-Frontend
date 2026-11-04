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
import Home from '@/pages/Home'
import Profile from '@/features/users/pages/Profile'
// Both are downloaded on the first visit, whichever page it is.
```

With it, a page is its own chunk, fetched the first time someone opens it:

```tsx
const Home = lazy(() => import('@/pages/Home'))
const Profile = lazy(() => import('@/features/users/pages/Profile'))
// Profile's chunk is downloaded when someone goes to /profile.
```

While a lazy page's chunk downloads, React shows the nearest `<Suspense>`
fallback.

## Lazy routes

Every page in the starter is lazy. The routes are `RouteObject` lists — one
per feature, plus `src/app/public-routes.tsx` — that `src/app/router.tsx`
assembles with `createBrowserRouter`:

```tsx
// src/app/public-routes.tsx
import { lazy } from 'react'
import { RouteObject } from 'react-router-dom'

const Home = lazy(() => import('@/pages/Home'))
const FormExample = lazy(() => import('@/pages/FormExample'))

export const publicRoutes: RouteObject[] = [
    { path: '/', element: <Home /> },
    { path: '/form', element: <FormExample /> }
]
```

The auth pages (`src/features/auth/routes.tsx`), the profile
(`src/features/users/routes.tsx`) and the 404 page (`router.tsx`) are lazy
the same way.

The `<Suspense>` boundary is in `src/app/layout/MainLayout.tsx`, around the
page outlet and inside the error boundary, so the header stays on screen
while a page loads:

```tsx
<ErrorBoundary key={pathname} onReset={resetQueryErrors}>
    <Suspense fallback={<PageLoader />}>
        <Outlet />
    </Suspense>
</ErrorBoundary>
```

## The chunks a build makes

`pnpm build` prints every chunk with its size. Besides one chunk per page,
`vite.config.ts` puts the libraries that change rarely in chunks of their
own — `react` (React and React Router), `i18n`, `query` (TanStack Query,
axios, Zustand) and `ui` (Radix, sonner, lucide). A deploy that changes only
app code leaves those file names, and the browser's cached copies, untouched.

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
    background: hsl(var(--primary)); /* follows the theme */
    height: 2px;
}
```

## When to split, and when not to

**Split:** pages (already done), heavy components that only some pages use
(charts, editors), dialogs that are rarely opened.

**Don't split:** small helpers, anything every page uses (the header), very
small components — each chunk is one more request.

## Prefetching

To make a page instant, start downloading its chunk before the click, for
example on hover:

```tsx
const ProfileLink = () => {
    const prefetch = () => import('@/features/users/pages/Profile')

    return (
        <Link to='/profile' onMouseEnter={prefetch}>
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
