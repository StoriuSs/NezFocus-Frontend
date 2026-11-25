import { isTimedOut, rowActions } from './moderation'
import type { Server, ServerMember } from '../types'

/*
 * What the profile popover (02 S-CHAT-05, D-252, D-253) offers beyond the
 * Members page's own rules (`heldRoles`, `tableDate` of moderation.ts).
 * Drawn by `components/profile/ProfileCard.tsx`.
 */

/** How many servers we share the popover names (09 `profile-popover`): the rest is "+N more". */
export const SHARED_SHOWN = 3

export function sharedServers<T>(servers: readonly T[]): { shown: T[]; more: number } {
    return { shown: servers.slice(0, SHARED_SHOWN), more: Math.max(0, servers.length - SHARED_SHOWN) }
}

/** A moderator's item in the popover's ⋯; `changeTimeout` is "Tạm khóa" while one runs. */
export type ProfileModeration = 'timeout' | 'changeTimeout' | 'endTimeout' | 'kick' | 'ban'

/**
 * The moderator's items of the popover's ⋯ (D-253): the Members page's row
 * menu (04 S-SET-03, `rowActions`: each by its permission, only on someone
 * ranked below), without "Transfer ownership", which stays in the server's
 * settings. Empty for anyone else, and on oneself.
 */
export function profileModeration(
    server: Pick<Server, 'isOwner' | 'topRolePosition' | 'permissions' | 'roles'>,
    member: ServerMember,
    now: Date
): ProfileModeration[] {
    const actions = rowActions(server, member, now)
    const items: ProfileModeration[] = []
    if (actions.timeout) items.push(isTimedOut(member, now) ? 'changeTimeout' : 'timeout')
    if (actions.endTimeout) items.push('endTimeout')
    if (actions.kick) items.push('kick')
    if (actions.ban) items.push('ban')
    return items
}
