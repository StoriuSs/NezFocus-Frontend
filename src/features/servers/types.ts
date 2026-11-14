import type { ApiModel } from '@/lib/api-types'

/**
 * A server as the signed-in person sees it (GET /servers, D-115): the channels
 * they may see, each with what they may do there, worked out by the backend
 * (D-145). Permission bits come as decimal strings: read them with `can`.
 */
export type Server = ApiModel<'ServerResponseDto'>

/** Only channels they can see; group them by `categoryId` (null: above the first category). */
export type ServerChannel = ApiModel<'ServerChannelResponseDto'>

export type ServerCategory = ApiModel<'ServerCategoryResponseDto'>

export type CreateServerRequest = ApiModel<'CreateServerRequestDto'>

export type ServerTemplate = CreateServerRequest['template']

/** A role of the server but @everyone, highest first (the private-channel picker). */
export type ServerRole = ApiModel<'ServerRoleResponseDto'>

export type CreateChannelRequest = ApiModel<'CreateChannelRequestDto'>

export type UpdateChannelRequest = ApiModel<'UpdateChannelRequestDto'>

export type UpdateServerRequest = ApiModel<'UpdateServerRequestDto'>

/** One drop in the channel list (D-149): right after `afterId`, first when null. */
export type LayoutMove =
    | { kind: 'channel'; id: string; categoryId: string | null; afterId: string | null }
    | { kind: 'category'; id: string; afterId: string | null }

/** A link to send (S-SRV-02); the link is /invite/{code}. */
export type Invite = ApiModel<'InviteResponseDto'>

/** Lifetime (seconds, null: never) and uses (null: no limit) of a new link. */
export type InviteSettings = ApiModel<'CreateInviteRequestDto'>

/** A row of the invites page (S-SET-04), with who made it. */
export type InviteListItem = ApiModel<'InviteListItemResponseDto'>

/** The invite page (S-SRV-03): the server, who invites, and the `?channel=` target someone joining sees. */
export type InvitePreview = ApiModel<'InvitePreviewResponseDto'>

/** A role on the Roles page (S-SET-02), @everyone included, with how many hold it. */
export type Role = ApiModel<'RoleResponseDto'>

/** A role one may mention after @, with how many hold it (D-171). */
export type MentionableRole = ApiModel<'MentionableRoleResponseDto'>

/** A member as the server's lists show them (D-152). */
export type ServerMember = ApiModel<'MemberResponseDto'>

/** One page of members, with how many match in all. */
export type MemberPage = ApiModel<'MemberPageResponseDto'>

/** What "Edit role" changes; bits as a decimal string. */
export type UpdateRoleRequest = ApiModel<'UpdateRoleRequestDto'>

/** A row of the ban list (S-SET-04 `bans`); names are null once an account is deleted. */
export type BanItem = ApiModel<'BanResponseDto'>

/** One page of bans, newest first. */
export type BanPage = ApiModel<'BanPageResponseDto'>
