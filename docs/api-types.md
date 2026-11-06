# API types generated from the backend

The types for what the API sends and accepts are generated from the backend's
OpenAPI document (`openapi.json` in the Nest starter; see its
`docs/openapi.md`). They are not written by hand, so they can't quietly drift
from the real API.

```
Nest DTOs ──pnpm openapi:export──▶ openapi.json ──pnpm api:types──▶ src/lib/api-schema.d.ts ──▶ ApiModel<'…Dto'>
```

## Commands

| Command | What it does |
|---|---|
| `pnpm api:types` | Regenerates `src/lib/api-schema.d.ts` from the running dev backend (`http://localhost:8888/api-docs-json`). |
| `pnpm api:types <file-or-url>` | Same, from a file or another URL. |
| `pnpm api:types:check [file-or-url]` | Fails if the committed types don't match the spec. Not run by this repository's CI, because the spec lives in the API's repository: run it after the API changes ([ci.md](./ci.md#what-ci-doesnt-do)). |

The source can also be set with `OPENAPI_SPEC`. With the starters checked out
side by side (`<folder>/REACT/React-Starter-No-Keycloak` and
`<folder>/NEST/Nest-Hexagonal-No-Keycloak`):

```
pnpm api:types ../../NEST/Nest-Hexagonal-No-Keycloak/openapi.json
```

Production API docs need a password, so point production-like setups at the
committed file instead of a URL.

`src/lib/api-schema.d.ts` is committed, so building the app never needs the
backend. Don't edit it — it is overwritten on every run.

## Using the types

`api-schema.d.ts` uses the wire names (snake_case). The axios client camelCases
every response, so use the camelCased view from `src/lib/api-types.ts`:

```ts
import type { ApiEnvelope, ApiModel } from '@/lib/api-types'

// A model, named after the backend DTO
type UserProfile = ApiModel<'UserProfileResponseDto'>

// A response: every success response is { meta, data }
const response = await api.get<ApiEnvelope<UserProfile>>('/users/me')
response.data.data.completed // boolean — typed from the backend

// A request body
const body = { displayName, username, password, timezone, language, termsAccepted } satisfies ApiModel<'CompleteAccountRequestDto'>
```

Feature code names the models it uses once, in the feature's `types.ts`
(see `src/features/users/types.ts`), and imports them from there.

Optional and nullable fields come through as the backend declares them:
`email?: string` may be missing, `avatarUrl: string | null` is always present
but may be `null`. Handle both as TypeScript tells you to.

## When the backend changes

1. In the backend: `pnpm openapi:export`, commit `openapi.json`.
2. Here: `pnpm api:types <path to that openapi.json>`.
3. Run `pnpm build` (or `npx tsc -b`). Every place that relied on the old shape
   is now a type error — that list is the work to do.
4. Commit the regenerated file with the fixes.
