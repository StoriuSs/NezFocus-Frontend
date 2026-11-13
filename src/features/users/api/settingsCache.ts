import { queryOptions, skipToken } from '@tanstack/react-query'
import type { UserSettings } from '../types'
import { userKeys } from './keys'

/**
 * The account's settings as another feature reads them:
 * `useQuery(settingsCache)`. Only the cache the AppShell fills
 * (settings.api.ts), never a request of its own, and without pulling that
 * module into the other feature's chunk. `skipToken` rather than
 * `enabled: false`: a query without a queryFn is an error in TanStack Query.
 */
export const settingsCache = queryOptions<UserSettings>({ queryKey: userKeys.settings(), queryFn: skipToken })
