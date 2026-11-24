/** Query keys of the social feature. */
export const socialKeys = {
    all: ['social'] as const,
    /** Friends, requests both ways and the people I blocked, read once as the app opens (D-242). */
    relationships: () => [...socialKeys.all, 'relationships'] as const,
    /** Someone looked up by username in the Add friend dialog (D-110). */
    lookup: (username: string) => [...socialKeys.all, 'lookup', username] as const
}
