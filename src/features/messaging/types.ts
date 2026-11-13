import type { InfiniteData } from '@tanstack/react-query'
import type { ApiModel } from '@/lib/api-types'

/** A saved message, as history pages, the send route and `message.created` give it. */
export type Message = ApiModel<'MessageResponseDto'>
export type MessageAuthor = ApiModel<'MessageAuthorResponseDto'>
/** A page of history, oldest first. */
export type MessagePage = ApiModel<'MessagePageResponseDto'>

/** Where a history page starts: the newest messages when null (SRS 5.1). */
export type MessageCursor = { before: string } | { after: string } | { around: string } | null

/**
 * Where a message not saved yet is (C-10 `sending`, `failed`, `rate-limited`;
 * S-CHAT-01 "Sẽ gửi khi có mạng"):
 * - `sending`: on its way;
 * - `queued`: behind an earlier one still on its way, sent once that is saved
 *   (messages keep the order they were typed in); shown as `sending`, or as
 *   `waiting` while the browser is offline;
 * - `waiting`: no network; sent again when the browser is back online;
 * - `rate-limited`: sent too fast; sent again by itself at `retryAt`;
 * - `failed`: refused or lost; "Try again" or "Discard".
 */
export type OutgoingState = 'sending' | 'queued' | 'waiting' | 'rate-limited' | 'failed'

/** A message typed here and not saved yet, kept with the channel's history until it is. */
export interface OutgoingMessage {
    /** Chosen here, kept across retries: the saved message comes back with it (REQ-MSG-10). */
    nonce: string
    channelId: string
    content: string
    author: MessageAuthor
    /** When it was typed, ISO: where it shows until saved. */
    createdAt: string
    state: OutgoingState
    /** `rate-limited`: when it goes again (ms since epoch). */
    retryAt?: number
}

/** A page as kept in the cache: the last one also holds the messages not saved yet. */
export interface CachedPage extends MessagePage {
    outgoing?: OutgoingMessage[]
}

/** A channel's history in the cache: pages oldest first, each oldest message first. */
export type ChannelMessages = InfiniteData<CachedPage, MessageCursor>

/** What the list draws: a saved message or one on its way. */
export type ChatMessage = Message | OutgoingMessage

export const isOutgoing = (message: ChatMessage): message is OutgoingMessage => 'state' in message
