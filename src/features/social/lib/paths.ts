import { FRIENDS_TABS, type FriendsTab } from '../types'

/**
 * The social feature's pages' paths (09 › URL, D-248): the patterns
 * `routes.tsx` declares, and the functions links build paths with.
 */
export const SOCIAL_PATHS = {
    /** The Friends page (S-DM-02), `?tab=online|all|pending|blocked`. */
    friends: '/friends'
} as const

/** `/friends`, with a tab when given. */
export const friendsPath = (tab?: FriendsTab) => (tab ? `${SOCIAL_PATHS.friends}?tab=${tab}` : SOCIAL_PATHS.friends)

/** The tab a `?tab=` names, or null for none or an unknown one. */
export const tabOf = (value: string | null): FriendsTab | null =>
    (FRIENDS_TABS as readonly string[]).includes(value ?? '') ? (value as FriendsTab) : null

/** Whether a page is of the messages area (the rail's 💬 lit): the Friends page in M6 L6. */
export const isMessagesPath = (pathname: string) => pathname === SOCIAL_PATHS.friends
