import type { MemberQuery, PageSize } from './roles.api'

/** Query keys of the servers feature. */
export const serverKeys = {
    all: ['servers'] as const,
    list: () => [...serverKeys.all, 'list'] as const,
    /** The links of one server (S-SET-04). */
    invites: (serverId: string) => [...serverKeys.all, 'invites', serverId] as const,
    /** One invite (S-SRV-03), with the channel its link names: the invite page and "Join with an invite code". */
    invite: (code: string, channel: string | null) => [...serverKeys.all, 'invite', code, channel] as const,
    /** The Roles page of one server (S-SET-02). */
    roles: (serverId: string) => [...serverKeys.all, 'roles', serverId] as const,
    /** The roles anyone in the server may mention after @ (D-171): read again when a role changes. */
    mentionableRoles: (serverId: string) => [...serverKeys.roles(serverId), 'mentionable'] as const,
    /** Members of one server, any search (D-152). */
    members: (serverId: string) => [...serverKeys.all, 'members', serverId] as const,
    /** One page of one search. */
    memberPage: (serverId: string, query: MemberQuery) => [...serverKeys.members(serverId), query] as const,
    /** The people suggested after @ for what was typed (C-12 › MentionSuggest). */
    mentionMembers: (serverId: string, query: string) => [...serverKeys.members(serverId), 'mention', query] as const,
    /** The ban list of one server, any page (S-SET-04). */
    bans: (serverId: string) => [...serverKeys.all, 'bans', serverId] as const,
    banPage: (serverId: string, page: number, limit: PageSize) => [...serverKeys.bans(serverId), page, limit] as const
}
