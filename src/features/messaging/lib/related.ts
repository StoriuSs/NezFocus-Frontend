import type { BareMessage } from '../types'

/** Who reads the chat, as `isRelated` needs them: their roles in the server. */
export interface Reader {
    id: string | undefined
    roleIds: readonly string[]
}

/**
 * Is the message about the one reading it (C-10 `related`, D-39): it mentions
 * them, a role they hold, @everyone in effect or an @here that reached them
 * (D-166), or answers one of their
 * messages. One's own message never is (D-172). A reply to a message deleted
 * since is not shown as one: the line no longer says whose it was, though
 * the backend still counts it for its author.
 */
export function isRelated(message: BareMessage, { id, roleIds }: Reader): boolean {
    if (!id || message.type !== 'regular' || message.author?.id === id) return false
    return (
        message.mentionEveryone ||
        message.mentionHereUserIds.includes(id) ||
        message.mentionUsers.some((user) => user.id === id) ||
        message.mentionRoles.some((role) => roleIds.includes(role.id)) ||
        (message.replyTo !== null && !message.replyTo.deleted && message.replyTo.author?.id === id)
    )
}
