/** Query keys of the social feature. */
export const socialKeys = {
    all: ['social'] as const,
    /** Friends, requests both ways and the people I blocked, read once as the app opens (D-242). */
    relationships: () => [...socialKeys.all, 'relationships'] as const,
    /** Someone looked up by username in the Add friend dialog (D-110). */
    lookup: (username: string) => [...socialKeys.all, 'lookup', username] as const,
    /** Someone's profile (D-109): the DM's profile panel (C-50). */
    profile: (userId: string) => [...socialKeys.all, 'profile', userId] as const,
    /** My DMs shown in my list, read once as the app opens (D-242, D-244). */
    dms: () => [...socialKeys.all, 'dms'] as const,
    /** The people a DM's composer suggests after @: the other one (D-238). */
    dmMentions: (dmId: string, query: string) => [...socialKeys.all, 'dm-mentions', dmId, query] as const,
    /** The roles a DM's composer suggests: none (D-238), as a query the chat's MentionSource takes. */
    dmRoles: () => [...socialKeys.all, 'dm-roles'] as const
}
