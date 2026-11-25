import { isOutgoing, type ChatMessage } from '../types'
import { dayKey } from './message-time'

/** Within this long of the first message of its group, a message joins it (C-10 › Luật). */
const GROUP_MS = 5 * 60 * 1000

/**
 * One row of the message list: a date line; a message, grouped under the one
 * before or not (`hides`: the keys of the folded run it heads, shown, with
 * "Ẩn" on its time line); or a run of messages from people one blocked,
 * folded (C-10 `blocked`), with the keys of its messages.
 */
export type ChatRow =
    | { kind: 'date'; key: string; day: string; at: Date }
    | { kind: 'message'; key: string; message: ChatMessage; grouped: boolean; hides?: string[] }
    | { kind: 'blocked'; key: string; count: number; messageIds: string[] }

/**
 * Whose messages fold (people one blocked, D-250), and the messages shown
 * again ("Hiện"), by key: a run with any of them shows, so one that grows
 * (older messages loaded above it, a new one below) stays shown.
 */
export interface ChatFolds {
    blocked: ReadonlySet<string>
    shown: ReadonlySet<string>
}

export const messageKey = (message: ChatMessage) => (isOutgoing(message) ? `nonce:${message.nonce}` : message.id)

/** A saved regular message by someone one blocked: it folds. */
const folds = (message: ChatMessage, blocked: ReadonlySet<string> | undefined) =>
    !!blocked &&
    !isOutgoing(message) &&
    message.type === 'regular' &&
    !!message.author &&
    blocked.has(message.author.id)

/**
 * The list's rows, oldest first (C-10 › Luật):
 * - each day opens with its date line, in the account's time zone;
 * - one person's messages group (no avatar, no name) within 5 minutes of
 *   the group's **first** message, so the time at its head is never more
 *   than 5 minutes off any message in it; someone else, a date line or a
 *   system message ends the group;
 * - in a server's channel, messages in a row from people one blocked, within
 *   a day, fold into one row "N tin nhắn bị chặn · Hiện" (02 S-CHAT-01
 *   `blocked`, REQ-SOCIAL-03, D-250), keyed by its first message; a run shown
 *   again is drawn as any messages, its first one heading a group of its own.
 */
export function chatRows(messages: ChatMessage[], timeZone?: string, fold?: ChatFolds): ChatRow[] {
    const rows: ChatRow[] = []
    let day: string | undefined
    let head: { authorId: string; at: number } | undefined

    const push = (message: ChatMessage, at: Date, hides?: string[]) => {
        const authorId = message.author?.id
        const regular = isOutgoing(message) || message.type === 'regular'
        const grouped = !hides && regular && !!head && head.authorId === authorId && at.getTime() - head.at <= GROUP_MS
        if (!regular || !authorId) head = undefined
        else if (!grouped) head = { authorId, at: at.getTime() }
        rows.push({ kind: 'message', key: messageKey(message), message, grouped, ...(hides ? { hides } : {}) })
    }

    for (let index = 0; index < messages.length; index++) {
        const message = messages[index]!
        const at = new Date(message.createdAt)
        const key = dayKey(at, timeZone)
        if (key !== day) {
            rows.push({ kind: 'date', key: `day:${key}`, day: key, at })
            day = key
            head = undefined
        }

        if (!folds(message, fold?.blocked)) {
            push(message, at)
            continue
        }
        // The run: the next ones of people blocked, on the same day.
        let end = index + 1
        while (
            end < messages.length &&
            folds(messages[end]!, fold?.blocked) &&
            dayKey(new Date(messages[end]!.createdAt), timeZone) === key
        ) {
            end++
        }
        const run = messages.slice(index, end)
        const keys = run.map(messageKey)
        if (keys.some((key) => fold?.shown.has(key))) {
            run.forEach((one, place) => push(one, new Date(one.createdAt), place === 0 ? keys : undefined))
        } else {
            rows.push({ kind: 'blocked', key: `blocked:${keys[0]}`, count: run.length, messageIds: keys })
            head = undefined
        }
        index = end - 1
    }
    return rows
}
