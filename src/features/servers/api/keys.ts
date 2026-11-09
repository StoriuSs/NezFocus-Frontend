/** Query keys of the servers feature. */
export const serverKeys = {
    all: ['servers'] as const,
    list: () => [...serverKeys.all, 'list'] as const
}
