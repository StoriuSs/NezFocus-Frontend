<div align="center">

# React Starter

A React + TypeScript web app, ready to put in front of users: sign-in against
its paired API, an API client that follows that API's conventions, two
languages, dark mode, tests, and a production image with CI and deploys.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)

</div>

---

> ### Start here
>
> - **[Read the tour →](./OVERVIEW.md)** — what is in this starter, how the
>   pieces fit, and where to find anything. One page, about fifteen minutes.
> - **[Prepare for development →](./docs/setup/prepare-for-development.md)** —
>   from a fresh machine to signing in on your own copy, step by step.
> - **[Prepare for production →](./docs/setup/prepare-for-production.md)** —
>   from a domain name to a first deploy, with a checklist.
> - **[How sign-in works →](./docs/auth/README.md)** — the auth pages, the
>   session, and what the API does for them.

---

## Features

- **Sign-in, done by the API itself** (no identity server): sign up with an
  email and password and confirm the address with an emailed code, sign in,
  "Continue with Google", two-step sign-in with an authenticator app and
  recovery codes, forgotten-password reset, a session that survives a reload
  and stays in step across tabs, sign out everywhere, and deleting the account
- **Cloudflare Turnstile** on the sign-up, sign-in and forgotten-password forms,
  shown only when the API has it on
- **Internationalization** — i18next, English and Vietnamese
- **Dark mode** — light, dark or the system's setting, remembered, with no
  flash of the wrong one on load
- **Type-safe forms** — React Hook Form + zod
- **Code splitting** — lazy-loaded routes, a navigation progress bar
- **Error handling** — error boundaries at two levels
- **API integration** — axios with `snake_case` ⇄ `camelCase` conversion,
  types generated from the API's OpenAPI document, idempotency keys per user
  intent
- **State** — TanStack Query for server data, a small Zustand store for the
  session
- **Tests** — Vitest + React Testing Library, and Playwright in real browsers
- **One image, every environment** — the settings are read when the container
  starts, not built into the bundle
- **Error tracking** — Sentry, off unless you set a DSN; the SDK is downloaded
  only when it is on
- **CI and deploys** — GitHub Actions, a published image, `./deploy.sh` with
  automatic rollback

## Tech stack

| Category | Technology |
|----------|------------|
| **Build** | Vite 7 + React 19 + TypeScript |
| **Styling** | Tailwind CSS + shadcn/ui components |
| **Auth** | The paired NestJS API's own sign-in ([docs/auth/README.md](./docs/auth/README.md)) |
| **State** | Zustand + TanStack Query v5 |
| **Forms** | React Hook Form + zod |
| **i18n** | react-i18next |
| **Testing** | Vitest + React Testing Library, Playwright |

## Sign-in in one paragraph

Every rule lives in the API (the paired NestJS starter): passwords, codes,
limits, sessions. This app shows the pages and follows the API's answers. The
API answers a sign-in with a short-lived **access token**, which this app keeps
in memory only, and a **refresh token** in an httpOnly cookie — a cookie that
JavaScript cannot read, so a script injected into the page cannot steal it.
When the access token is about to run out, or a reload has wiped it, the app
trades the cookie for a new one. The pages:

| Page | What it is for |
|---|---|
| `/sign-up` | Create an account; the API emails a 6-digit code |
| `/verify-email` | Enter the code; confirming the address also signs you in |
| `/sign-in` | Email and password, or "Continue with Google" |
| `/sign-in/two-step` | The code from the authenticator app (or a recovery code), when two-step sign-in is on |
| `/forgot-password`, `/reset-password` | An emailed code, then a new password; that also signs you in |
| `/auth/callback` | Where the API sends the browser back after Google |
| `/settings` | Change the password, set a first one (accounts made with Google), two-step sign-in, sign out everywhere |
| `/profile` | The profile, the avatar, and deleting the account |

The details: [docs/auth/README.md](./docs/auth/README.md).

### What the API must be told about this app

| API setting | Value | Without it |
|---|---|---|
| `CORS_ORIGINS` | This app's address: `http://localhost:3001` in development (the API's default), `https://app.example.com` in production | The browser refuses every answer from the API |
| `CORS_CREDENTIALS` | `true` | The refresh cookie is never sent, and a reload signs you out |
| `FRONTEND_URL` | This app's address, as above | Links in emails, and the return from Google, point at the wrong site |

Sign-up needs the API's **email**: the confirmation code arrives by mail. In
development the API's stack catches every email in **Mailpit**, at
http://localhost:8025. Google sign-in and Turnstile need **no setting in this
app**: they are configured on the API, and this app asks it what is on
(`GET /auth/options`).

## Quick start

The full walkthrough, with the API: [docs/setup/prepare-for-development.md](./docs/setup/prepare-for-development.md).
The short version, with the API already running on `http://localhost:8888`:

1. **Node 22 and pnpm.** `.nvmrc` names Node 22; `engines` in `package.json`
   requires 22 or newer, and pnpm refuses to install on anything older
   (`engine-strict` in `.npmrc`). pnpm's version is pinned by `packageManager`;
   Corepack, which ships with Node, gives you that one:

   ```bash
   corepack enable
   pnpm install
   ```

2. **Settings.** Copy `.env.example` to `.env.development` (what `pnpm dev`
   and `pnpm docker:dev` read). The one required setting is already the API
   starter's development address:

   ```env
   VITE_API_URL=http://localhost:8888/api/v1
   ```

   `pnpm dev` refuses to start, naming it, if it is missing or malformed.

3. **Run it.**

   ```bash
   pnpm dev
   ```

   Open http://localhost:3001, choose **Sign In** → **Sign up**, and read the
   code in Mailpit (http://localhost:8025).

## Scripts

| Script | What it does |
|--------|-------------|
| `pnpm dev` | Development server on port 3001 |
| `pnpm build` | Type-check (`tsc -b`) and build for production |
| `pnpm preview` | Serve the production build locally |
| `pnpm lint` / `pnpm lint:fix` | ESLint, and ESLint fixing what it can |
| `pnpm format` / `pnpm format:check` | Prettier: rewrite, or only check |
| `pnpm test` | All unit tests, once |
| `pnpm test:watch` | Unit tests, re-run on change |
| `pnpm test:coverage` | Unit tests with a coverage report |
| `pnpm test:e2e` | Playwright, in real Chromium and Firefox ([e2e-testing.md](./docs/e2e-testing.md)) |
| `pnpm api:types` | Regenerate the API types from the API's OpenAPI document |
| `pnpm api:types:check` | Fail if the committed API types are out of date |
| `pnpm load:spa` | Load-test a running production build ([load-testing.md](./docs/load-testing.md)) |
| `pnpm docker:dev` / `pnpm docker:down` | The app in Docker with hot reload, and stopping it |
| `pnpm docker:prod` / `pnpm docker:down:prod` | The production image on your machine, and stopping it |

## Project structure

```
src/
├── app/              # The shell
│   ├── App.tsx       # Restores the session, then the query client, router and toaster
│   ├── router.tsx    # The route tree, from each feature's routes
│   ├── public-routes.tsx
│   └── layout/       # MainLayout: header, account menu, error boundary
├── components/       # Shared UI
│   ├── ui/           # shadcn/ui primitives
│   └── form/         # FormField: label, control and error
├── config/           # Settings and their schema
├── features/         # One folder per feature
│   ├── auth/         # Session store, the eight auth pages, Turnstile, Google, route and role guards
│   └── users/        # Profile: api/ (queries), components/, pages/, routes.tsx, types.ts
├── hooks/            # Shared React hooks
├── i18n/             # Translations (en, vi)
├── lib/              # The API client, query client, error tracking, helpers
├── pages/            # Pages outside any feature (home, form example, not found)
└── test/             # Test setup
```

More: [docs/project-structure.md](./docs/project-structure.md).

## Documentation

| Topic | Page |
|-------|------|
| **The tour** | **[OVERVIEW.md](./OVERVIEW.md) — the whole starter in one page** |
| Setting up, step by step | [docs/setup/](./docs/setup/README.md) — [development](./docs/setup/prepare-for-development.md), [production](./docs/setup/prepare-for-production.md) |
| Sign-in | [docs/auth/](./docs/auth/README.md) |
| Getting started (short) | [getting-started.md](./docs/getting-started.md) |
| Making it yours | [making-it-yours.md](./docs/making-it-yours.md) — what to rename when you start a project |
| Project structure | [project-structure.md](./docs/project-structure.md) |
| Components | [components.md](./docs/components.md) |
| Internationalization | [i18n.md](./docs/i18n.md) |
| Theme | [theme-system.md](./docs/theme-system.md) |
| Code splitting | [code-splitting.md](./docs/code-splitting.md) |
| Data fetching | [data-fetching.md](./docs/data-fetching.md) |
| State management | [state-management.md](./docs/state-management.md) |
| Forms | [shadcn-forms.md](./docs/shadcn-forms.md) |
| API types from OpenAPI | [api-types.md](./docs/api-types.md) |
| Unit tests | [testing.md](./docs/testing.md) |
| End-to-end tests | [e2e-testing.md](./docs/e2e-testing.md) |
| Load testing | [load-testing.md](./docs/load-testing.md) |
| Settings | [environment.md](./docs/environment.md) |
| Docker | [docker.md](./docs/docker.md) |
| Going to production | [deployment-guide.md](./docs/deployment-guide.md) |
| Deploying | [deploy.md](./docs/deploy.md) |
| Preparing a server | [server.md](./docs/server.md) |
| Error tracking | [error-tracking.md](./docs/error-tracking.md) |
| CI | [ci.md](./docs/ci.md) |
| Git hooks | [git-hooks.md](./docs/git-hooks.md) |
| Dependency updates | [renovate.md](./docs/renovate.md) |
| What is not here | [extensions.md](./docs/extensions.md) |

## Key concepts

### State

- **Server data** → TanStack Query (cached, retried, invalidated after changes)
- **The session** → a small Zustand store (`features/auth/auth.store.ts`); the
  access token itself sits in a module of its own, in memory
- **Form state** → React Hook Form

More: [docs/state-management.md](./docs/state-management.md).

### Where the queries live

TanStack Query hooks live in each feature's `api/` folder:

```tsx
import { useProfile } from '@/features/users/api/useProfile'
import { useUpdateProfile } from '@/features/users/api/useUpdateProfile'
```

## Customization

### Adding a page

1. Create the page: `src/features/<feature>/pages/MyPage.tsx` for a feature's
   page, or `src/pages/MyPage.tsx` for one that belongs to no feature.
2. Add its route. **Behind sign-in:** inside the `children` of the
   `ProtectedRoute` entry in that feature's `routes.tsx` — a route next to that
   entry, rather than inside it, is public:

   ```tsx
   const MyPage = lazy(() => import('@/features/users/pages/MyPage'))

   export const usersRoutes: RouteObject[] = [
       {
           element: (
               <ProtectedRoute>
                   <Outlet />
               </ProtectedRoute>
           ),
           children: [
               { path: '/profile', element: <Profile /> },
               { path: '/my-page', element: <MyPage /> } // behind sign-in
           ]
       }
   ]
   ```

   **Public:** in `src/app/public-routes.tsx`. A new feature's routes are
   added to `src/app/router.tsx`, next to the others.
3. Add a link in `src/app/layout/MainLayout.tsx` (optional).

### Adding translations

Add the key to `src/i18n/locales/en/common.json` **and** `vi/common.json` (a
test fails if the two differ):

```json
{
  "myKey": "My translated text"
}
```

Use it:

```tsx
const { t } = useTranslation()
<p>{t('myKey')}</p>
```

### Adding shadcn components

```bash
pnpm dlx shadcn@latest add [component-name]
```

It writes the component into `src/components/ui/`, where you can edit it.
That is the point of shadcn/ui: the components are yours, not a dependency.

## Testing

```tsx
// A component
it('renders a loading spinner', () => {
  render(<PageLoader />)
  expect(document.querySelector('.animate-spin')).toBeInTheDocument()
})

// A hook
it('can set theme to dark', () => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setTheme('dark'))
  expect(result.current.theme).toBe('dark')
})
```

Only what is absolutely necessary gets a test: the bar is in
[docs/testing.md](./docs/testing.md#what-we-test), along with how the auth
tests stand in for the API. The browser tests need the API, its
Mailpit, and Turnstile off or on Cloudflare's test keys:
[docs/e2e-testing.md](./docs/e2e-testing.md).

## The paired backend

This starter is built against the NestJS hexagonal starter
([Nest-Hexagonal-No-Keycloak](https://github.com/StoriuSs/Nest-Hexagonal-No-Keycloak)).
The two share a contract rather than code:

- **The API's OpenAPI document generates the types here** (`pnpm api:types`),
  so a changed response shape is a TypeScript error rather than a runtime
  surprise. See [api-types.md](./docs/api-types.md).
- **The wire format is `snake_case`**, the code is `camelCase`, and
  `src/lib/case-transform.ts` converts both ways.
- **Errors are matched on `meta.type`**, not on the message, so the text can
  change and be translated without breaking anything.

The pages that are not about signing in work against any backend that speaks
the same envelope. The auth pages need the API's auth routes.

## License

No license file is included. Add the one you choose (`LICENSE` at the root)
before you publish your project.
