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
| The account's settings (theme, language, time zone, switches) | TanStack Query, key `userKeys.settings()`, loaded by the AppShell | `useSettings()` inside the users feature; elsewhere `useQuery(settingsCache)` (the key with `queryFn: skipToken`: the cache only, never a request) |
| The theme on screen | The theme store, `src/hooks/useTheme.ts`, set from the settings once signed in | `useTheme()` |
| Where toasts sit (C-16): the content area's right edge, the top of the page's bottom bar (the Composer), the top of the "N new" button | The toast area store, `src/hooks/useToastArea.ts`: each part says where it is with `useToastEdge`, measured again on any size change | read by the `Toaster` (`toastPlace`) |
| A removed avatar waiting out its "Undo" | `useAvatarRemoval`, `src/features/users/lib/avatar-removal-state.ts` | read by `useProfile` |
| A form's values and errors | React Hook Form | [shadcn-forms.md](./shadcn-forms.md) |
| Which servers dialog is open, and on what (create a server, a channel or category dialog, invite friends, join from an invite, leave, hand over or delete a server) | `useCreateServerDialog`, `useChannelDialogs`, `useInviteDialogs`, `useMembershipDialogs` (`src/features/servers/*.store.ts`); the AppShell draws the dialogs | `useCreateServerDialog((s) => s.show)` |
| A channel's history, and the messages typed there not saved yet (`sending`, `waiting`, `rate-limited`, `failed`) | TanStack Query, key `messageKeys.channel(id)`: the not-yet-saved ones on the last page (`outgoing`), matched by nonce when the saved copy comes (ARCHITECTURE 10.2) | `useChannelMessages`, `useSendMessage` in `src/features/messaging/api/` (the queue itself: `api/outgoingMessages.ts`, outside React, so a message keeps going once its channel is left) |
| A channel's Task Board: the tasks not done and how many are done, the done pages read so far (S-TASK-01) | TanStack Query, keys `taskKeys.open(id, search)` and `taskKeys.done(id, search)`, kept live by `liveTasks` | `useOpenTasks`, `useDoneTasks` in `src/features/tasks/api/` |
| One's tasks on the To-do page: those not done in their groups with the counts, the done pages (S-TASK-04, D-186) | TanStack Query, keys `taskKeys.mineOpen(server, search)` and `taskKeys.mineDone(server, search)`, read again by `liveTasks` / `rememberTask` and at midnight (D-196) | `useMyTasks`, `useMyDoneTasks`, `useDueTaskCount` in `src/features/tasks/api/useMyTasks.ts` |
| The task a detail shows and its history (S-TASK-02) | TanStack Query, keys `taskKeys.one(id)`, `taskKeys.history(id)`, kept live by `liveTasks` | `useTask`, `useTaskHistory` in `src/features/tasks/api/` |
| Which task's detail is open | The URL, `?task=` on any page (05 Q6), read by the AppShell | `useTaskLink` (open, copy the link) in `src/features/tasks/hooks/` |
| The rows of a Task Board standing still while the Toast of their status change shows (05 Q4, R5) | `useHeldTasks`, `src/features/tasks/held-tasks.store.ts`: a store, as the Toast outlives a panel closed meanwhile | `useStatusChange` holds and lets go; the board reads it |
| What is typed in a channel's composer | `sessionStorage`, one key per channel, until the tab closes (C-12) | `useDraft` (`src/features/messaging/hooks/`) |
| The files chosen for messages: each channel's tray, the files of messages on their way, how far each upload is (S-CHAT-04) | `useUploads`, `src/features/messaging/attachment-tray.store.ts`, filled by `api/attachmentUploads.ts` | `useAttachmentTray(channelId)` |
| Whether the inbox (S-NOTI-01) is open | `useInboxStore`, `src/features/notifications/inbox.store.ts`: a store, as the "Xem" of the Toast of a kick or a ban while away opens it from outside the rail (11 S-MOD-02 › H1) | the rail's "Thông báo" reads and sets it; `openInbox()` |
| The tab's connection: the socket's state, the browser online or not (S-SHELL-01) | `useRealtimeStore`, `src/features/realtime/realtime.store.ts`, kept by `useRealtimeConnection` in the AppShell | `useConnectionBanner()`, which Banner the page shows |
| The voice room this tab is in or joining, its microphone and camera (and the camera's picture on the preview page, a `MediaStream`), the last join's problem, being put out for another room (07, M4) | `useVoiceStore`, `src/features/voice/voice.store.ts`, written by the session (`lib/session.ts`, which holds the LiveKit link and outlives every page); who is in each room is server data, in the servers' list (`voiceStates`, D-205) | `useVoiceStore((s) => s.call)`; the shell's `RoomDock` and channel rows read it |
| The voice room to join again on a reload (VC-02, D-51) | `sessionStorage`, key `voice.room`, this tab only; taken once per page load, and only when the page was reloaded (a duplicated tab carries a copy and drops it) | `keepRoom` / `roomToRejoin` (`src/features/voice/lib/rejoin.ts`) |
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

**The connection store** (`useRealtimeStore`, `src/features/realtime/`):
whether the socket is connected, down (and since when), or not opened yet,
and whether the browser is online. Presence is not here: one's own is in the
query cache (`useOwnPresence`), others' comes with the member lists (D-175). UI state only: the socket itself lives in
`src/lib/socket.ts`, and the data its events carry goes into the query cache
(ARCHITECTURE 10.2), not here. `useConnectionBanner()` turns it into the
Banner a page shows: `offline` without a network, `reconnecting` once the
socket has been down 3 seconds, nothing otherwise.

**The uploads store** (`useUploads`, `src/features/messaging/`): the files
chosen in each channel's tray and those of messages on their way, with how far
each upload is and why one was refused. Client state: it holds `File`s and the
pictures made from them, which the query cache cannot keep, and a file must
go on uploading when its tray is no longer drawn (`api/attachmentUploads.ts`
runs the uploads outside React, three at a time; offline, every file not done
waits for the network and uploads again once it is back). What the backend answers
for a checked file is kept with it until the message is sent; the messages'
files then come back with the messages, in the query cache.

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
