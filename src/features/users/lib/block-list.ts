/**
 * What the Privacy page's "Block list" row (S-ME-05, D-131) needs of the
 * people one blocked: the query that holds them, and where the list is.
 * They are the social feature's, which already uses users: users says what
 * it needs here, the social feature answers (the query as its options, so
 * the key and the cache stay its own), and the AppShell connects the two,
 * as `ServerOwnership` does for deleting an account.
 */
export interface BlockList {
    /** The relationships as one query: the row counts those of type `blocked`. */
    query: {
        queryKey: readonly unknown[]
        queryFn: () => Promise<readonly { type: string }[]>
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
