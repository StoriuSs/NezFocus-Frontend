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
    │   ├── AppRouter.tsx      # The RouterProvider, moves drawn at once (no transitions)
    │   ├── router.tsx         # The route tree
    │   └── layout/            # AuthShell + BrandPanel (sign-in pages);
    │                          #   app-shell/ — AppShell, Rail, ListColumn, MeMenu
    ├── assets/mascot/         # The mascot's still pictures, shown until Rive is ready
    ├── components/            # Shared UI, used by more than one feature
    │   ├── ui/                # shadcn/ui primitives (button, dialog, input, tooltip…) and the project's own
    │   │                      #   (icon-button, segmented-control, select, option-cards, empty-state…)
    │   ├── shell/             # ShellPage, RightPanel, ConnectionBanner, ShellNotFound — what a page in the AppShell draws;
    │   │                      #   PhaseTag (a study phase in the channel list and the dock, in the main stylesheet, D-193)
    │   ├── brand/             # Logo; mascot/ (Mascot, RiveMascot)
    │   ├── form/              # FormField — the label/control/error pattern; FormMessage, TimeZoneCombobox, NumberField (C-22)
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
    │   │   │                  #   useRoles, useModeration, useServerSettings, useMembership; serverOwnership
    │   │   │                  #   (auth's port), useMentionSource (the chat's MentionSource port),
    │   │   │                  #   liveServers (socket events: each server read again, D-178)
    │   │   ├── components/    # CreateServerDialog, NoServers, ServerIcon, ServerMenuItems, RoomHeader (a study
    │   │   │                  #   room's Host chip and Ring / Grid switch); channel-list/, live-rooms/ (the Study page's
    │   │   │                  #   rooms studying now: LiveRooms, lazy from the index, and LiveRoomRow, C-44),
    │   │   │                  #   dialogs/ (channels, categories; RadioChoices, the radio rows of who may post / start;
    │   │   │                  #   a room's study part),
    │   │   │                  #   invites/, membership/ (leave, hand over, delete;
    │   │   │                  #   RemovedDialog: kicked or banned, 11 S-MOD-02),
    │   │   │                  #   settings/ (ServerNameForm, ServerIconSetting, WelcomeChannelSetting, OwnerSettings,
    │   │   │                  #   InvitesSettings, Pagination; members/, roles/)
    │   │   ├── hooks/         # useFoldedCategories (the categories folded, kept in this browser), useMoveAwayFrom,
    │   │   │                  #   useServerGoneWatch (D-143, D-178: starts liveServers, run by the AppShell),
    │   │   │                  #   useGoneServerPath (where a page of a server gone goes),
    │   │   │                  #   useRoomInvite ("Mời vào phòng": the invite link with the room, copied, D-218),
    │   │   │                  #   useJoinedSession (the session of the room this tab is in: the tab's
    │   │   │                  #   cues, and its Host asked before switching or signing out),
    │   │   │                  #   useInboxPlaces (the names and paths the inbox is handed),
    │   │   │                  #   useChannelChat (what the chat of a text channel or a voice room is handed),
    │   │   │                  #   useRemovedWhileAway (kicked / banned while away: the Toast of H1, run by the AppShell),
    │   │   │                  #   useLiveRooms (the Study page's rooms in the order held while one looks, 08 Q4)
    │   │   ├── lib/           # paths (SERVERS_PATHS and channelPath, messagePath, messageLink, invitePath,
    │   │   │                  #   serverSettingsPath, roleEditPath, isId), app-links (how a link in a message
    │   │   │                  #   shows: a message chip, "can't view", a page of the app, D-117; and a channel
    │   │   │                  #   mention, readChannelMention), chat-permissions,
    │   │   │                  #   layout-messages (the words for a refused name or move), invite-problem,
    │   │   │                  #   channel-layout, channel-list, drop-target, layout-error, invites, moderation,
    │   │   │                  #   membership, permissions, roles, server-name, settings-sections, typed-name,
    │   │   │                  #   channel-settings (the form of channel / room settings: schema, what is sent),
    │   │   │                  #   room-people (a room's people and study session swapped in the list),
    │   │   │                  #   live-rooms (the rooms studying now and their order, REQ-STUDY-09, D-217)
    │   │   ├── pages/         # ChannelPage (/channels/:serverId/:channelId?, and /…/:messageId: the channel
    │   │   │                  #   at a message, D-48), ServerSettingsPage
    │   │   │                  #   (/servers/:serverId/settings/…), InvitePage (/invite/:code)
    │   │   ├── *.store.ts     # create-server, channel-dialogs, invite-dialogs, membership-dialogs: which dialog
    │   │   │                  #   the AppShell shows; server-removals: the S-MOD-02 dialogs waiting, in turn
    │   │   ├── routes.tsx     # serversInviteRoutes (AuthShell), serversChannelRoutes, serversSettingsRoutes (AppShell)
    │   │   ├── types.ts
    │   │   └── index.ts       # What other features may import
    │   ├── realtime/          # The tab's socket (SRS 5.2): api/realtime.api.ts (the ticket),
    │   │                      #   hooks/ (useRealtimeConnection, useConnectionBanner), lib/ (which
    │   │                      #   Banner shows, what to do when the session ends, realtime-events.ts:
    │   │                      #   onRealtimeEvent for the features keeping data; signals.ts:
    │   │                      #   sendRealtimeSignal for typing; presence-signals.ts: heartbeat and
    │   │                      #   "unused for 10 minutes", sent at each ping), keys.ts,
    │   │                      #   useOwnPresence (one's own presence, query cache), realtime.store.ts
    │   ├── messaging/         # A text channel's chat (S-CHAT-01) and its pins (S-CHAT-02), lazy
    │   │                      #   (index.ts: ChannelChat, PinsPanel from the same chunk), and how far
    │   │                      #   the reader has read, not lazy (index.ts: useChannelReadState,
    │   │                      #   useServerReadState, useMentionTotal for the rail, channel list, title):
    │   │                      #   api/ (history, sending, editing and deleting, going to a message,
    │   │                      #   reactions, reactors, pins, read states and marking read,
    │   │                      #   liveMessages / liveReadStates: socket events into the cache,
    │   │                      #   attachmentUploads: files uploading outside React, three at a time,
    │   │                      #   outgoingMessages: the messages on their way, outside React too,
    │   │                      #   forgetChannels: the histories and drafts of channels no longer seen (servers calls it),
    │   │                      #   useAttachmentTray, useAttachmentLinks), attachment-tray.store.ts
    │   │                      #   (the files chosen, per channel),
    │   │                      #   components/ (list, row, system row, text and its link chips,
    │   │                      #   mention chips and suggestions, reaction bar and chip, emoji picker,
    │   │                      #   toolbar and menu, editor, delete dialog, composer, pins panel, "New"
    │   │                      #   line, new messages bar; attachments/: tray, tile, files in a
    │   │                      #   message, file card), hooks/ (choosing files, scrolling, going to a message,
    │   │                      #   drafts, a box that writes mentions, their words, whether the reader
    │   │                      #   can see the page, messages seen, unread in the open channel), lib/
    │   │                      #   (formatting and mention tokens, mentions read and written, cache
    │   │                      #   changes, pins and read states in the cache, where "New" goes, emoji
    │   │                      #   data, grid moves and recent picks, tooltip words, rows, times; files:
    │   │                      #   rules, posting one to the storage, downloading; drafts: the key of one draft),
    │   │                      #   messaging.css (the chat's classes)
    │   ├── tasks/             # A text channel's Task Board (S-TASK-01), its form (S-TASK-03), a task's
    │   │                      #   detail (S-TASK-02, `?task=`) and the To-do page with its column (S-TASK-04),
    │   │                      #   lazy (index.ts: TaskBoard, TaskDetail, MyTasks, MyTasksNav;
    │   │                      #   useOpenTaskCount for the channel settings' warning, useDueTaskCount
    │   │                      #   for the rail's badge): api/ (the board, the done pages, one task and its history, writes answered with the
    │   │                      #   task, D-191; liveTasks: task.* into the cache; rememberTask: one
    │   │                      #   task into every board of its channel), components/ (the board, its
    │   │                      #   row, the form, the detail and its person rows, the date picker C-43,
    │   │                      #   the people picker C-25 `multi`, the delete dialog), hooks/ (a status
    │   │                      #   change and its Undo Toast, the words of due dates, a task's link),
    │   │                      #   lib/ (groups and order, cache changes, due lines, history lines, the
    │   │                      #   calendar, who may do what, refusals the form names),
    │   │                      #   held-tasks.store.ts (rows standing still while their Toast shows),
    │   │                      #   tasks.css (its classes, D-193)
    │   ├── notifications/     # The inbox (S-NOTI-01), a Popover the rail opens, lazy with its own
    │   │                      #   stylesheet (index.ts: InboxPanel; useUnreadNotificationCount for the
    │   │                      #   rail's badge, useUnreadRemovals and openInbox / useInboxStore for the
    │   │                      #   Toast of H1, not lazy): inbox.store.ts (open or not), api/ (one's inbox 30 a page, marking read,
    │   │                      #   liveNotifications: notification.* into the cache), components/ (the
    │   │                      #   panel, NotificationRow C-29), lib/ (cache changes, day groups and times,
    │   │                      #   a row's words), notifications.css (its classes, D-193)
    │   ├── voice/             # Voice rooms (07, M4): index.ts (VoiceRoomView: the preview page and the
    │   │                      #   room, InRoomDock C-09, both lazy with LiveKit; RoomPeopleList, the panel
    │   │                      #   "Người trong phòng" a "+N" seat opens (SeatMore, seatsOf: 12, or 11 and
    │   │                      #   "+N"), lazy; useVoiceSession,
    │   │                      #   useOrderedPeople, useVoiceStore, ModeratorMenu + useRoomMenu, not lazy),
    │   │                      #   voice.store.ts (the room this tab is in, its mic, camera and shared
    │   │                      #   screen, the last join's problem), api/ (token, leave, a moderator's
    │   │                      #   mute / unmute / disconnect), lib/ (session.ts: join, leave, mic, camera,
    │   │                      #   screen, outliving every page; people order and grid, reload, the
    │   │                      #   browser's mic and camera, a moderator's items on someone, share.ts: whose
    │   │                      #   screen shows, the stage's fit, the strip's ends), components/ (the
    │   │                      #   grid, StageView + TileStrip + ShareControl when a screen is shared),
    │   │                      #   hooks/, voice.css (its classes). The rooms' people are the servers'
    │   │                      #   data (D-205), handed in as VoiceRoom
    │   ├── study/             # Study sessions (07, 08, M5): index.ts (StudyStage lazy: the ring, its
    │   │                      #   seats, the Host's controls, the start and cycle dialogs, the summary, with
    │   │                      #   their words; SessionCues lazy: the tab's title, the phase sound and the
    │   │                      #   streak toast of the session one is in; EndedOnArrival lazy: the Toast of a room
    │   │                      #   opened from a Study page row as its session ended; the light parts not lazy: the cycle rules,
    │   │                      #   the phase rules and clocks, listenForSessions, the store), api/ (start, commands,
    │   │                      #   today; liveSessions: `focus_session.*` and `streak.updated`, each later
    │   │                      #   state handed to the servers feature, D-231), lib/ (study-cycle, phases,
    │   │                      #   durations, the words of a cycle, today: one's seconds today with the
    │   │                      #   running focus, phase-words, host-leave: who is asked before leaving), hooks/,
    │   │                      #   study.store.ts (who did what, who paused, the last session ended, one's
    │   │                      #   seconds as one's place closed: `focus_session.left`), host-leave.store.ts
    │   │                      #   ("Rời phòng?" asked, its HostLeaveDialog the AppShell's, lazy, D-233),
    │   │                      #   study.css (its classes). A room's session is the servers'
    │   │                      #   data (D-220), handed in with the VoiceRoom. Solo (08 S-STUDY-02,
    │   │                      #   D-234): SoloStage lazy (the Solo page's stage), SoloDock lazy (its dock,
    │   │                      #   under a room's), SoloWatch and SoloDockSlot light (mounted by the shell),
    │   │                      #   api/useSoloSession.ts (GET /me/solo-session, kept by `solo_session.updated`),
    │   │                      #   api/useSolo.ts (start, commands), lib/solo.ts (its seconds, its wait),
    │   │                      #   solo-yield.store.ts (the question before a room's session ends it,
    │   │                      #   SoloYieldDialog the AppShell's, lazy). The Study page (08 S-STUDY-01,
    │   │                      #   M5 L7b): SoloCard and StudyStats lazy (the Solo block; the streak, today's
    │   │                      #   progress and the week, WeekChart), api/useStudyWeek.ts (this week's days,
    │   │                      #   GET /me/study-stats, keyed by today), lib/week.ts (the chart's rules),
    │   │                      #   lib/solo-words.ts (a Solo's cycle line); the rooms studying now are the
    │   │                      #   servers feature's (LiveRooms). StreakBlock and CheerBlock are shared with
    │   │                      #   the Stats page (08 S-STUDY-03, M5 L8): components/stats/ (StatsBody and
    │   │                      #   PeriodPicker lazy; PeriodChart, PeriodTotals, MonthCalendar, StreakGrid,
    │   │                      #   DayCell, SessionHistory, SessionRow), api/useStudyPeriod.ts (a period's
    │   │                      #   GET /me/study-stats), api/useStudyHistory.ts (GET /me/study-sessions, a
    │   │                      #   page at a time), hooks/useStatsPeriod.ts (the period on the URL, light),
    │   │                      #   hooks/useStatsView.ts (the numbers as they stand now), hooks/useGridKeys.ts,
    │   │                      #   lib/periods.ts, lib/period-stats.ts, lib/history.ts, lib/day-words.ts
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
    │                          #   useDocumentTitle, useIdempotentMutation, useToastArea (where toasts sit), useBrowserOnline,
    │                          #   useRefuseFileDrops (files dropped where nothing takes them do nothing; run by the AppShell)
    ├── i18n/                  # i18next setup and the translation catalogues (settings.ts, deletion.ts, servers.ts: words loaded with their pages)
    ├── lib/                   # Shared, feature-free: the API client, and friends
    ├── pages/                 # Pages that belong to no feature: Study, StudySolo, StudyStatsPage, Legal, NotFound
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
knows) and then renders the `QueryClientProvider`, the router (`AppRouter.tsx`:
the `RouterProvider`, its moves not transitions, docs/code-splitting.md) and
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
| `utils.ts` | `cn()`, which merges Tailwind classes; `folded()`, how a search compares words (no case, no accents, đ as d) |
| `crop-image.ts` | Cuts the chosen area out of a picture as a JPEG, longest edge 1024; used by `ImageCropDialog` |
| `image-file.ts` | `imageProblem()`: JPG, PNG or WEBP up to 8 MB (an avatar, a server icon), checked before the cropper opens |
| `gone-places.ts` | The servers, channels and messages this tab just let go of (removed, deleted, gone private), kept two minutes or until listed again: a mutation failing about one shows no toast (11 S-MOD-02 E9); the features tell it |
| `before-sign-out.ts` | Work that must be sent before the tab signs out or closes (a removed avatar waiting out its Undo); the auth store runs it while the token is still in hand |
| `time-zones.ts` | The time zones to pick from (C-25), named and ordered, and the search over them; `wallClock()`, the calendar and clock in a zone (times shown in the account's zone); `endsAt()` / `endsAtText()`, when a timeout ends ("22:30", "22:30, 19/10" on another day); `accountTimeZone()`, the account's zone for code outside React, from the source the users feature sets (`setTimeZoneSource`) |
| `phase-sound.ts` | `playPhaseSound()`: the phase sound, two short notes (C6 then E6) made with Web Audio (D-140), silent where the browser cannot play. "Play sample" on Notifications, and a study phase beginning in the room one is in (`usePhaseSound` of `study`) |
| `server-clock.ts` | `noteServerTime()`, `serverNow()`: the server's clock as this tab knows it (D-18), taken from `ready` and each study session told live, never from a list in the cache; a phase counts down to the server's end |
| `arrow-focus.ts` | `moveFocusInList()`: up and down arrows from one stop of a list to the next, called from the stop's own `onKeyDown` (the messages column's rows, the Friends page's rows) |
| `socket.ts` | `openSocket()`: the tab's one socket.io connection (SRS 5.2), websocket only, a new ticket for each attempt, a refused handshake tried again with a growing wait, a session that ended asked about (still signed in: connect again). Loaded with `import()` after the AppShell's first paint; knows no feature (the ticket and what to do come in its options) |
| `livekit/` | `joinRoom()`: the tab's link to a LiveKit room (ARCHITECTURE §4): others' sound played whatever the page, the mic and camera switched, a screen shared with the picker's hints and why it stopped by itself (the browser's bar, VIDEO lost, muted by the server), how the link ended in the app's words (`other-tab`, `removed`, `lost`). Loaded with `import()` when a room is joined, never with the first screen; knows no feature |
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
  Features import one way (`users ← auth ← servers`, `auth ← realtime`:
  a socket whose session ended asks the auth store, and
  `users, realtime ← messaging ← servers`: the channel page shows the chat,
  which hears the socket through `onRealtimeEvent`, realtime knowing no
  feature; `users, realtime ← tasks ← servers`: the channel page shows the
  Task Board, and the channel settings ask it how many tasks are not done;
  `users, realtime, messaging ← notifications ← servers`: the inbox reads
  a message's words with the chat's mention names, and the servers feature
  hands it the names of channels and servers;
  `users, realtime ← study ← voice ← servers`: the study feature knows no
  room but what it is handed (`StudyRoomView`, and the room's round control
  as a prop), the servers feature keeps each room's session in its list from
  what study hears (`listenForSessions`, a port: study declares the sink,
  `liveServers.ts` hands one, D-231); `users, realtime, messaging, study ← social ← notifications`: someone's activity line counts the minutes of a phase with the study feature's clock (`useListClock`, `minutesLeft`) and names the room they are in through the `RoomLookup` port (`social/lib/room-lookup.ts`, answered by `servers/hooks/useRoomLookup.ts`, connected by the AppShell; the member panel of servers shows the same `ActivityLine`, D-252); the inbox answers a friend request with the social feature's hooks and opens a DM with "Message", the Privacy page (users) counts the people blocked through the `BlockList` port the AppShell connects (D-248) and the read states (messaging) skip their messages through the same port (D-250), and a DM's page shows the chat with the DM's parts (`dm` of `ChannelChat`, D-249), reading the links in its messages and drawing the servers of its profile panel (`server`, D-251) through the `ChatLinks` port (`social/lib/chat-links.ts`, a hook the servers feature answers with `servers/hooks/useChatLinks.ts`, connected by the AppShell; servers imports social: the channel page hands the chat whom one blocked, `useBlockedIds`, D-250); `users, realtime ← voice ← servers`: the channel page shows a room's page
  and the channel list the people in each room, the servers feature handing
  voice each room as a `VoiceRoom` (`servers/lib/voice-room.ts`), what one
  may do there read from the bits and whom one outranks there (D-208), and keeping who is in it in its own list
  (`voice_state.updated` in `liveServers.ts`, D-205)). When the one imported
  needs the other, it declares a port and is handed it: deleting the account
  (auth) asks the servers it owns through `ServerOwnership`
  (`auth/lib/server-ownership.ts`), the servers feature answers
  (`servers/api/serverOwnership.ts`), and the AppShell connects the two
  ([auth/account-settings.md](./auth/account-settings.md#an-owner-of-servers)).
  A port can also be handed down as a prop by the page that shows the
  other feature: the chat's mentions need the server's members, roles and
  channels (`MentionSource` in `messaging/types.ts`), and the channel page
  hands the servers feature's answer (`servers/api/useMentionSource.ts`),
  with the rest the chat takes (`servers/hooks/useChannelChat.ts`), for a
  text channel's chat and a voice room's alike (S-ROOM-08: no pins, D-213). Its
  queries go as query options (`queryKey`, `queryFn`), so the key and the
  cache stay the servers feature's, as `settingsCache` does for the users
  feature. The Task Board's `TaskBoardPlace` (`tasks/types.ts`) is the same:
  the channel page hands what one may do there and the members who view the
  channel (`servers/api/useTaskBoardPlace.ts`, D-192). A task's detail, on
  any page, is handed a `PlaceOf` (the place of any channel of one's
  servers) by `servers/components/TaskDetailRoute.tsx`, which the AppShell
  shows when `?task=` is there. The To-do page is drawn the same way
  (D-197): `servers/components/MyTasksRoute.tsx` (the route `/tasks`) and
  `MyTasksColumn.tsx` hand the tasks feature one's servers in the rail's
  order (`hooks/useTaskServers.tsx`) and the same `PlaceOf`
  (`useTaskPlaceOf`). The inbox (S-NOTI-01) takes `InboxPlaces`
  (`notifications/types.ts`: an item's channel and server by name, a channel
  mentioned in a message, the path to a message) from
  `servers/hooks/useInboxPlaces.ts`, handed by the rail (the app wires the
  two), so the servers feature may use notifications: the Toast of a kick
  or a ban while away (`servers/hooks/useRemovedWhileAway.ts`) reads the
  inbox's unread ones and its "Xem" opens the inbox (`openInbox`, M3 L8).
- **Shared code imports no feature.** `src/lib`, `src/components` and
  `src/hooks` are refused any `@/features/...` import. When shared code needs
  something a feature owns, it says what in an interface and is handed it: the
  API client declares `ApiSession`, auth implements it, and `main.tsx`
  connects the two. A small value can instead be lent by the feature itself,
  set as its module loads: auth's store sets the token source
  (`setTokenSource`, `before-sign-out.ts`), users' `settingsCache.ts` the
  account's time zone (`setTimeZoneSource`). `src/app` is the exception: it
  wires the features into the app, so it may reach in.
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
