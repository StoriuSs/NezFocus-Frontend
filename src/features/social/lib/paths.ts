import { FRIENDS_TABS, type FriendsTab } from '../types'

/**
 * The social feature's pages' paths (09 › URL, D-248): the patterns
 * `routes.tsx` declares, and the functions links build paths with.
 */
export const SOCIAL_PATHS = {
    /** The Friends page (S-DM-02), `?tab=online|all|pending|blocked`. */
    friends: '/friends',
    /** A DM (S-DM-03): its channel's id. */
    dm: '/dm/:dmId',
    /** A message of a DM (D-48): only its two open it. */
    dmMessage: '/dm/:dmId/:messageId'
} as const

/** `/friends`, with a tab when given. */
export const friendsPath = (tab?: FriendsTab) => (tab ? `${SOCIAL_PATHS.friends}?tab=${tab}` : SOCIAL_PATHS.friends)

/** `/dm/{id}`. */
export const dmPath = (dmId: string) => `/dm/${dmId}`

/** Whether `pathname` is a DM's page: the DM, or one of its messages (`/dm/{id}/{message}`). */
export const isDmPage = (pathname: string, dmId: string) =>
    pathname === dmPath(dmId) || pathname.startsWith(`${dmPath(dmId)}/`)

/** `/dm/{id}/{message}`. */
export const dmMessagePath = (dmId: string, messageId: string) => `${dmPath(dmId)}/${messageId}`

/** The whole link to a DM's message, to copy (S-CHAT-03 "Copy message link"). */
export const dmMessageLink = (dmId: string, messageId: string) =>
    new URL(dmMessagePath(dmId, messageId), window.location.origin).toString()

/** The tab a `?tab=` names, or null for none or an unknown one. */
export const tabOf = (value: string | null): FriendsTab | null =>
    (FRIENDS_TABS as readonly string[]).includes(value ?? '') ? (value as FriendsTab) : null

/** Whether a page is of the messages area (the rail's 💬 lit): the Friends page, or a DM. */
export const isMessagesPath = (pathname: string) => pathname === SOCIAL_PATHS.friends || pathname.startsWith('/dm/')

/**
 * Where 💬 comes back to from a page of the messages area (Q6): a DM, without
 * the message it was opened at; the Friends page, without its tab (09 Q7:
 * the tab is not kept). Null for any other page.
 */
export function messagesPlaceOf(pathname: string): string | null {
    if (pathname === SOCIAL_PATHS.friends) return SOCIAL_PATHS.friends
    const dm = /^\/dm\/([^/]+)/.exec(pathname)
    return dm ? dmPath(dm[1]!) : null
}
