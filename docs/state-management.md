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
| The account's settings (theme, language, time zone, switches) | TanStack Query, key `userKeys.settings()`, loaded by the AppShell | `useSettings()` inside the users feature; elsewhere `useQuery({ queryKey: userKeys.settings(), enabled: false })` |
| The theme on screen | The theme store, `src/hooks/useTheme.ts`, set from the settings once signed in | `useTheme()` |
| A removed avatar waiting out its "Undo" | `useAvatarRemoval`, `src/features/users/lib/avatar-removal-state.ts` | read by `useProfile` |
| A form's values and errors | React Hook Form | [shadcn-forms.md](./shadcn-forms.md) |
| Which servers dialog is open, and on what (create a server, a channel or category dialog, invite friends, join from an invite, leave, hand over or delete a server) | `useCreateServerDialog`, `useChannelDialogs`, `useInviteDialogs`, `useMembershipDialogs` (`src/features/servers/*.store.ts`); the AppShell draws the dialogs | `useCreateServerDialog((s) => s.show)` |
| Whether a dialog its own component opens is open, a tab, a hover | `useState` in the component | — |

**Don't copy server data into a store.** The copy is what goes stale: a
mutation updates the query cache, and the store keeps showing the old value.
The auth store holds who is signed in (id, email, username, display name,
roles), and whether the account is complete or waits to be deleted
(`isComplete`, `deletesAt`), because route guards and role checks need it
before any query runs;
the full profile is still the `useProfile` query, which the store seeds at
sign-in so your menu (`MeMenu`) does not ask twice.

## The stores

**The auth store** (`useAuthStore`):

| Field / action | What it is |
| --- | --- |
| `isAuthenticated` | A session is in hand |
| `isComplete` | The account has done "complete your account" (D-61); while false the app's pages send to `/welcome`. True when signed out |
| `isSigningOut` | A sign-out is under way: guards wait instead of sending anyone to sign in |
| `isLoadingAccount` | Signed in, the profile on the way: the sign-in pages stay as they are until it is known whether the account is complete or waits to be deleted |
| `user` | `{ id, email, username, displayName, roles }`, or `null` |
| `deletesAt` | When the account goes, if its owner asked to delete it (D-141), or `null`. While set, the guards keep the person on sign-in under the restore dialog |
| `initAuth()` | On page load: restore the session from the refresh cookie, if this browser has one |
| `signIn()`, `startSession()`, `resumeFromCookie()` | Start a session: with a password, from tokens the API returned (confirming the address, resetting the password), or after Google |
| `getToken()`, `refreshToken()` | The access token for a request, refreshed when it is about to expire |
| `logout(reason?, to?, deletesAt?)` | End the session here, on the API and in the other tabs, then reload the app |
| `markIncomplete()`, `markComplete()`, `markPendingDeletion(deletesAt)` | What the API said about the account: `ACCOUNT_INCOMPLETE` and `ACCOUNT_PENDING_DELETION` (from `api-session.ts`), or "complete your account" done here or in another tab |
| `takeSignOutReason()`, `peekSignOutReason()`, `peekDeletesAt()` | Why the last session ended, and the day the account goes, for the sign-in page's banner and the toasts; `take` reads it once |
| `restoreAccount()`, `setRestoreAside()` | The restore dialog's two choices: restore the account, or end the session without a reload ([auth/session.md](./auth/session.md#an-account-waiting-to-be-deleted)) |

**Tokens are not in the store.** The access token sits in
`access-token.ts`'s module memory: not in `localStorage` or
`sessionStorage`, which any script on the page can read. The refresh token is
an httpOnly cookie the app never sees. How the session works:
[auth/session.md](./auth/session.md).

**The theme store** (`useThemeStore`, used through `useTheme()`): the chosen
theme (`light`, `dark` or `system`) and what is on screen. It is one store
rather than state inside the hook so every component — the toaster included —
sees the same choice ([theme-system.md](./theme-system.md)). Signed in, the
choice is the account's: the settings query holds it, and
`useAccountSettings()` (mounted by the AppShell) calls `setTheme()` with it.
The store is not a second copy to keep in step by hand; it is what the page
shows, and what `index.html` reads before the next load.

**The avatar removal flag** (`useAvatarRemoval`, `{ pending }`): true while a
removed profile picture waits out its 8-second "Undo" (S-ME-02). Meanwhile
`useProfile` hides the avatar everywhere (its `select`), though the API still
has it; `avatar-removal.ts` sends the `DELETE` when the wait runs out, as
the tab closes, or just before signing out (`src/lib/before-sign-out.ts`: the
auth store runs it while the token is still in hand). It is not server data copied into a store: it is what the
person did and the API has not heard yet. It sits in a file of its own
because `useProfile` reads it and is in the first download; the removal logic
stays in the profile page's chunk.

**The servers dialog stores** (`useCreateServerDialog`, `useChannelDialogs`,
`useInviteDialogs`, `useMembershipDialogs`, in `src/features/servers/`):
which of the servers feature's dialogs is open, and on what. They are stores
rather than `useState` because the dialogs live in the AppShell (each loaded
with `lazy()` the first time it opens), while what opens them is elsewhere:
the rail's ＋, the no-server page, the server menu, the channel list's
buttons, an invite link opened while signed in, the Overview's owner group,
the members' ⋯ menu.

- `useCreateServerDialog`: `open`, `template`, `mode` (`create` or `join`);
  `show(template?)`, `showJoin()`, `hide()`.
- `useChannelDialogs`: `open`, the dialog and the ids it is about, or `null`;
  `show(dialog)`, `hide()`.
- `useInviteDialogs`: `invite` (`{ serverId, created }`) and `join`
  (`{ code, channel }`); `showInvite()`, `hideInvite()`, `showJoin()`,
  `hideJoin()`.
- `useMembershipDialogs`: `open`, `leave`, `transfer` (with a chosen
  `recipient`, and `thenLeave` from the leave flow) or `delete` on a server,
  `deletionBlocked` (the servers that block deleting the account), or `null`;
  `show(dialog)`, `hide()`. A server gone from the list takes its dialog with
  it.

They hold ids, never server data: the dialog reads the server from the
servers query (`useServers`). One exception: `deletionBlocked` keeps the
names and member counts it is opened with, since after a
`409 OWNERSHIP_TRANSFER_REQUIRED` the dialog shows the servers as the API
named them, which the cached list may not have yet (the list is read again
as it opens, for the handover each row leads to).

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
  is the session, the theme, a pending avatar removal and which dialog the
  AppShell shows. Redux's structure would be paid for and not
  used.
