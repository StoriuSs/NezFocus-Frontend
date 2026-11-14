import { folded } from '@/lib/utils'
import { MENTION_TOKEN, parseMessage, type Inline, type MentionPart } from './markdown'
import type { MentionChannel, MentionedRole, MentionedUser, Message } from '../types'

/** The mentions written in a message where they count: never in code or a link (D-172). */
export interface FoundMentions {
    /** Each once, in the order first written. */
    userIds: string[]
    roleIds: string[]
    channelIds: string[]
    everyone: boolean
}

/** The backend's `findMentions` (`mention.rules.ts`), read from the parts the message is drawn with. */
export function findMentions(content: string): FoundMentions {
    const found = { user: new Set<string>(), role: new Set<string>(), channel: new Set<string>() }
    let everyone = false
    const walk = (parts: Inline[]) => {
        for (const part of parts) {
            if (part.type === 'mention') found[part.kind].add(part.id)
            else if (part.type === 'everyone') everyone = true
            else if ('children' in part) walk(part.children)
        }
    }
    for (const block of parseMessage(content)) if (block.type !== 'codeBlock') walk(block.children)
    return {
        userIds: [...found.user],
        roleIds: [...found.role],
        channelIds: [...found.channel],
        everyone
    }
}

/** Who reads the chat, as `isRelated` needs them: their roles in the server. */
export interface Reader {
    id: string | undefined
    roleIds: readonly string[]
}

/**
 * Is the message about the one reading it (C-10 `related`, D-39): it mentions
 * them, a role they hold or @everyone in effect, or answers one of their
 * messages. One's own message never is (D-172). A reply to a message deleted
 * since is not shown as one: the line no longer says whose it was, though
 * the backend still counts it for its author.
 */
export function isRelated(message: Message, { id, roleIds }: Reader): boolean {
    if (!id || message.type !== 'regular' || message.author?.id === id) return false
    return (
        message.mentionEveryone ||
        message.mentionUsers.some((user) => user.id === id) ||
        message.mentionRoles.some((role) => roleIds.includes(role.id)) ||
        (message.replyTo !== null && !message.replyTo.deleted && message.replyTo.author?.id === id)
    )
}

/** The names a message's tokens read with: those it carries (D-171), and the channels one sees. */
export interface MentionNames {
    users: readonly MentionedUser[]
    roles: readonly MentionedRole[]
    channel: (id: string) => MentionChannel
}

/** What a mention reads as when it names no one (owner, 14/11/2026), in the reader's language. */
export interface MentionWords {
    deletedAccount: string
    unknownUser: string
    unknownRole: string
    hiddenChannel: string
}

/**
 * How a mention reads: "@Bình" (else the username; "@Deleted account" once
 * deleted), "@Trưởng nhóm", "#hoi-dap", "@everyone". A role deleted or of
 * another server, an id of no account: "@unknown role" / "@unknown user";
 * a channel one cannot see: "#can't view".
 */
export function mentionName(part: MentionPart, names: MentionNames, words: MentionWords): string {
    if (part.type === 'everyone') return '@everyone'
    switch (part.kind) {
        case 'user': {
            const user = names.users.find((candidate) => candidate.id === part.id)
            if (!user) return words.unknownUser
            return `@${user.displayName ?? user.username ?? words.deletedAccount}`
        }
        case 'role': {
            const role = names.roles.find((candidate) => candidate.id === part.id)
            return role ? `@${role.name}` : words.unknownRole
        }
        case 'channel': {
            const channel = names.channel(part.id)
            return channel.kind === 'channel' ? `#${channel.name}` : words.hiddenChannel
        }
    }
}

const partOf = (kind: string, id: string): MentionPart => ({
    type: 'mention',
    kind: kind === '@' ? 'user' : kind === '@&' ? 'role' : 'channel',
    id
})

/**
 * The message as "Copy text" gives it (owner, 14/11/2026): each token as its
 * name, the formatting's markers kept as they were typed.
 */
export const readableText = (content: string, names: MentionNames, words: MentionWords): string =>
    content.replace(MENTION_TOKEN, (_, kind: string, id: string) => mentionName(partOf(kind, id), names, words))

/**
 * The names the box shows while a message is edited: each token that names
 * someone or a channel one sees; the others stay as written.
 */
export function composerNames(content: string, names: MentionNames, words: MentionWords): Record<string, string> {
    const shown: Record<string, string> = {}
    for (const [token, kind, id] of content.matchAll(MENTION_TOKEN)) {
        const part = partOf(kind!, id!) as Extract<MentionPart, { type: 'mention' }>
        const known =
            part.kind === 'user'
                ? names.users.some((user) => user.id === id)
                : part.kind === 'role'
                  ? names.roles.some((role) => role.id === id)
                  : names.channel(id!).kind === 'channel'
        if (known) shown[token] = mentionName(part, names, words)
    }
    return shown
}

/**
 * Does a suggestion match what follows the @ or # (C-12 › MentionSuggest):
 * the start of its name, or of a word of it (words split at spaces, `.`, `-`
 * and `_`, as in usernames and channel names), without accents or case.
 */
export function startsAWord(name: string, query: string): boolean {
    const typed = folded(query)
    const whole = folded(name)
    return whole.startsWith(typed) || whole.split(/[\s._-]+/).some((word) => word.startsWith(typed))
}
