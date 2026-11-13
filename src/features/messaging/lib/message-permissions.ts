import type { ChatPermissions, Message } from '../types'

/** What this person may do to this saved message: the rows of its menu (C-11, S-CHAT-03; SRS 1.70). */
export interface AllowedActions {
    own: boolean
    /** Their own message, while they may post. */
    edit: boolean
    /** Anyone who may post. */
    reply: boolean
    /** Anyone's with MANAGE_MESSAGES; their own unless timed out. */
    delete: boolean
}

export function allowedActions(me: string | undefined, permissions: ChatPermissions, message: Message): AllowedActions {
    const own = !!me && message.type === 'regular' && message.author?.id === me
    return {
        own,
        edit: own && permissions.send,
        reply: permissions.send,
        delete: permissions.manage || (own && permissions.deleteOwn)
    }
}
