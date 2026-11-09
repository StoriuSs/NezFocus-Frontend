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
