import type { QueryClient } from '@tanstack/react-query'

/**
 * What the Privacy page's "Block list" row (S-ME-05, D-131) and the unread
 * counts (messaging, D-250) need of the people one blocked: the query that
 * holds them, and where the list is.
 * They are the social feature's, which already uses users: users says what
 * it needs here, the social feature answers (the query as its options, so
 * the key and the cache stay its own), and the AppShell connects the two,
 * as `ServerOwnership` does for deleting an account.
 */
export interface BlockList {
    /** The relationships as one query: the row counts those of type `blocked`, the unread counts skip them. */
    query: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<readonly { type: string; user: { id: string } }[]>
        staleTime?: number
    }
    /** The Blocked tab of the Friends page (09 S-DM-02 `blocked`). */
    path: string
}

let blockList: BlockList | undefined

export function connectBlockList(next: BlockList): void {
    blockList = next
}

/** The connected answer. Unconnected is a wiring mistake, not "nobody blocked". */
export function connectedBlockList(): BlockList {
    if (!blockList) throw new Error('BlockList is not connected: the AppShell connects it.')
    return blockList
}

/**
 * Whether the person is one the reader blocked, as the cache holds the
 * relationships now (not read yet: nobody; the port not connected: a wiring
 * mistake, thrown as `connectedBlockList` does). Outside React: a message
 * heard from them is never unread (REQ-MSG-09, D-250).
 */
export function isBlockedIn(client: QueryClient, userId: string): boolean {
    const list = client.getQueryData<readonly { type: string; user: { id: string } }[]>(
        connectedBlockList().query.queryKey
    )
    return list?.some((entry) => entry.type === 'blocked' && entry.user.id === userId) ?? false
}
