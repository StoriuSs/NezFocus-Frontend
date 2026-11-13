/**
 * What other features may use from users. Everything else is internal and free
 * to move (an ESLint rule refuses deep imports from another feature).
 */
export { userKeys } from './api/keys'
export { settingsCache } from './api/settingsCache'
export { fetchProfile } from './api/users.api'
export { useProfile } from './api/useProfile'
export { USERNAME_MAX_LENGTH, USERNAME_PATTERN, useUsernameAvailability } from './api/useUsernameAvailability'
export { USERS_PATHS } from './lib/paths'
export { displayNameIssue } from './lib/profile-text'
export type { UserProfile, UserSettings } from './types'
