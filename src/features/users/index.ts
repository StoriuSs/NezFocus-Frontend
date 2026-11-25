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
export { connectBlockList, isBlockedIn, type BlockList } from './lib/block-list'
/** Someone's avatar or name opening their profile popover, the servers feature's, through this port (D-253). */
export { ProfileDialogs } from './components/ProfileDialogs'
export { ProfileTrigger } from './components/ProfileTrigger'
export {
    connectProfilePopover,
    type ProfileCardProps,
    type ProfilePopover,
    type ProfilePopoverProps,
    type ProfileTarget
} from './lib/profile-popover'
export { displayNameIssue } from './lib/profile-text'
export type { UserProfile, UserSettings } from './types'
