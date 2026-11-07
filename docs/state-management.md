# State management

Where each kind of state lives in this starter, and why. The short rule:
**data the API owns belongs to TanStack Query; the little that is left is in
a few small Zustand stores, or in a component.**

- [What goes where](#what-goes-where)
- [The stores](#the-stores)
- [Using a store](#using-a-store)
- [Coming from Vue and Pinia](#coming-from-vue-and-pinia)
- [Why Zustand](#why-zustand)

## What goes where

| State | Lives in | Example |
| --- | --- | --- |
| Data the API owns (the profile, a list of orders) | TanStack Query, one hook per resource | `useProfile()` in `src/features/users/api/` ([data-fetching.md](./data-fetching.md)) |
| Who is signed in | The auth store, `src/features/auth/auth.store.ts` | `useAuthStore((s) => s.user)` |
| The access token | Module memory, `src/features/auth/lib/access-token.ts` — not a store, not storage | read only by the store and the API client |
| The theme | The theme store, `src/hooks/useTheme.ts` | `useTheme()` |
| A removed avatar waiting out its "Undo" | `useAvatarRemoval`, `src/features/users/lib/avatar-removal-state.ts` | read by `useProfile` |
| A form's values and errors | React Hook Form | [shadcn-forms.md](./shadcn-forms.md) |
| Whether a dialog is open, a tab, a hover | `useState` in the component | — |

**Don't copy server data into a store.** The copy is what goes stale: a
mutation updates the query cache, and the store keeps showing the old value.
The auth store holds who is signed in (id, email, username, display name,
roles) because route guards and role checks need it before any query runs;
the full profile is still the `useProfile` query, which the store seeds at
sign-in so your menu (`MeMenu`) does not ask twice.

## The stores

**The auth store** (`useAuthStore`):

| Field / action | What it is |
| --- | --- |
| `isAuthenticated` | A session is in hand |
| `isSigningOut` | A sign-out is under way: guards wait instead of sending anyone to sign in |
| `user` | `{ id, email, username, displayName, roles }`, or `null` |
| `initAuth()` | On page load: restore the session from the refresh cookie, if this browser has one |
| `signIn()`, `startSession()`, `resumeFromCookie()` | Start a session: with a password, from tokens the API returned (confirming the address, resetting the password), or after Google |
| `getToken()`, `refreshToken()` | The access token for a request, refreshed when it is about to expire |
| `logout(reason?, to?)` | End the session here, on the API and in the other tabs, then reload the app |

**Tokens are not in the store.** The access token sits in
`access-token.ts`'s module memory: not in `localStorage` or
`sessionStorage`, which any script on the page can read. The refresh token is
an httpOnly cookie the app never sees. How the session works:
[auth/session.md](./auth/session.md).

**The theme store** (`useThemeStore`, used through `useTheme()`): the chosen
theme (`light`, `dark` or `system`) and what is on screen. It is one store
rather than state inside the hook so every component — the toaster included —
sees the same choice ([theme-system.md](./theme-system.md)).

**The avatar removal flag** (`useAvatarRemoval`, `{ pending }`): true while a
removed profile picture waits out its 8-second "Undo" (S-ME-02). Meanwhile
`useProfile` hides the avatar everywhere (its `select`), though the API still
has it; `avatar-removal.ts` sends the `DELETE` when the wait runs out, or as
the tab closes. It is not server data copied into a store: it is what the
person did and the API has not heard yet. It sits in a file of its own
because `useProfile` reads it and is in the first download; the removal logic
stays in the profile page's chunk.

## Using a store

Select only what the component needs. A component re-renders when the value it
selected changes, not when anything in the store does:

```tsx
import { useAuthStore } from '@/features/auth/auth.store'

function Greeting() {
    const user = useAuthStore((state) => state.user)
    const logout = useAuthStore((state) => state.logout)

    return (
        <p>
            Hello {user?.displayName ?? user?.username}
            <button onClick={() => logout()}>Log out</button>
        </p>
    )
}
```

Outside React (an axios interceptor, a test), read it without a hook:
`useAuthStore.getState().isAuthenticated`.

For a role check, use the helpers rather than reading `roles` yourself:
`useHasRole('admin')`, or `<RequireRole role='admin'>…</RequireRole>`
(`src/features/auth/components/RequireRole.tsx`). They only hide things: the API checks
the role on every request.

## Coming from Vue and Pinia

Zustand is close to Pinia: a store defined once, used from any component, no
provider to wrap the app in.

| | Pinia (Vue) | Zustand (React) |
| --- | --- | --- |
| Define | `defineStore('auth', { state, actions })` | `create((set, get) => ({ ...state, ...actions }))` |
| Read | `store.user` | `useStore((s) => s.user)` — a selector |
| Change | `this.user = user` in an action | `set({ user })` in an action |
| Getters | `computed` in the store | Derive in the selector, or in the component |

```ts
// Vue (Pinia)
export const useCounter = defineStore('counter', {
    state: () => ({ count: 0 }),
    actions: { increment() { this.count++ } }
})

// React (Zustand)
export const useCounter = create<{ count: number; increment: () => void }>((set) => ({
    count: 0,
    increment: () => set((state) => ({ count: state.count + 1 }))
}))
```

More of the Vue-to-React mapping: [react-concepts.md](./react-concepts.md).

## Why Zustand

- **No provider.** The API client reads the session from outside React
  (`useAuthStore.getState()`, through the auth feature's `apiSession`), which
  a context-based store cannot offer.
- **Small** (about 1 kB), with no boilerplate.
- **Little to hold.** With server data in TanStack Query, the app's own state
  is the session and the theme. Redux's structure would be paid for and not
  used.
