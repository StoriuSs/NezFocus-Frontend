/** Query keys of the servers feature. */
export const serverKeys = {
    all: ['servers'] as const,
    list: () => [...serverKeys.all, 'list'] as const,
    /** The links of one server (S-SET-04). */
    invites: (serverId: string) => [...serverKeys.all, 'invites', serverId] as const,
    /** One invite page (S-SRV-03). */
    invite: (code: string) => [...serverKeys.all, 'invite', code] as const,
    /** The Roles page of one server (S-SET-02). */
    roles: (serverId: string) => [...serverKeys.all, 'roles', serverId] as const,
    /** Members of one server, any search (D-152). */
    members: (serverId: string) => [...serverKeys.all, 'members', serverId] as const,
    /** The ban list of one server, any page (S-SET-04). */
    bans: (serverId: string) => [...serverKeys.all, 'bans', serverId] as const
}
