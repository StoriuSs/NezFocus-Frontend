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

A channel's Task Board (S-TASK-01) is a chunk of its own the same way:
`src/features/tasks/index.ts` exports `TaskBoard` lazily, and the channel
page shows it in the right panel inside a `Suspense` whose fallback is the
panel with a loader (the board draws the panel itself, its search field in
the header). Its form, pickers, words and hooks come with it, and so do its
classes: `tailwind.tasks.config.js` builds `tasks.css` the way the chat's is
built (`tailwind.feature.js` holds the shared steps; the main config leaves
both folders out), "Tasks CSS" in `.size-limit.mjs` (D-193, M3 L3). Only
`useOpenTaskCount` is not lazy: the channel settings dialog, itself lazy,
says how many tasks turning the board off hides.

A task's detail (S-TASK-02) opens over any page with `?task=`: the AppShell
loads `servers/components/TaskDetailRoute.tsx` lazily the first time the
parameter is there, and it shows `TaskDetail`, the tasks feature's second
lazy export. The board and the detail share the form, the pickers and the
stylesheet, so `vite.config.ts` puts `tasks.css` in a chunk of its own name
(`FEATURE_STYLES`: `TaskStyles-<hash>.css`), which `.size-limit.mjs` finds
whichever lazy chunks import it (M3 L4). The To-do page (`/tasks`,
S-TASK-04) and its column are two more lazy exports, `MyTasks` and
`MyTasksNav`, shown by the servers feature's lazy `MyTasksRoute` and its
`MyTasksColumn` (D-197); they share that stylesheet. The rail's "Việc" badge
needs `useDueTaskCount` at once, so it is not lazy: it sits in the AppShell's
chunk, not in the first download (M3 L5).

The inbox (S-NOTI-01) is the same again: `src/features/notifications/index.ts`
exports `InboxPanel` lazily, the rail shows it inside a `Suspense` (fallback
none) the first time "Thông báo" opens, with its words (`notifications`) and
its classes (`tailwind.notifications.config.js`, `notifications.css`, a
chunk of its own name, `NotificationStyles-<hash>.css`, "Notifications CSS"
in `.size-limit.mjs`). The badge's `useUnreadNotificationCount` is not lazy
and sits in the AppShell's chunk (M3 L6b).

A study room's stage (M5 L5a) is lazy inside a joined room's page:
`src/features/study/index.ts` exports `StudyStage` (the ring and its seats,
the Host's controls, the start and cycle dialogs, the summary) lazily, the
voice feature shows it inside a `Suspense`, so a plain voice room never
fetches it. Its words (`study`) and classes (`tailwind.study.config.js`,
`study.css`, `StudyStyles-<hash>.css`, "Study CSS") come with it. The
phase's colours and icons shown outside it (a room page's ground, the
channel list, the dock) are in `src/lib/phase-colors.ts`, and the phase as
the shell shows it in `src/components/shell/PhaseTag.tsx` (used by the
servers feature's `PhaseListLine` under a room's row and by the dock), both
the main stylesheet's: a class only in `study.css` would be missing on a
page opened before any study room. The rest of `study`'s index (the cycle
rules, the phase rules and clocks, `listenForSessions`) is light and not
lazy. `SessionCues` (the tab's title, the phase sound and the streak
toast of the session one is in) is lazy, fetched once one is in a room with a session.
`PreviewRing` (a study room's ring on its preview page) is lazy like `StudyStage`.
`HostLeaveDialog` ("Rời phòng?" of a session's Host, D-233) is the AppShell's,
lazy like its other dialogs, fetched the first time it is asked; so is
`SoloYieldDialog` (before a room's session ends one's Solo, D-103). The Solo
page's stage `SoloStage` and the Solo's dock `SoloDock` are lazy (both import
`study.css`); `SoloWatch` and `SoloDockSlot`, which the shell mounts, are light
and fetch `SessionCues` / `SoloDock` only while a Solo runs. The query of the
Solo (`api/useSoloSession.ts`) brings no `study` words; the start and the
commands (`api/useSolo.ts`, with their toasts) live with the lazy parts. The
Solo page's round controls are voice's `RoomControl`, which imports
`voice.css` so its classes come wherever it shows. The Study page (M5 L7b)
shows three lazy parts inside their own `Suspense`: the servers feature's
`LiveRooms` (the rooms studying now: it brings the `study` words, which an
index export would put in the shell's shared chunk; its classes are the main
stylesheet's, as the channel list's) and study's `SoloCard` and
`StudyStats` (with `study.css`). The Stats page (M5 L8) is a lazy route too;
its body (`StatsBody`, with `study.css`) and its period picker (`PeriodPicker`,
in the Header) are lazy exports of study, each inside a `Suspense`. Only the
URL's period (`useStatsPeriod`, no words) is a light export.
`CycleFields` (a cycle in a React Hook Form form) is
exported lazily too, for a room's settings (S-SET-06, inside a `Suspense`):
it brings the `study` words, which an index export would put in the shell's
shared chunk.

Voice rooms (M4 L3a) are the heaviest: `src/features/voice/index.ts`
exports `VoiceRoomView` (a room's preview page and the room, with the hooks
of `@livekit/components-react`), `InRoomDock` and `RoomPeopleList` (the panel
"Người trong phòng") lazily, the servers feature
shows them inside a `Suspense`; LiveKit's client itself (`src/lib/livekit`,
about 155 kB gzipped) is read with `import()` only when a room is joined, as
`socket.ts` is. Their words (`voice`) and classes (`tailwind.voice.config.js`,
`voice.css`, `VoiceStyles-<hash>.css`) come with them: "Voice CSS" and "Voice
JS" in `.size-limit.mjs`. What the shell needs at once is light and not lazy:
the store of the room this tab is in, `useVoiceSession` (joining again after
a reload, what a moderator or the server did to one's room) and the order
people show in under a room in the channel list, with a moderator's menu on
them (`ModeratorMenu`, M4 L4b). That menu brings Radix's dropdown (about
11 kB gzipped) into the room's page too; the channel list's chunk already
has it (the server's menu), so a room opened from the list fetches nothing
more, but "Voice JS" counts it, as it counts every chunk a room's page
imports.

The pins panel (S-CHAT-02) is in the same chunk: `index.ts` exports
`PinsPanel` as `lazy(() => import('./components/ChannelChat').then((chat) =>
({ default: chat.PinsPanel })))`, and `ChannelChat.tsx` re-exports it, so it
comes with the chat's stylesheet and no second copy of the chat's code.
The emoji picker's data, `emojibase-data` in Vietnamese and English (about 93
kB gzipped each), is read with `import()` the first time the picker opens
(`lib/emoji-data.ts`): two chunks of their own, never in the chat's. Both are
read whatever the language on screen: the names come from that one, the search
takes the words of both (SRS 1.81, owner's choice over a build-time word list),
so the first opening reads about 186 kB. Vite warns that they are over 500 kB
before gzip; they are data, read once.

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

## Moves are not transitions

React Router would run navigations as **transitions** by default: while the
next page's chunk loads, the current page stays on screen. The app turns that
off (`useTransitions={false}` in `src/app/AppRouter.tsx`): each move is drawn
at once, and a page not loaded yet shows its Suspense fallback.

Why: as a transition, a page still loading when one moved on could still be
drawn, late, for the address already left, and run its effects there. Its
`<Navigate>` then took one back (M3 A3: the server settings, opened from the
inbox, loading while a channel was opened from the inbox again; the settings
page's `/settings` → `/settings/overview` replaced the channel's address).
The test is `src/app/__tests__/AppRouter.test.tsx`.

| You see the `PageLoader` spinner | You don't |
| --- | --- |
| On the first load of the app, while the first page's chunk arrives | For a page whose chunk is already loaded |
| On any move to a page not loaded before, until its chunk arrives | |

In the AppShell the page's Suspense is inside an ErrorBoundary keyed by the
address, new on each move, so even as a transition the content area showed
its spinner; what changed is the rest: entering the AppShell, or the Study,
legal and not-found pages, shows the whole-page spinner instead of keeping
the page before.

## The two loading indicators

### `PageLoader` — the Suspense fallback

`src/components/PageLoader.tsx`: a centred spinner, shown in place of the
page while its chunk loads, when React shows a fallback at all (above).

### `NavigationProgress` — the bar at the top

`src/components/NavigationProgress.tsx`: a thin bar (NProgress) that starts
on every navigation (`PUSH`) and finishes when the new location renders. It is rendered
once, in `AppRoot` in `src/app/router.tsx`, outside any layout.

| Situation | PageLoader | Progress bar |
|----------|------------|-----------|
| First load of the app | Shows | — |
| Move to a page already loaded | — | Shows |
| Move to a page not loaded yet | Shows | Shows |

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
