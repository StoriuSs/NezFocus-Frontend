import { create } from 'zustand'

/** One server one was kicked or banned from, as the dialog says it (11 S-MOD-02). */
export interface ServerRemoval {
    serverId: string
    /** The server's name when it went. */
    name: string
    by: 'kick' | 'ban'
    reason: string | null
}

interface ServerRemovalsState {
    /** In the order the events came; the first is shown. */
    queue: ServerRemoval[]
    push: (removal: ServerRemoval) => void
    /** The first was read ("Got it"): the next one shows. */
    next: () => void
}

/**
 * The dialogs of S-MOD-02, one at a time (E4: removed from two servers at
 * once, the second shows when the first closes). Filled by
 * useServerGoneWatch as `member.left` of one's own removal comes, drawn by
 * the AppShell, which loads the dialog the first time one is waiting. Each
 * tab keeps its own (Q8); a reload forgets them (E6).
 */
export const useServerRemovals = create<ServerRemovalsState>((set) => ({
    queue: [],
    push: (removal) =>
        set((state) =>
            state.queue.some((waiting) => waiting.serverId === removal.serverId)
                ? state
                : { queue: [...state.queue, removal] }
        ),
    next: () => set((state) => ({ queue: state.queue.slice(1) }))
}))
