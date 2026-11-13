import { isOutgoing, type ChatMessage } from '../types'
import { dayKey } from './message-time'

/** Within this long of the first message of its group, a message joins it (C-10 › Luật). */
const GROUP_MS = 5 * 60 * 1000

/** One row of the message list: a date line, or a message, grouped under the one before or not. */
export type ChatRow =
    | { kind: 'date'; key: string; day: string; at: Date }
    | { kind: 'message'; key: string; message: ChatMessage; grouped: boolean }

export const messageKey = (message: ChatMessage) => (isOutgoing(message) ? `nonce:${message.nonce}` : message.id)

/**
 * The list's rows, oldest first (C-10 › Luật):
 * - each day opens with its date line, in the account's time zone;
 * - one person's messages group (no avatar, no name) within 5 minutes of
 *   the group's **first** message, so the time at its head is never more
 *   than 5 minutes off any message in it; someone else, a date line or a
 *   system message ends the group.
 */
export function chatRows(messages: ChatMessage[], timeZone?: string): ChatRow[] {
    const rows: ChatRow[] = []
    let day: string | undefined
    let head: { authorId: string; at: number } | undefined

    for (const message of messages) {
        const at = new Date(message.createdAt)
        const key = dayKey(at, timeZone)
        if (key !== day) {
            rows.push({ kind: 'date', key: `day:${key}`, day: key, at })
            day = key
            head = undefined
        }

        const authorId = message.author?.id
        const regular = isOutgoing(message) || message.type === 'regular'
        const grouped = regular && !!head && head.authorId === authorId && at.getTime() - head.at <= GROUP_MS
        if (!regular || !authorId) head = undefined
        else if (!grouped) head = { authorId, at: at.getTime() }

        rows.push({ kind: 'message', key: messageKey(message), message, grouped })
    }
    return rows
}
