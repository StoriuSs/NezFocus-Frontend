import type { AppLink, MentionChannel } from '@/features/messaging'

/**
 * How a DM's chat reads what points into the servers (D-249 L7-b): a link in
 * a message (a chip "Server › #channel › Message", always with the server's
 * name, as there is no server open; C-10, D-117) and a channel token `<#id>`.
 * The servers feature answers with a hook (`useChatLinks`), the same object
 * while the servers' names and channels stay the same; the social feature
 * cannot import it (servers will import social, M6 L8), so the AppShell
 * connects the two, as it does `ServerOwnership` and `BlockList`.
 *
 * `server`: a server of the profile panel's "SERVER CHUNG" (C-50, D-251),
 * its name and picture as my list has them (the profile's name while it
 * has not come yet), and where it opens (its nearest channel, as the rail).
 */
export interface ChatLinks {
    readLink: (href: string) => AppLink | null
    channel: (id: string) => MentionChannel
    server: (id: string, name: string) => SharedServer
}

/** A server we share, as the profile panel draws it (C-50). */
export interface SharedServer {
    name: string
    iconUrl: string | null
    /** Its initials, for a server with no picture (C-05). */
    initials: string
    path: string
}

let connected: (() => ChatLinks) | null = null

export function connectChatLinks(hook: () => ChatLinks): void {
    connected = hook
}

/**
 * The connected answer, read on each render as any hook (the one connected
 * never changes: connected once, before the app draws).
 */
export function useConnectedChatLinks(): ChatLinks {
    if (!connected) throw new Error('ChatLinks is not connected: the AppShell connects it.')
    return connected()
}
