# Components

The shared components in `src/components/`, and the ones in the layout that
every page shows. Components used by one feature only live in that feature's
`components/` folder ([project-structure.md](./project-structure.md)).

- [Where they are](#where-they-are)
- [Error handling](#error-handling)
- [Loading states](#loading-states)
- [The layout and the header](#the-layout-and-the-header)
- [Switchers](#switchers)
- [Forms](#forms)
- [Modals](#modals)
- [shadcn/ui components](#shadcnui-components)

## Where they are

```
src/components/
├── ui/                    # shadcn/ui primitives (button, dialog, input…)
├── form/FormField.tsx     # Label, control and error, wired for screen readers
├── ErrorBoundary.tsx      # Catches a page that crashes
├── RouteErrorPage.tsx     # The full-page screen for a crash outside any page
├── PageLoader.tsx         # The spinner while a page's chunk loads
├── NavigationProgress.tsx # The bar at the top during navigation
├── LanguageSwitcher.tsx   # English / Tiếng Việt
└── ThemeSwitcher.tsx      # Light / dark / system

src/app/layout/MainLayout.tsx                      # The header and the page area
src/features/users/components/ProfileSkeleton.tsx  # The profile page's placeholder
src/features/users/components/UsernamePromptModal.tsx
src/features/auth/components/                      # The auth pages' pieces
```

## Error handling

### `ErrorBoundary`

Catches an error thrown while rendering its children and shows a fallback
instead of a blank page.

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary'

// In MainLayout — around the page outlet, INSIDE the layout
<ErrorBoundary key={pathname} onReset={resetQueryErrors}>
    <Suspense fallback={<PageLoader />}>
        <Outlet />
    </Suspense>
</ErrorBoundary>

// With your own fallback
<ErrorBoundary fallback={<CustomError />}>
    <RiskyComponent />
</ErrorBoundary>
```

**Where to put it:** inside layouts, around the part that can fail. A boundary
*outside* the layout replaces the header and navigation with the fallback,
leaving the user no way out but a reload.

- `key={pathname}` clears the error when the user navigates elsewhere.
- `onReset` runs before "Try again" re-renders — MainLayout passes React
  Query's `reset`, so queries that threw are fetched again rather than
  re-throwing their cached error.

What the fallback offers:

- "Try again", to render the page again
- "Refresh page", for a full reload
- After a chunk-load failure (a tab left open across a deploy), only
  "Refresh page": React caches the failed import, so trying again cannot work
- The error's details, in development only

**Errors that escape it** — a crash in the layout itself — reach the root
route's `errorElement`, `RouteErrorPage`: a standalone full-page screen that
depends on nothing that might have failed. Both kinds are reported to error
tracking when it is on ([error-tracking.md](./error-tracking.md)).

## Loading states

### `PageLoader`

A centred spinner: the `<Suspense>` fallback while a lazy page's chunk loads.
It is in `MainLayout`, around the page outlet. See
[code-splitting.md](./code-splitting.md) for why it is often not seen.

### `NavigationProgress`

A thin bar at the top of the page during navigation. Rendered once, in
`AppRoot` (`src/app/router.tsx`), which sits above every layout in the route
tree that `createBrowserRouter` builds:

```tsx
function AppRoot() {
    return (
        <>
            <NavigationProgress />
            <UsernamePromptWrapper />
            <Outlet />
        </>
    )
}
```

It exists because React Router's transitions keep the old page on screen
during a fast navigation and skip the spinner; the bar shows something is
happening.

### `Skeleton`

A grey, pulsing placeholder in the shape of the content to come.

```tsx
import { Skeleton } from '@/components/ui/skeleton'

<Skeleton className='h-8 w-48' />              // a line of text
<Skeleton className='h-20 w-20 rounded-full' /> // an avatar
```

### `ProfileSkeleton`

The profile page's layout in skeletons, shown while the profile loads.

```tsx
import { ProfileSkeleton } from '@/features/users/components/ProfileSkeleton'

if (isPending) return <ProfileSkeleton />
```

## The layout and the header

`src/app/layout/MainLayout.tsx` is the shell every page is rendered in:

- **The logo**, linking home.
- **The language and theme switchers**.
- **"Form example"**, a link to the demo form.
- **Signed out: a "Sign In" button.** On any page but home and the auth pages
  themselves, it remembers the page (`/sign-in?redirect=/that/page`), so
  signing in comes back to it.
- **Signed in: the account menu** — the avatar (initials when there is no
  picture; a broken picture URL is refreshed once), the display name and
  `@username`, then **Profile**, **Settings** and **Log out**. Log out shows
  a "Logging out" toast and ends the session ([auth/session.md](./auth/session.md)).
- **The page area**, inside the error boundary and the Suspense boundary
  above.

The menu's data is the `useProfile` query, the same one the profile page
uses, so a change there shows here at once.

## Switchers

### `ThemeSwitcher`

A dropdown: light, dark, or the system's setting. It uses `useTheme()`
([theme-system.md](./theme-system.md)).

### `LanguageSwitcher`

A dropdown of the languages, each with its flag ([i18n.md](./i18n.md)).

## Forms

### `FormField`

`src/components/form/FormField.tsx` lays out a label, a control and its error
or hint, and wires them for screen readers (`htmlFor`, `aria-invalid`,
`aria-describedby`):

```tsx
<FormField label={t('email')} error={errors.email?.message}>
    {(control) => <Input type='email' {...control} {...register('email')} />}
</FormField>
```

More: [shadcn-forms.md](./shadcn-forms.md).

## Modals

### `UsernamePromptModal`

Asks a signed-in user without a username to choose one, after their first
sign-in. It cannot be closed without choosing, but offers "Not you? Sign out".
See [username-prompt.md](./username-prompt.md).

### `DeleteAccountDialog`

On the profile page: deleting the account, with proof it is you
([auth/account-settings.md](./auth/account-settings.md)).

## shadcn/ui components

`src/components/ui/` holds Radix UI primitives styled with Tailwind, copied
into the repository by the shadcn CLI, so you can edit them:

| Component | What it is |
|-----------|-------------|
| `Avatar` | A profile picture with a fallback |
| `Button` | Default, secondary, outline, ghost, destructive and link variants |
| `Dialog` | Modal dialogs |
| `DropdownMenu` | Menus, like the account menu |
| `Input` | Text inputs |
| `Label` | Form labels |
| `Skeleton` | Loading placeholders |
| `Slider` | A range input (the avatar crop's zoom) |
| `Sonner` | The toaster, following the theme |
| `Textarea` | Multi-line text |

### Adding one

```bash
pnpm dlx shadcn@latest add [component-name]
```

It reads `components.json` and writes the component into `src/components/ui/`.
The catalogue: https://ui.shadcn.com/docs/components
