/** Query keys of the servers feature. */
export const serverKeys = {
    all: ['servers'] as const,
    list: () => [...serverKeys.all, 'list'] as const,
    /** The links of one server (S-SET-04). */
    invites: (serverId: string) => [...serverKeys.all, 'invites', serverId] as const,
    /** One invite page (S-SRV-03). */
    invite: (code: string) => [...serverKeys.all, 'invite', code] as const
}
