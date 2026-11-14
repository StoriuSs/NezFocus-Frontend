import type { ChatPermissions, Message } from '../types'

/** What this person may do to this saved message: the rows of its menu (C-11, S-CHAT-03; SRS 1.70, 1.71). */
export interface AllowedActions {
    own: boolean
    /** Their own message, while they may post. */
    edit: boolean
    /** Anyone who may post. */
    reply: boolean
    /** Anyone's with MANAGE_MESSAGES; their own unless timed out. */
    delete: boolean
    /** "Add reaction" (a new emoji): ADD_REACTIONS (C-11). */
    react: boolean
    /** MANAGE_MESSAGES, while it is not pinned (REQ-MSG-07). */
    pin: boolean
    /** MANAGE_MESSAGES, once it is pinned. */
    unpin: boolean
}

export function allowedActions(me: string | undefined, permissions: ChatPermissions, message: Message): AllowedActions {
    const own = !!me && message.type === 'regular' && message.author?.id === me
    return {
        own,
        edit: own && permissions.send,
        reply: permissions.send,
        delete: permissions.manage || (own && permissions.deleteOwn),
        react: permissions.addReactions,
        pin: permissions.manage && !message.pinned,
        unpin: permissions.manage && message.pinned
    }
}
