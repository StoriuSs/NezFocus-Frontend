import { isOutgoing, type ChannelMessages, type ChatMessage, type Message } from '../types'
import { isFromReader } from './read-state-cache'

const saved = (messages: readonly ChatMessage[]): Message[] =>
    messages.filter((message): message is Message => !isOutgoing(message))

/**
 * The first message after the mark that makes the channel unread (not from
 * the reader, D-173): where "New" goes (C-10).
 */
export function firstUnread(
    messages: readonly ChatMessage[],
    mark: string,
    me: string | undefined
): Message | undefined {
    return saved(messages).find((message) => message.id > mark && !(me && isFromReader(message, me)))
}

/** How many messages from others the history holds from `fromId` on: the new messages bar's count. */
export function unreadFrom(messages: readonly ChatMessage[], fromId: string, me: string | undefined): number {
    return saved(messages).filter((message) => message.id >= fromId && !(me && isFromReader(message, me))).length
}

/** How many messages from others the history holds after the mark: unread, wherever they are in the list. */
export function unreadAfter(messages: readonly ChatMessage[], mark: string, me: string | undefined): number {
    return saved(messages).filter((message) => message.id > mark && !(me && isFromReader(message, me))).length
}

/** The first saved message at or after `id`: where "New" stands once its own message is deleted (C-10). */
export function firstFrom(messages: readonly ChatMessage[], id: string): Message | undefined {
    return saved(messages).find((message) => message.id >= id)
}

/** The newest saved message the history holds (messages on their way are always after it). */
export function newestSaved(messages: readonly ChatMessage[]): Message | undefined {
    return saved(messages).at(-1)
}

/**
 * Whether the history reaches back to the mark: its oldest message is at or
 * before it, or nothing is older. Only then is the first message it holds
 * after the mark really the first unread one.
 */
export function reachesBackTo(history: ChannelMessages, mark: string): boolean {
    const first = history.pages[0]
    const oldest = first?.items[0]
    return !first?.hasMoreBefore || (!!oldest && oldest.id <= mark)
}
