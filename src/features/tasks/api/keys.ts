/** Whether a key is one of the To-do page's (`taskKeys.mine()` and below). */
export const isMineKey = (key: readonly unknown[]): boolean => key[0] === 'tasks' && key[1] === 'mine'

/** Query keys of the tasks feature. */
export const taskKeys = {
    all: ['tasks'] as const,
    /** Every board held, of any channel. */
    boards: () => [...taskKeys.all, 'board'] as const,
    /** Everything of one channel's Task Board: the open tasks and the done pages, any search. */
    board: (channelId: string) => [...taskKeys.boards(), channelId] as const,
    /** The tasks not done and how many are done (S-TASK-01); `search` folded, '' for none. */
    open: (channelId: string, search: string) => [...taskKeys.board(channelId), 'open', search] as const,
    /** The done tasks, latest done first, 50 a page (D-97). */
    done: (channelId: string, search: string) => [...taskKeys.board(channelId), 'done', search] as const,
    /** Everything of the To-do page (S-TASK-04): its lists for any server and search. */
    mine: () => [...taskKeys.all, 'mine'] as const,
    /** One's tasks not done and the counts (D-186); `server` '' for every server, `search` folded, '' for none. */
    mineOpen: (server: string, search: string) => [...taskKeys.mine(), 'open', server, search] as const,
    /** One's done tasks, latest done first, 50 a page (D-97). */
    mineDone: (server: string, search: string) => [...taskKeys.mine(), 'done', server, search] as const,
    /** One task, as its detail shows it (S-TASK-02). */
    one: (taskId: string) => [...taskKeys.all, 'one', taskId] as const,
    /** Its history, newest first (REQ-TASK-03). */
    history: (taskId: string) => [...taskKeys.all, 'history', taskId] as const
}
