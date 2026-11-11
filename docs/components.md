# Components

The shared components in `src/components/`, and the ones in the layout that
every page shows. Components used by one feature only live in that feature's
`components/` folder ([project-structure.md](./project-structure.md)).

- [Where they are](#where-they-are)
- [Error handling](#error-handling)
- [Loading states](#loading-states)
- [The layouts](#the-layouts)
- [Language toggle](#language-toggle)
- [Banner](#banner)
- [Settings rows](#settings-rows)
- [Empty states and tables](#empty-states-and-tables)
- [Forms](#forms)
- [Modals](#modals)
- [The tab's title](#the-tabs-title)
- [shadcn/ui components](#shadcnui-components)

## Where they are

```
src/components/
├── ui/                    # shadcn/ui primitives (button, dialog, input, tooltip…)
│                          # and icon-button, presence-dot, count-badge, select, option-cards, empty-state
├── shell/                 # ShellPage, RightPanel + usePanel, shell-context
├── brand/Logo.tsx         # The NezFocus mark and the logo lockup
├── brand/mascot/          # Mascot (the still picture, then Rive), RiveMascot
├── form/FormField.tsx     # Label, control and the line under it, wired for screen readers
├── form/FormMessage.tsx   # The message for a whole form, above its main button (C-22)
├── form/TimeZoneCombobox.tsx  # The time zone picker (C-25)
├── ErrorBoundary.tsx      # Catches a page that crashes
├── RouteErrorPage.tsx     # The full-page screen for a crash outside any page
├── PageLoader.tsx         # The spinner while a page's chunk loads
├── NavigationProgress.tsx # The bar at the top during navigation
├── Banner.tsx             # One line of news about the page (C-16), e.g. why a session ended
├── ImageCropDialog.tsx    # Crop a chosen picture to a square (an avatar, a server icon)
├── settings/SettingsRow.tsx  # SettingsGroup, SettingsRow (C-27) and Tag (C-36) for the settings pages
├── settings/SaveBar.tsx   # The save bar of a settings form with text fields (C-27)
├── settings/SwitchRow.tsx # A settings row with a switch (C-27 + C-24a)
└── LanguageToggle.tsx     # "Tiếng Việt · English" at the AuthShell's foot

src/app/layout/AuthShell.tsx                       # The sign-in pages' layout
src/app/layout/BrandPanel.tsx                      # Its brand half, from 1024 up
src/app/layout/app-shell/                          # The app's layout: AppShell, Rail, ListColumn, MeMenu
src/features/users/components/ProfileSkeleton.tsx  # The profile page's placeholder
src/features/users/components/                     # The profile page's pieces: AvatarSection, AvatarCropDialog, ProfileForm;
                                                   # the settings pages': SettingsLoader, TimeZoneSetting
src/features/auth/components/                      # The auth pages' pieces (CodeInput among them)
src/features/servers/components/                   # The servers dialogs, the channel list, invites, server settings
src/features/servers/components/settings/Pagination.tsx  # The page bar under the members and bans tables
src/hooks/useDocumentTitle.ts                      # The browser tab's title
src/pages/Legal.tsx                                # /terms and /privacy, with their own bar
```

## Error handling

### `ErrorBoundary`

Catches an error thrown while rendering its children and shows a fallback
instead of a blank page.

```tsx
import { ErrorBoundary } from '@/components/ErrorBoundary'

// In AuthShell and AppShell — around the page outlet, INSIDE the layout
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
*outside* the layout replaces the logo or the rail with the fallback,
leaving the user no way out but a reload.

- `key={pathname}` clears the error when the user navigates elsewhere.
- `onReset` runs before "Try again" re-renders — both layouts pass React
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
It is in each layout, around the page outlet, and in `AppRoot`, around the
layouts. See
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
            <Suspense fallback={<PageLoader />}>
                <Outlet />
            </Suspense>
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

The profile page's shape in skeletons (the avatar row, then three fields),
shown while the profile loads.

```tsx
import { ProfileSkeleton } from '@/features/users/components/ProfileSkeleton'

if (isPending) return <ProfileSkeleton />
```

## The layouts

`src/app/router.tsx` puts every page in one of two layouts. Both load
lazily, and both wrap the page outlet in the error boundary and the Suspense
boundary above.

**`AuthShell`** (`src/app/layout/AuthShell.tsx`) holds the sign-in pages,
"complete your account", and an invite (`/invite/:code`) opened by a visitor:

- **The logo** (`LogoLockup`), linking to `/`.
- **The form block**, 400 wide, centred.
- **The language toggle** at the foot, and on `/welcome` only a **Sign out**
  button beside it: that page may be open for the wrong account, and offers no
  other way out.
- **The brand panel** (`BrandPanel.tsx`) as the right half, from 1024 up.
  Runtime, the mascot, sits in its ring and waves once as the page loads.

**The mascot** (`src/components/brand/mascot/`, DESIGN.md › Illustration &
Mascot). `Mascot` shows the still picture of a mood at once, then hands over
to Rive (`RiveMascot`, `@rive-app/react-canvas-lite`), which draws
`public/mascot/runtime.riv` (nez-mascot's `dist/runtime.riv`; the commit it
came from is in `RiveMascot.tsx`). Rive is about 0.4 MB gzipped (68 kB of
script, 353 kB of WebAssembly), so it loads in its own chunk after the page,
and only where the mascot is on screen (`loadWhen`, a media query) and the
person has not asked for less movement; otherwise, or if Rive fails, the still
picture stays. The WebAssembly is served from this site
(`RuntimeLoader.setWasmUrl`), not Rive's CDN, and the CSP allows it to compile
with `'wasm-unsafe-eval'` in `script-src` (`scripts/csp.mjs`): that allows
WebAssembly, not `eval()`. nginx gzips `application/wasm`.

The legal pages, `/terms` and `/privacy` (`src/pages/Legal.tsx`), are in
neither layout: one column of text under their own bar, for visitors and
signed-in people alike.

**`AppShell`** (`src/app/layout/app-shell/AppShell.tsx`) holds every page
after sign-in, behind `ProtectedRoute`:

- **The rail** (`Rail.tsx`), 72 wide: direct messages, servers, Study, and
  at the bottom your avatar, which opens **your menu** (`MeMenu.tsx`): your
  profile, your status, **Settings** (the account page, `/settings/account`)
  and **Sign out**. The menu's data is
  the `useProfile` query, the same one the profile page uses, so a change
  there shows here at once.
- **The list column** (`ListColumn.tsx`), 240 wide. Which list it shows is
  the route's choice, in its `handle: { column }` (`study`, `server`,
  `serverSettings` or `settings`). `server` is the server's channel list;
  `serverSettings` lists the server's settings pages the person may open
  (`settingsSections`); `settings` lists the five settings pages (Account,
  Profile, Appearance, Notifications, Privacy).
- **The page area.** A page draws its own header with `ShellPage`
  (`src/components/shell/ShellPage.tsx`): the 48-high header with the
  title and the page's actions, a scrolling body, and an optional right
  panel (`RightPanel` + `usePanel`).
- **The servers dialogs** (`CreateServerDialog`, `ChannelDialogs`,
  `InviteDialog`, `JoinInviteDialog`), drawn here because many places open
  them; each is loaded with `lazy()` the first time its store opens it
  ([state-management.md](./state-management.md)).

Below 1024 the list column becomes a sheet opened by ☰ in the page header;
below 768 the rail joins it.

## Language toggle

### `LanguageToggle`

"Tiếng Việt · English" at the foot of the AuthShell. The language in use is
plain text; the other is a button ([i18n.md](./i18n.md)). Its list,
`LANGUAGE_NAMES`, is exported: the Appearance page's language choice uses it
too, each language by its own name.

## Banner

### `Banner`

`src/components/Banner.tsx` (C-16): one line of news about the page, with an
icon; neutral (`surface-2` background, `text-secondary`), no action, the
input's corners. A status (`role="status"`), read out when it appears. In the
AuthShell it sits at the top of the form block, above the card: the sign-in
page says there why a session ended (S-AUTH-03 `session-revoked`).

```tsx
<Banner icon={LogOut}>{t('sessionEnded.ended')}</Banner>
```

## Settings rows

`src/components/settings/SettingsRow.tsx` holds the pieces every settings
page is built from (C-27). The account page (`/settings/account`) is the
first to use them ([auth/account-settings.md](./auth/account-settings.md)).

- **`SettingsGroup`** (`id`, `title`, children): a `<section>` named by its
  title, an `<h2>` in small upper-case `text-tertiary`, over its rows. No card
  around it; the page puts groups 32 apart (`space-y-8`). The section is a
  landmark, so a test or a screen reader finds a group by its title
  (`getByRole('region', { name: 'Sessions' })`).
- **`SettingsRow`** (`label`, `value?`, `description?`, `control?`): the label,
  a read-only value under it (never pushed to the far edge of the 720 block),
  a description in small `text-tertiary`, and the control on the right,
  always visible.
- **`Tag`** (C-36): a short label that cannot be clicked, a rounded outline
  around small `text-secondary` text: "This device", later a role.

```tsx
<SettingsGroup id='sign-in' title={t('settings.signIn.title')}>
    <SettingsRow label={t('settings.signIn.email')} value={user?.email} description={t('settings.signIn.emailHint')} />
</SettingsGroup>
```

The group's `id` must be unique on the page: it ties the section to its
title.

**`SaveBar`** (`src/components/settings/SaveBar.tsx`, C-27; `saving`,
`onDiscard`): the save bar of a settings form with text fields, first used by
the profile page (`ProfileForm`). Render it last inside the `<form>`, only
while the form has changes: it floats 24 above the bottom of the content
area, as wide as the content, and at the end of the page sits after the last
field, never over it. "You have unsaved changes", **Discard changes** (calls
`onDiscard`) and **Save changes** (submits the form; a spinner while
`saving`). Its words are `common:saveBar.*`.

```tsx
{isDirty ? <SaveBar saving={isSubmitting} onDiscard={() => reset()} /> : null}
```

**`SwitchRow`** (`src/components/settings/SwitchRow.tsx`; `label`,
`description?`, `checked`, `onCheckedChange`, `disabled?`, `className?`): a
settings row whose control is a [`Switch`](#switch). The label is a
`<label>` for the switch, so clicking the words flips it too; the
description is tied to it with `aria-describedby`. On a settings page the
switch saves on its own, with no save bar (Notifications, Privacy). Inside a
dialog's form it is one field of the form (the channel dialogs, S-SRV-05):
`disabled` while the form is sending, and `className='items-start p-0'`,
because the form spaces its fields itself and the switch lines up with the
label.

```tsx
<SwitchRow
    label={t('privacy.showStudyActivity')}
    checked={settings.showStudyActivity}
    onCheckedChange={(showStudyActivity) => update.mutate({ showStudyActivity })}
/>
```

## Empty states and tables

### `EmptyState`

`src/components/ui/empty-state.tsx` (C-17): what a page or a list shows when
there is nothing in it. An optional `mascot`, a `title` (an `<h2>`),
`children` (at most two lines of text), optional `actions` (buttons) and
`className`; centred in what holds it. Used on the no-server page, a voice
room not built yet, and the server settings lists (roles, members, invites,
bans) when they are empty, match nothing, or could not load.

### `Pagination`

`src/features/servers/components/settings/Pagination.tsx` (C-40, D-90): the
bar under a table, "Show [50 ▾] of 137 members", then ‹ 1 2 … 9 ›. It lives
in the servers feature because only Members and Bans use it; a second
feature that needs it moves it to `src/components/` first.

Props: `page`, `limit` (`PageSize`: 10, 50 or 100), `total`, `of` (the "of 137
members" text, also the `<nav>`'s name), `perPage` (the size field's name),
`onPage`, `onLimit`. It renders nothing while ten or fewer match. Which page
buttons show is `pageButtons()` in `servers/lib/moderation.ts`.

## Forms

### `FormField`

`src/components/form/FormField.tsx` lays out a label, a control and one line
under it (C-22), and wires them for screen readers (`htmlFor`,
`aria-invalid`, `aria-describedby`). The line is the first that applies: the
`error` (an `octagon-x` icon and `danger` text, read out at once), then the
`status` (a line about the field's state, such as "Checking...", read out
politely when it changes), then the `hint`. An `action` (a link that belongs
to the field, such as "Forgot password?" on sign-in) sits at the end of the
label's row, but comes after the control in the tab order:

```tsx
<FormField label={t('email')} error={errors.email?.message}>
    {(control) => <Input type='email' {...control} {...register('email')} />}
</FormField>

<FormField label={t('welcome.username')} error={usernameError} status={usernameStatus} hint={t('welcome.usernameHint')}>
    {(control) => <Input {...control} {...register('username')} />}
</FormField>

<FormField label={t('fields.password')} error={passwordError} action={<Link to='/forgot-password'>{t('signIn.forgot')}</Link>}>
    {(control) => <PasswordInput {...control} {...register('password')} />}
</FormField>
```

`Input` (`src/components/ui/input.tsx`) is drawn to C-22: 40 high, a 1 px
edge that becomes 2 px `primary` on focus and 2 px `danger` when
`aria-invalid`; read-only (while a form is sending) loses its edge.

More: [shadcn-forms.md](./shadcn-forms.md).

### `FormMessage`

`src/components/form/FormMessage.tsx` (C-22): the message for a whole form,
right above its main button. An icon and small text, no background. Two
tones: `danger` for a failure no field owns, `neutral` for a limit to wait out
or information. Each tone has an icon, so colour is never the only sign:
`octagon-x` and `info` by default, or `clock`, `mail`, `wifi-off`. A form's
errors never go to a toast.

```tsx
<FormMessage tone='neutral' icon='clock'>{text({ key: 'auth:limits.other', values: { wait } })}</FormMessage>
<FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>{text(problem.message)}</FormMessage>
```

Used by every auth page and by the change-password, delete and restore
dialogs. `Notice` from `AuthCard.tsx` is left on `/auth/callback` only.

### `TimeZoneCombobox`

`src/components/form/TimeZoneCombobox.tsx` (C-25): a button that reads like a
text field, opening a panel (`Popover`) with a search box over the list of
time zones. The first row is always "From your browser: ...". Typing filters
by city ("tokyo", "ho chi minh", without accents) or by offset ("+9",
"gmt+9"); ↑ ↓ move, Enter picks, Esc closes and keeps the value. The value is
the zone's IANA name (`Asia/Ho_Chi_Minh`).

The list comes from `src/lib/time-zones.ts`: every IANA zone the browser
knows, as "GMT+7 · Hồ Chí Minh" in the language on screen, ordered by offset
then city, leaving out what the API refuses (bare offsets like `Etc/GMT+7`,
names without a region). `initialTimeZone()` is the browser's zone, or
Hồ Chí Minh when the browser gives none that can be saved. Used on
"complete your account".

Under the field the page puts "Time there now: 21:47" as the field's hint
(`timeIn()` from the same file, with `useMinuteClock`, which updates as each
minute starts): a person checks the pick against the clock where they are.
The combobox itself does not show it; a page that uses it adds the line, as
"complete your account" and Appearance & language (S-ME-04) do.

Two more props for the settings page: `aria-labelledby`, to be named by a
settings group's title instead of a field label, and `disabled`, while the
zone may not change yet (once every 24 hours; `timezone-rate-limited`).

### `Checkbox`

`src/components/ui/checkbox.tsx` (C-24b): a real `<input type="checkbox">`,
drawn as an 18 px box; checked is a `primary` box with a tick. Put its
sentence in a `<label>` for it, so clicking the words ticks it too.
Unticked by default. Used for the terms on "complete your account".

### `Switch`

`src/components/ui/switch.tsx` (C-24a): a `<button role="switch">` with
`aria-checked`; `checked` and `onCheckedChange`. A 36 × 20 track with a 16
knob: off is a `surface-3` track with a `border-input` edge, on is a
`primary` track. The knob changes side, so the state reads without colour.
Name it with `aria-labelledby` or a `<label htmlFor>`; in a settings row, use
[`SwitchRow`](#settings-rows).

### `SegmentedControl`

`src/components/ui/segmented-control.tsx` (C-26a): a few choices side by
side, one of them on (`value`, `onValueChange`, `segments`,
`aria-labelledby`, `disabled`). 36 high on `surface-2`; the chosen one is
lifted to `surface-1`. A radio group for assistive tech: Tab reaches the
chosen segment, and the arrow keys move **and choose** at once. A segment
can carry `lang` when its label is in another language ("English" on a
Vietnamese page). Used for the theme and the language on Appearance &
language.

### `Select`

`src/components/ui/select.tsx` (C-25 `select`): a 40-high field with
`chevron-down` that opens a list without a search box, for ten choices or
fewer; more, or a search, wants a combobox like `TimeZoneCombobox`. It is
Radix Select behind a props API rather than shadcn's parts.

Props: `value`, `onValueChange`, `options`, named by `id` and a
`<Label htmlFor>` or by `aria-label`, plus `aria-describedby`, `disabled`,
`labelClassName` (e.g. `uppercase` for category names) and `className`. An
option (`SelectOption`) has `value`, `label`, and optionally `description` (a
second line; the row grows to 48), `icon` (before the label, in the field
too: a lock for a private channel) and `trailing` (at the row's right: a
channel's category).

The chosen row has a 16 `check`. Keyboard as Radix Select: Enter, Space or ↓
open; ↑ ↓ move; Enter chooses; Esc closes keeping the value; a letter jumps.
Used for a new channel's category, an invite's expiry and uses, the welcome
channel, and the page size in `Pagination`. In tests it needs the
`scrollIntoView` stub in `src/test/setup.ts`, and is changed through its
hidden native `<select>`.

### `OptionCards`

`src/components/ui/option-cards.tsx` (C-37): two or three choices that each
need more than a line, as cards. A radio group with one tab stop; the arrow
keys move and choose.

Props: `label` (the group's name for assistive tech), `value`, `onChange`,
`options`, `disabled`, `className`. An option (`OptionCardItem`) has `value`,
`icon` (a Lucide icon), `title`, `tag` (optional, a Tag on its own line under the
title, e.g. "Suggested") and `description`. Selected reads without colour: a filled radio
and a 2 border. Used for the template on "Create a server" and the channel
type on "Create a channel". When one line per choice is enough, use
`SegmentedControl` or `Select`.

### `CodeInput`

`src/features/auth/components/CodeInput.tsx` (C-23), in the auth feature
since only `/verify` and `/reset-password` use it: six boxes for an emailed code. One real input
sits over them and takes the whole string (`autocomplete="one-time-code"`, so
the browser can offer the code from the email); the boxes only show it.
Pasting "482 913" or "482-913" fills all six. `onComplete` fires at the sixth
digit. States: `default`, `verifying`, `error` (after a wrong code, the first
digit typed starts again from an empty row) and `disabled`.

### `OAuthButtons`

`src/features/auth/components/OAuthButtons.tsx`, under the main button of
sign-in and "create an account": the "or" divider, then its `children` (on
sign-in, the button for the other way in), then "Continue with Google" when
the API offers it. Nothing at all when there is neither. Google is a link
(it leaves the app); with `disabled` (sign-in, while its form is being sent)
it is a disabled button instead.

## Modals

### `ConfirmPasswordDialog`

The password step before something that cannot be taken back
(`src/features/auth/components/ConfirmPasswordDialog.tsx`, C-14 `password`):
a title, the words, the field (focused on open) with **Forgot password?**,
and a `destructive` button off until something is typed. A wrong password is
said under the field, which empties; five in 15 minutes and the button waits
it out. `onConfirm(password)` sends it and throws when refused;
`describeError(error)` gives words for a refusal only the caller knows (a
handover refused for an account waiting to be deleted). **Forgot password?**
puts the change-password dialog on an emailed code (`PasswordDialog`) in its
place, which hands back, empty. Mounted while open; a click outside does not
close it.

Used by `DeleteAccountDialog` (by file, inside auth) and by the servers
feature's handover step, through `ConfirmPasswordDialog` in
`src/features/auth/index.ts`: a `lazy()` component, so the index, which is
in the first download, does not bring the dialog with it. Render it inside a
`Suspense` ([code-splitting.md](./code-splitting.md#what-lands-in-the-first-download)).

### `DeleteAccountDialog`

"Delete your account?" (`src/features/auth/components/DeleteAccountDialog.tsx`,
S-ME-03 `delete-confirm`), opened by the **Delete account** group at the foot
of the account page (`DeleteAccountSection.tsx`), which mounts it while open:
the day the account goes, then `ConfirmPasswordDialog`
([auth/account-settings.md](./auth/account-settings.md#delete-the-account)).
It is not exported from `src/features/auth/index.ts`: the entry imports that
index, so an export would put the dialog in the first download
([code-splitting.md](./code-splitting.md#what-lands-in-the-first-download)).

### Leave, hand over, delete a server

`src/features/servers/components/membership/` (03 S-SRV-04, 04 S-SET-07),
drawn by the AppShell from `useMembershipDialogs` (`MembershipDialogs`, loaded
with `lazy()` the first time one opens):

- `LeaveServerDialog`: a member is asked once (`leave-confirm`, the focus on
  **Cancel**); the owner is told to hand it over first (`owner-cannot-leave`)
  or, alone in it, to delete it (`owner-alone`), without a request.
- `TransferOwnershipDialog`: choose who (`transfer-picker`: the first 50 by
  name and a search, `?transferable=true`; someone timed out shown, not
  chosen; ↑ ↓ between the rows), then `ConfirmPasswordDialog` in its place,
  whose **Cancel** comes back to the choice. With a recipient (the members'
  ⋯ menu) it starts on the password; from the leave flow, **Leave server?**
  follows.
- `DeleteServerDialog`: C-14 `type-name`, as `DeleteChannelDialog`, with
  `sameTyped` from `lib/typed-name.ts`.

Left or deleted, `useMoveAwayFrom` moves a page of that server to the next
on the rail (below, else above), or to /study, and only then does the hook
take the server out of the cache
([data-fetching.md](./data-fetching.md#a-server-one-is-no-longer-in)).

### `PendingDeletionDialog`

"Your account is waiting to be deleted"
(`src/features/auth/components/PendingDeletionDialog.tsx`, S-AUTH-03
`pending-deletion`), over a sign-in page once someone signs in to an account
waiting to be deleted. No close button: **Not now**, Esc and the scrim all
sign out and leave the page as it was; **Restore account** restores it and
goes on. `GuestOnlyRoute` loads it with `lazy()`
([auth/session.md](./auth/session.md#an-account-waiting-to-be-deleted)).

### `ImageCropDialog`

`src/components/ImageCropDialog.tsx` (S-ME-02 `avatar-crop`, S-SRV-01
`icon-crop`): crops a chosen picture to a square before it is uploaded. A
mask of 280 over it (react-easy-crop), dragged to place it, zoomed 100–300%
with the `Slider`, the zoom buttons or the wheel.

Props:

- `src`: an object URL of the chosen file, the caller's to release
- `title`, `description`, `confirmLabel`
- `mask`: `round` for an avatar, `squircle` for a server icon (a third of the
  side, as the rail rounds it)
- `busy`: the caller is saving; the buttons wait, Esc and Cancel do nothing
- `onConfirm(blob)`: the crop as a JPEG; the caller closes the dialog when
  done
- `onClose`

The crop itself is `src/lib/crop-image.ts`. Confirming the same area again
gives the same Blob, so the idempotency key, which follows the payload, stays
the same. Its own words are `common:imageCrop.*`. Check the file first with
`imageProblem()` (`src/lib/image-file.ts`: JPG, PNG or WEBP up to 8 MB), so
a wrong file never opens it. Used by `AvatarCropDialog`, "Create a server"
and the server picture setting.

### `AvatarCropDialog`

The profile page's "Crop your profile picture"
(`src/features/users/components/AvatarCropDialog.tsx`, S-ME-02):
`ImageCropDialog` with `mask='round'` and the words in `users:crop.*`.
**Save photo** uploads at once (`useUpdateAvatar`); while it does, the dialog
stays (Esc and Cancel wait), and it closes once saved. A refused upload is
toasted and the dialog stays to try again.

The username dialog that used to open after a first sign-in
(`UsernamePromptModal`) is gone: the username is chosen on "complete your
account" ([auth/pages-and-flows.md](./auth/pages-and-flows.md#complete-your-account)).

## The tab's title

### `useDocumentTitle`

`src/hooks/useDocumentTitle.ts` (X-01): `useDocumentTitle(title)` shows
"<title> · NezFocus" in the browser tab while the page is open (the name is
`siteConfig.name`, `src/config/site.ts`), and the product's name again when
it closes. Call it once at the top of a page with its translated title. Used
by the six sign-in pages (SignIn, Register, Verify, Welcome, ForgotPassword,
ResetPassword) and the legal pages. The invite page sets its title by hand
for now (`InvitePage.tsx`: the server's name once known, then the title it
had before), with "· NezFocus" in its words rather than `siteConfig.name`.

## shadcn/ui components

`src/components/ui/` holds Radix UI primitives styled with Tailwind, copied
into the repository by the shadcn CLI, so you can edit them, and a few
components written for this project in the same style (the rows that say so):

| Component | What it is |
|-----------|-------------|
| `Avatar` | A profile picture with a fallback |
| `Button` | Default, secondary, outline, ghost, text, destructive and link variants |
| `Checkbox` | A checkbox (C-24b), a plain input rather than a Radix primitive ([above](#checkbox)) |
| `Dialog` | Modal dialogs |
| `DropdownMenu` | Menus, like your menu (`MeMenu`) |
| `Input` | Text inputs, drawn to C-22 ([above](#formfield)) |
| `Label` | Form labels |
| `OptionCards` | Two or three choices as cards (C-37), written for this project ([above](#optioncards)) |
| `Popover` | A floating panel anchored to the control that opened it (C-15; `@radix-ui/react-popover`). The time zone picker's panel |
| `SegmentedControl` | A few choices side by side (C-26a), written for this project ([above](#segmentedcontrol)) |
| `Select` | A short list to choose from (C-25), Radix Select behind a props API ([above](#select)) |
| `Skeleton` | Loading placeholders |
| `Slider` | A range input, drawn to C-35: a 4-high track, `primary` up to the value; a 16 knob in `text-primary` (the zoom of `ImageCropDialog`) |
| `Sonner` | The toaster, following the theme |
| `Switch` | An on/off switch (C-24a), a plain button rather than a Radix primitive ([above](#switch)) |
| `Textarea` | Multi-line text, drawn to C-22 `multiline`: the `Input`'s edge, colours and states; three lines high, growing with its text to six where the browser can (`field-sizing`), then scrolling |
| `Tooltip` | Tooltips; `WithTooltip` is the common case. `TooltipProvider` wraps the app in `App.tsx` |

Next to them, also written for this project and not in the table: `IconButton` (a
32 × 32 icon button with a screen-reader label), `PresenceDot`, `CountBadge`
and `EmptyState` ([above](#emptystate)).

### Adding one

```bash
pnpm dlx shadcn@latest add [component-name]
```

It reads `components.json` and writes the component into `src/components/ui/`.
The catalogue: https://ui.shadcn.com/docs/components
