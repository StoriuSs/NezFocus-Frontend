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
    usernameAvailability: (username: string) => [...userKeys.all, 'username-availability', username] as const
}
```

Two `useQuery` calls with the same key share one cache entry — whichever
`queryFn` ran last decides what both see. Defining keys in one place (and
fetching a resource through one hook, like `useProfile`) keeps that from
happening by accident, and makes invalidation hit the right entries.

The auth store writes the profile into this same entry at sign-in
(`queryClient.setQueryData(userKeys.profile(), profile)`), so your menu, the
profile page and "complete your account" need no second request. Signing out
clears the whole cache, so one user's data never shows for the next.

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
updateMutation.mutate(values, { onSuccess: () => setEditOpen(false) })
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
refetched when the window regains focus (`refetchOnWindowFocus: false`).

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
