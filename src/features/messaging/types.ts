import type { InfiniteData } from '@tanstack/react-query'
import type { ApiModel } from '@/lib/api-types'

/** A saved message, as history pages, the send route and `message.created` give it. */
export type Message = ApiModel<'MessageResponseDto'>
export type MessageAuthor = ApiModel<'MessageAuthorResponseDto'>
/** The message a reply answers, as its reply line shows it; only its id once deleted (REQ-MSG-05). */
export type RepliedMessage = ApiModel<'RepliedMessageResponseDto'>
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
    /** The message it answers, quoted as the saved one will be. */
    replyTo?: RepliedMessage | null
}

/** A page as kept in the cache: the last one also holds the messages not saved yet. */
export interface CachedPage extends MessagePage {
    outgoing?: OutgoingMessage[]
}

/** A channel's history in the cache: pages oldest first, each oldest message first. */
export type ChannelMessages = InfiniteData<CachedPage, MessageCursor>

/** What the list draws: a saved message or one on its way. */
export type ChatMessage = Message | OutgoingMessage

/**
 * What the person may do with messages in the channel, read from the
 * channel's permissions by the page that shows the chat (the servers
 * feature: messaging does not read permission bits). The backend still
 * refuses on its own (REQ-MSG-05, SRS 1.70).
 */
export interface ChatPermissions {
    /** SEND_MESSAGES: reply, and edit one's own messages. */
    send: boolean
    /** MANAGE_MESSAGES: delete anyone's message. */
    manage: boolean
    /** Not timed out: delete one's own messages. */
    deleteOwn: boolean
}

/**
 * A link to a page of the app in a message, as the page that shows the chat
 * reads it (the servers feature knows its paths and what one sees; D-117):
 * - `message`: a message of a channel they see, a chip "#channel › Message"
 *   (`server` named when it is another server than the one open);
 * - `hidden`: a message they cannot see, a chip "Can't view" with no name;
 * - `page`: any other page of the app, a plain link opened in the app.
 * Another site is not one (null): it opens in a new tab.
 */
export type AppLink =
    | { kind: 'message'; to: string; server?: string; channel: string }
    | { kind: 'hidden' }
    | { kind: 'page'; to: string }

/**
 * The message the page was opened on (`/channels/{s}/{c}/{m}`, D-48): shown
 * and lit up for a moment. `key` changes each time the link is opened, so
 * the same link opened again lights it up again.
 */
export interface ChatTarget {
    messageId: string
    key: string
}

export const isOutgoing = (message: ChatMessage): message is OutgoingMessage => 'state' in message

/** What can be done to a saved message, handed down by the chat to its rows (stable, so rows do not draw again). */
export interface MessageHandlers {
    /** Whose messages are "one's own". */
    me: string | undefined
    permissions: ChatPermissions
    reply: (message: Message) => void
    edit: (message: Message) => void
    askDelete: (message: Message) => void
    copyText: (message: Message) => void
    copyLink: (message: Message) => void
    /** A message of this channel shown and lit up: the original of a reply (S-CHAT-01). */
    show: (messageId: string) => void
    /** How a link in a message shows: null for another site. */
    readLink: (href: string) => AppLink | null
}
