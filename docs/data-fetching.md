# Data fetching: TanStack Query

Everything the app reads from the API goes through **TanStack Query** (also
called React Query): it caches the answer, shares it between components,
retries what is worth retrying, and refetches when told the data changed.
This page is how the starter uses it.

- [Why not `useEffect` and axios](#why-not-useeffect-and-axios)
- [The words](#the-words)
- [A query](#a-query)
- [Query keys](#query-keys)
- [Mutations and idempotency](#mutations-and-idempotency)
  - [Optimistic saves](#optimistic-saves)
- [Showing API errors](#showing-api-errors)
- [Retries](#retries)
- [What the API client does](#what-the-api-client-does)

## Why not `useEffect` and axios

Fetching in `useEffect` (or Vue's `onMounted`) means writing the loading and
error state by hand in every component, fetching the same thing twice when two
components need it, and handling the race when an older answer arrives after
a newer one. TanStack Query does all of that once.

## The words

| Word | Meaning |
| --- | --- |
| **Query** | Reading data: `useQuery` |
| **Mutation** | Changing data: `useMutation`, or `useIdempotentMutation` here |
| **Query key** | The cache entry's name, an array: `['users', 'profile']` |
| **Query function** | The function that fetches: an axios call |
| **Stale time** | How long an answer counts as fresh before it is fetched again in the background. The default here is 5 minutes |
| **Invalidate** | Mark a cached answer stale, so it is fetched again: what a mutation does after it succeeds |

## A query

Hooks live with the feature that uses them: `src/features/<feature>/api/`
([project-structure.md](./project-structure.md)). The profile, as the starter
fetches it (`src/features/users/api/useProfile.ts`):

```ts
// api/users.api.ts: the request itself
export async function fetchProfile(): Promise<UserProfile> {
    const response = await api.get<ApiEnvelope<UserProfile>>('/users/me')
    return response.data.data // the envelope is { meta, data }
}

// api/useProfile.ts: the query around it
export function useProfile(enabled = true) {
    return useQuery({
        queryKey: userKeys.profile(),
        queryFn: fetchProfile,
        enabled,
        staleTime: 60000 // 1 minute
    })
}
```

NezFocus's `useProfile` adds one thing: while a removed avatar waits out its
"Undo", a `select` hides it (`avatarUrl: null`) for every reader
([state-management.md](./state-management.md#the-stores)).

The request is a function of its own so that code outside React can make the
same one: the auth store calls `fetchProfile()` at sign-in and puts the answer
in this query's cache, so the two can never disagree about what a profile is.

Two things to copy from it:

- **Return `response.data.data`**, not the envelope. Every API answer is
  `{ meta, data }` ([api-types.md](./api-types.md)); components want the
  `data`.
- **`enabled`** turns the query off until it can work: `useProfile(enabled)`
  takes it as a parameter, so a caller that may render for a visitor can hold
  the request back until someone is signed in.

In a component:

```tsx
function ProfileCard() {
    const { data: profile, isPending, isError } = useProfile()

    if (isPending) return <ProfileSkeleton />
    if (isError) return <p>{t('profile.failedToLoad')}</p>

    return <p>Hello {profile.displayName}</p>
}
```

## Query keys

Keys for a feature live in one factory, next to its hooks:
`src/features/users/api/keys.ts`.

```ts
export const userKeys = {
    all: ['users'] as const,
    profile: () => [...userKeys.all, 'profile'] as const,
    settings: () => [...userKeys.all, 'settings'] as const,
    usernameAvailability: (username: string) => [...userKeys.all, 'username-availability', username] as const
}
```

Two `useQuery` calls with the same key share one cache entry — whichever
`queryFn` ran last decides what both see. Defining keys in one place (and
fetching a resource through one hook, like `useProfile`) keeps that from
happening by accident, and makes invalidation hit the right entries.

**Every place that changes a cached list goes through the same hook.** The
cache update (`setQueryData` or `invalidateQueries`) lives in the mutation
hook, never in a component, so an action reachable from two screens keeps
both right: a link revoked from the invite panel leaves the Invites page too,
because both call `useRevokeInvite` (M1 › R1 found the panel calling
`revokeInvite` directly). When adding a mutation, list the query keys whose
answer it changes and update each one in the hook, including the error that
means "already done" (`INVITE_INVALID` on a revoke, `NOT_FOUND_ERROR` on a
change to a channel deleted meanwhile, which reads the list again). The test
of an action reachable from two screens renders both over one query client
and checks the second; the test of one reachable from one screen reads the
cached list after the save, as the channel dialogs' tests do.

A lint rule keeps it so: a feature's `components/` and `pages/` may not
import a value from a `*.api.ts` file or the API client (`@/lib/api`), only
types (`@typescript-eslint/no-restricted-imports` in `eslint.config.js`, M1 ›
R3). It does not see a request function re-exported through a feature's
`index.ts`, so keep those out of it. A look-up that runs on a click rather
than on render is a hook too: `useLookUpInvite`
(`src/features/servers/api/useInvites.ts`) returns a function around
`queryClient.fetchQuery`, under the invite page's key. The sign-in pages are
outside the rule, named one by one: they call `authApi` or the store
themselves, since what follows is the session
([auth/forms-and-errors.md](./auth/forms-and-errors.md#how-an-auth-form-is-built));
the account settings page is held by it.

One piece of work outlives any screen, and so is not a hook: removing an
avatar waits out the toast's **Undo**, then still runs if the page closed,
the tab was closed or the user signed out. `removeAvatarWithUndo`
(`src/features/users/lib/avatar-removal.ts`) calls the API and updates the
profile's cache itself, from the feature's `lib/`, which the rule does not
hold.

The auth store writes the profile into this same entry at sign-in
(`queryClient.setQueryData(userKeys.profile(), profile)`), so your menu, the
profile page and "complete your account" need no second request. Signing out
clears the whole cache, so one user's data never shows for the next.

**Sharing a query with another feature.** The account's settings
(`settingsQuery` in `src/features/users/api/settings.api.ts`: key,
`queryFn`, a one-minute `staleTime`) are loaded by the AppShell as the app
opens; inside the users feature they are `useSettings()`. Another feature
only reads that cache, `useQuery({ queryKey: userKeys.settings(), enabled:
false })`, as the Sessions group does for the account's time zone. Exporting
a hook or the options from the users index would put their modules in the
first download ([code-splitting.md](./code-splitting.md#what-lands-in-the-first-download)).
The AppShell reads the query as the app opens (`useAccountSettings`), so the
pages find it in the cache.

## Mutations and idempotency

Backend routes marked `@Idempotent` **require** an `Idempotency-Key` header.
Use `useIdempotentMutation` (`src/hooks/useIdempotentMutation.ts`) instead of
`useMutation` for them — its `mutationFn` receives the key to send. From
`src/features/users/api/useUpdateProfile.ts`:

```ts
export function useUpdateProfile() {
    const queryClient = useQueryClient()
    const { t } = useTranslation('users')

    return useIdempotentMutation({
        mutationFn: async (values: UpdateProfileRequest, idempotencyKey) => {
            await api.patch('/users/me', values, { headers: { 'Idempotency-Key': idempotencyKey } })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
            toast.success(t('toasts.profileUpdated'))
        }
        // Failures: one toast from the query client (below), not here.
    })
}
```

What the hook does on success is what every caller wants: the cache and the
toast. What only one screen wants, closing its dialog say, goes to
`mutate()`, as TanStack Query intends:

```ts
// AvatarCropDialog: the crop dialog closes once the picture is saved
upload.mutate(blob, { onSuccess: onClose })
```

`mutate()`'s callbacks are skipped if the component has unmounted by then,
which is what a screen's own reaction should do.

The key represents one **user intent**, not one HTTP attempt:

| Situation | Key |
|---|---|
| Retrying the same payload after a timeout or network error | **Same** — if the first attempt actually succeeded, the server replays its answer instead of doing the work twice |
| Double click while the first request is in flight | **Same request** — the second call joins the first; nothing extra is sent |
| Payload changed (the user edited the form) | **New** — the server keys on the header alone, so reusing it would replay the old answer and drop the edit |
| After a success | **New** — doing the same thing again on purpose runs again |

Don't generate keys in an axios interceptor: it runs once per attempt, so
every retry would carry a fresh key and the server could never recognise a
repeat. `src/lib/api.ts` deliberately leaves the header alone.

Keys come from `generateIdempotencyKey()` (`src/lib/idempotency.ts`), which
falls back to `crypto.getRandomValues` because `crypto.randomUUID` does not
exist on plain-HTTP origins (a deployment opened by LAN IP, say).

Never call `generateIdempotencyKey()` inside a submit handler next to a
`*.api.ts` call: each click then sends a new key, and "Create" again after a
lost answer makes the thing twice (M1 › R1 found three such dialogs). Put
the call in a hook in the feature's `api/` folder built on
`useIdempotentMutation`, as `useCreateChannel` does
(`src/features/servers/api/useChannelLayout.ts`); the test of a dialog that
creates something sends twice after a network error and expects the same key.

One exception: an attempt that runs after its component has closed, like the
"Try again" in the toast left by a server picture that failed to save
(`useCreateServer.ts` › `saveNewServerIcon`). There the key is made once and
handed to each retry in the closure, since the hook went with the dialog
(`CONSTRAINTS.md` › Ngoại lệ E1).

### Optimistic saves

`PATCH /users/me/settings` is not `@Idempotent` (sending the same values
again changes nothing), so the settings pages use a plain `useMutation`:
`useUpdateSettings()` (`src/features/users/api/useUpdateSettings.ts`). Each
switch or choice saves on its own and shows at once:

- `onMutate` cancels the settings query and writes the change into its
  cache, keeping the old value;
- `onSuccess` writes what the API saved and tells the other tabs
  (`tellOtherTabs`, a `BroadcastChannel` in
  `src/features/users/lib/settings-sync.ts`);
- `onError` puts the old value back, reads the settings again (another save
  may have landed), and shows a toast with **Try again**, which sends the
  same change. That toast replaces the app's generic one, so the mutation
  sets `meta: { errorToast: false }` (without it a failed save showed two).

A drag in the channel list saves the same way: `useMoveInLayout`
(`src/features/servers/api/useChannelLayout.ts`) shows the move, puts the
list back and offers **Try again** if it is refused, and reads the list
again when it was refused for being made on an old one (`stale_move`). So
does the welcome channel (`useChooseWelcomeChannel` in
`useServerSettings.ts`). Both take the server in the mutation's variables,
not as the hook's argument: **Try again** resends the variables of the
failed attempt, while the hook's options follow the screen, which may show
another server by then.

**Try again belongs to the hook**, in its `onError`, never in the callbacks
of `mutate()`: those are skipped once the component has unmounted, so a
Try again clicked after leaving the tab would send the change and then say
nothing, whether it worked or failed. Every save-at-once of the server
settings does this (M1 › R3d1): the role switches (`useSaveRoleSwitch`),
taking a role from someone and its Undo (`useTakeRole`), a tick in "+"
(`useSetMemberRole`), the role order (`useReorderRoles`), "Remove timeout"
(`useEndTimeout`) and "Remove picture" (`useRemoveServerIcon`). Their hooks
take the server and role as arguments: the page showing them is keyed by
its path and role, so it never shows another one with the same hook. A
success toast that has to follow the change, "Removed … from …" with Undo
say, is the hook's too, with the names it shows passed in the variables.
A role switch sends a whole permission set, so `useSaveRoleSwitch` takes
one flip (`{ permission, on }`) and sets it on the role as saved when its
turn comes (the role's changes run one after another, `scope`): Try again
then never undoes a switch saved since.

The time zone is not optimistic: it asks first and can be refused for 24
hours, so `TimeZoneSetting` (`src/features/users/components/`) saves it
with its own mutation, `useUpdateTimeZone`
(`src/features/users/api/useUpdateTimeZone.ts`). A `429` with `data.reason: "timezone"` (changed from
another tab or device meanwhile) reads the settings again, so the page shows
the lock, with no toast (it also sets `meta: { errorToast: false }`).

**A form that shows its own errors** (field by field) calls the hook's
`mutateAsync` in a `try`, and the hook sets `meta: { errorToast: false }` so
the failure is not toasted as well. The auth settings do this
(`src/features/auth/api/useChangePassword.ts`, `useDeleteAccount.ts`), so
the component only decides where each error shows.

## Showing API errors

**A failed mutation already shows a toast.** The query client's
`MutationCache` (`src/lib/query-client.ts`) shows one translated error toast
for every mutation that fails. So:

- **Don't add `toast.error` in a mutation's `onError`** — the user would see
  the message twice. Keep `onError` for side effects (resetting a field,
  branching on a type).
- **When the screen shows the error itself** (a message under a field), opt
  out: `meta: { errorToast: false }` on the mutation.
- **For a different fallback message**: `meta: { errorFallbackKey: 'api:SOME_KEY' }`.

Failed **queries** show no toast: the component has `isError` and decides.

Error answers use the same envelope as successes, and their identity is in
`meta`:

```json
{ "meta": { "code": "409200", "type": "USERNAME_CONFLICT", "message": "…", "request_id": "…" }, "data": { … } }
```

`getApiErrorMessage(error)` (`src/lib/api-error.ts`) looks up
`api:<meta.type>` in `src/i18n/locales/*/api.json`, so messages are in the
user's language; unknown types fall back to `GENERIC_ERROR` (or a key you
pass). A request that got no answer maps to `NETWORK_ERROR`. The server's
`meta.message` is English text for developers and is never shown.

When the backend adds an error type, add the same key to **both**
`en/api.json` and `vi/api.json` — a test fails if the two catalogues differ.

To branch on a specific error, use `getApiErrorType(error)`:

```ts
useIdempotentMutation({
    mutationFn: …,
    meta: { errorToast: false }, // this screen shows the error under the field
    onError: (error) => {
        if (getApiErrorType(error) === 'USERNAME_CONFLICT') setError('username', { message: t('…') })
        else toast.error(getApiErrorMessage(error))
    }
})
```

The auth pages go one step further, with field errors and `Retry-After`
waits: [auth/forms-and-errors.md](./auth/forms-and-errors.md).

## Retries

Queries retry once, and only for failures a retry can fix: no answer at all,
`408`, `429` and `5xx` (`shouldRetryQuery` in `src/lib/query-client.ts`). A
`401`, `403`, `404` or `422` fails the same way every time, so retrying only
delays the error. Mutations don't retry by themselves. Queries are not
refetched when the window regains focus (`refetchOnWindowFocus: false`), but
the server list is, every time (`'always'` in `useServers`: `true` only
reads a list older than the 5-minute stale time; see below).

## A server one is no longer in

Until M2 brings live updates, the app learns that someone was kicked, banned,
or saw their server deleted from requests (D-143).
`src/features/servers/hooks/useServerGoneWatch.ts`, run once by the AppShell,
listens to the query cache and the mutation cache (`getQueryCache().subscribe`,
`getMutationCache().subscribe`):

- a request under `/servers/{id}` refused with `NOT_FOUND_ERROR` reads the
  server list again (`notFoundServerId` in `lib/membership.ts`). The error
  alone cannot say the server is gone: the API answers the same for a gone
  channel, role or member (NFR-SEC-05). The list decides;
- a list read from the API that no longer has a server the last one had
  gets a Toast "You are no longer in {server}"; the page on it already goes
  to /study when its server is not in the list.

Leaving or deleting one oneself takes it out with `setQueryData`, which React
Query marks `manual`: the watch moves on without that Toast. The order there
matters: the hook awaits the page's move first
(`useMoveAwayFrom`, `navigate(..., { flushSync: true })`), then changes the
cache. The router otherwise hands the move to React as a transition, still
pending when its promise settles, and the cache change, drawn first, has the
page of the server just gone send everyone to /study. Handing a server over
does the same before the new list goes in, so a settings page no longer
theirs moves without "You no longer have access".

## What the API client does

`src/lib/api.ts`, the axios instance every hook uses:

1. **Attaches the access token** when someone is signed in, refreshing it
   first when it is about to expire.
2. **Converts the casing**: JSON bodies and query parameters go out in
   `snake_case`, answers come back in `camelCase`. `FormData`, `Blob` and
   other non-JSON bodies pass through untouched (`src/lib/case-transform.ts`).
3. **Handles the API ending a session**: a `401` with `AUTH_TOKEN_EXPIRED`,
   `AUTH_TOKEN_INVALID` or `AUTH_TOKEN_REVOKED` (another tab may have left a
   newer session in the shared cookie, D-74) is refreshed and retried once; a
   `401` a refresh
   cannot fix, or a `403` with `AUTH_ACCOUNT_DISABLED`, signs out. Any other
   `403` is the page's to handle ([auth/session.md](./auth/session.md)).
4. **Leaves the auth routes alone**: calls to `/auth/*` that sign in or
   refresh are made with `skipAuth` (no token, and their `401` is an answer,
   such as a wrong password) and `withCredentials` (so the refresh cookie
   crosses from the API's origin).
