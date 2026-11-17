/** Query keys of the tasks feature. */
export const taskKeys = {
    all: ['tasks'] as const,
    /** Everything of one channel's Task Board: the open tasks and the done pages, any search. */
    board: (channelId: string) => [...taskKeys.all, 'board', channelId] as const,
    /** The tasks not done and how many are done (S-TASK-01); `search` folded, '' for none. */
    open: (channelId: string, search: string) => [...taskKeys.board(channelId), 'open', search] as const,
    /** The done tasks, latest done first, 50 a page (D-97). */
    done: (channelId: string, search: string) => [...taskKeys.board(channelId), 'done', search] as const
}
