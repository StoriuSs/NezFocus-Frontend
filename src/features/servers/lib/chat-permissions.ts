import type { ChatPermissions, SendBlock } from '@/features/messaging'
import type { Server, ServerChannel } from '../types'
import { isTimedOut } from './moderation'
import { can } from './permissions'

/**
 * What one may do with messages in a channel (REQ-MSG-05, SRS 1.70), for the
 * chat, which reads no permission bits itself. A timeout leaves only
 * VIEW_CHANNEL (appendix B, step 6), so it already takes SEND_MESSAGES,
 * ADD_REACTIONS and MANAGE_MESSAGES away; deleting one's own message and
 * clicking an emoji already on a message (SRS 1.71) also need to know of it.
 * MANAGE_MESSAGES also pins and unpins, in a text channel only: a voice
 * room’s chat has no pins (D-213).
 * MENTION_EVERYONE: @everyone and any role in the suggestions (REQ-MSG-03).
 * ATTACH_FILES with SEND_MESSAGES: files in the composer (REQ-MSG-04).
 * Without SEND_MESSAGES, why, as the composer says it (C-12 `disabled`): a
 * timeout first (the backend says so first too), then a channel only
 * moderators post in, else the server. A timeout the server was read with
 * says so even once past by this clock: the bits are still those of the
 * timeout until the server is read again (liveServers does at its end).
 */
export function chatPermissions(
    server: Pick<Server, 'timeoutUntil'>,
    channel: Pick<ServerChannel, 'permissions' | 'sendMode' | 'type'>,
    now: Date
): ChatPermissions {
    const manage = can(channel.permissions, 'MANAGE_MESSAGES')
    // Timed out still with MANAGE_MESSAGES: the owner or an ADMINISTRATOR, whom a timeout does not stop.
    const free = manage || !isTimedOut(server, now)
    const send = can(channel.permissions, 'SEND_MESSAGES')
    return {
        send,
        sendBlocked: send ? null : whyNot(server, channel),
        manage,
        pins: manage && channel.type === 'text',
        deleteOwn: free,
        react: free,
        addReactions: can(channel.permissions, 'ADD_REACTIONS'),
        mentionEveryone: can(channel.permissions, 'MENTION_EVERYONE'),
        // A timeout leaves only VIEW_CHANNEL, so it takes this away too.
        attachFiles: can(channel.permissions, 'SEND_MESSAGES') && can(channel.permissions, 'ATTACH_FILES')
    }
}

function whyNot(server: Pick<Server, 'timeoutUntil'>, channel: Pick<ServerChannel, 'sendMode'>): SendBlock {
    // The owner and ADMINISTRATOR keep SEND_MESSAGES through a timeout: never asked why.
    if (server.timeoutUntil) return { reason: 'timed-out', until: server.timeoutUntil }
    return channel.sendMode === 'managers' ? { reason: 'managers-only' } : { reason: 'no-permission' }
}
