import type { ChatPermissions } from '@/features/messaging'
import type { Server, ServerChannel } from '../types'
import { isTimedOut } from './moderation'
import { can } from './permissions'

/**
 * What one may do with messages in a channel (REQ-MSG-05, SRS 1.70), for the
 * chat, which reads no permission bits itself. A timeout leaves only
 * VIEW_CHANNEL (appendix B, step 6), so it already takes SEND_MESSAGES and
 * MANAGE_MESSAGES away; only deleting one's own message also needs to know
 * of it.
 */
export function chatPermissions(
    server: Pick<Server, 'timeoutUntil'>,
    channel: Pick<ServerChannel, 'permissions'>,
    now: Date
): ChatPermissions {
    const manage = can(channel.permissions, 'MANAGE_MESSAGES')
    return { send: can(channel.permissions, 'SEND_MESSAGES'), manage, deleteOwn: manage || !isTimedOut(server, now) }
}
