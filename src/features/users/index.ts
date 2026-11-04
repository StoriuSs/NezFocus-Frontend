/**
 * What other features may use from users. Everything else is internal and free
 * to move (an ESLint rule refuses deep imports from another feature).
 */
export { userKeys } from './api/keys'
export { fetchProfile } from './api/users.api'
export { USERS_PATHS } from './lib/paths'
export type { UserProfile } from './types'
