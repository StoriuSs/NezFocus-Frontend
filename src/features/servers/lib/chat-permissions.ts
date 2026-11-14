import type { ChatPermissions } from '@/features/messaging'
import type { Server, ServerChannel } from '../types'
import { isTimedOut } from './moderation'
import { can } from './permissions'

/**
 * What one may do with messages in a channel (REQ-MSG-05, SRS 1.70), for the
 * chat, which reads no permission bits itself. A timeout leaves only
 * VIEW_CHANNEL (appendix B, step 6), so it already takes SEND_MESSAGES,
 * ADD_REACTIONS and MANAGE_MESSAGES away; deleting one's own message and
 * clicking an emoji already on a message (SRS 1.71) also need to know of it.
 * MENTION_EVERYONE: @everyone and any role in the suggestions (REQ-MSG-03).
 */
export function chatPermissions(
    server: Pick<Server, 'timeoutUntil'>,
    channel: Pick<ServerChannel, 'permissions'>,
    now: Date
): ChatPermissions {
    const manage = can(channel.permissions, 'MANAGE_MESSAGES')
    // Timed out still with MANAGE_MESSAGES: the owner or an ADMINISTRATOR, whom a timeout does not stop.
    const free = manage || !isTimedOut(server, now)
    return {
        send: can(channel.permissions, 'SEND_MESSAGES'),
        manage,
        deleteOwn: free,
        react: free,
        addReactions: can(channel.permissions, 'ADD_REACTIONS'),
        mentionEveryone: can(channel.permissions, 'MENTION_EVERYONE')
    }
}
