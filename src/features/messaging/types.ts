import type { InfiniteData } from '@tanstack/react-query'
import type { ApiModel } from '@/lib/api-types'

/**
 * A saved message as the list holds it: with its reactions as this person
 * sees them (`me`), read with history pages and pins (SRS 1.71).
 */
export type Message = ApiModel<'ReadMessageResponseDto'>
/**
 * A saved message without its reactions, as the send and edit routes and the
 * `message.*` events give it: reactions depend on who reads, so they change
 * only by their own events (`reaction.added`, `reaction.removed`).
 */
export type BareMessage = ApiModel<'MessageResponseDto'>
export type MessageAuthor = ApiModel<'MessageAuthorResponseDto'>
/** One emoji on a message: how many gave it, and whether this person did (REQ-MSG-05). */
export type Reaction = ApiModel<'ReactionSummaryResponseDto'>
/** The first people to give an emoji, and how many did: the chip's Tooltip (SRS 1.71). */
export type Reactors = ApiModel<'ReactorsResponseDto'>
/** A message in the channel's pins, with when it was pinned (REQ-MSG-07). */
export type PinnedMessage = ApiModel<'PinnedMessageResponseDto'>
/** The message a reply answers, as its reply line shows it; only its id once deleted (REQ-MSG-05). */
export type RepliedMessage = ApiModel<'RepliedMessageResponseDto'>
/** A page of history, oldest first. */
export type MessagePage = ApiModel<'MessagePageResponseDto'>
/** A person a message's <@id> token names, as they are now; both names null once the account is deleted (D-171). */
export type MentionedUser = ApiModel<'MentionedUserResponseDto'>
/** A role a message mentions in effect, as named now (D-171). */
export type MentionedRole = ApiModel<'MentionedRoleResponseDto'>

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
    /** Its mentions as the composer named them, drawn until the saved one names them (REQ-MSG-03). */
    mentionUsers?: MentionedUser[]
    mentionRoles?: MentionedRole[]
    mentionEveryone?: boolean
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
    /** Not timed out: click an emoji already on a message, giving or taking back one's own (SRS 1.71). */
    react: boolean
    /** ADD_REACTIONS: give an emoji the message does not have yet. */
    addReactions: boolean
    /** MENTION_EVERYONE: @everyone, and any role (REQ-MSG-03). */
    mentionEveryone: boolean
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
    /** Focus goes to it too: opened from a place that left with the focus (the pins sheet). */
    focus?: boolean
}

/**
 * A <#id> token as the page that shows the chat reads it (the servers
 * feature knows the channels one sees): a chip "#name" leading to it, the
 * server named when it is another one; or "Can't view" (C-10).
 */
export type MentionChannel = { kind: 'channel'; to: string; name: string; server?: string } | { kind: 'hidden' }

/** A person to suggest after @ (C-12 › MentionSuggest). */
export interface MentionPerson {
    id: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
}

/** A role to suggest after @: one people may mention, or any for MENTION_EVERYONE (D-171). */
export interface MentionRole {
    id: string
    name: string
    memberCount: number
}

/** What a query of the servers feature is, as `useQuery` takes it: its key and cache stay theirs. */
export interface SourceQuery<T> {
    queryKey: readonly unknown[]
    queryFn: () => Promise<T>
    staleTime?: number
}

/**
 * What mentions need from the server the chat is in (REQ-MSG-03), handed by
 * the page that shows it, as `readLink` is (the servers feature; owner,
 * 14/11/2026): whom to suggest, how a channel token shows, and the roles one
 * holds there (a mention of them is one's own, C-10, D-39). Kept the same
 * from one render to the next while the server is.
 */
export interface MentionSource {
    /** The people of the server whose name or username holds what follows @. */
    members: (query: string) => SourceQuery<MentionPerson[]>
    roles: SourceQuery<MentionRole[]>
    /** The server's text channels one sees, in the list's order: suggested after #. */
    channels: ReadonlyArray<{ id: string; name: string }>
    channel: (id: string) => MentionChannel
    roleIds: readonly string[]
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
    /** A chip gives the emoji or takes one's own back (`toggle`); the picker only gives (`add`). */
    react: (message: Message, emoji: string, how?: 'toggle' | 'add') => void
    /** MANAGE_MESSAGES: into the channel's pins, or out of them (REQ-MSG-07). */
    pin: (message: Message) => void
    unpin: (message: Message) => void
    /** A message of this channel shown and lit up: the original of a reply, a pinned one (S-CHAT-01). */
    show: (messageId: string) => void
    /** How a link in a message shows: null for another site. */
    readLink: (href: string) => AppLink | null
    /** The server's side of mentions: how a channel token shows, one's own roles (REQ-MSG-03). */
    mentions: MentionSource
}
