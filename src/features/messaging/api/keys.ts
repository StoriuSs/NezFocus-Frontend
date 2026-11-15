/** Query keys of the messaging feature. */
export const messageKeys = {
    all: ['messages'] as const,
    /** One channel's history, every page loaded so far, and the messages on their way. */
    channel: (channelId: string) => [...messageKeys.all, 'channel', channelId] as const,
    /** One channel's pinned messages, the latest pinned first (S-CHAT-02). */
    pins: (channelId: string) => [...messageKeys.all, 'pins', channelId] as const,
    /** The first people to give one emoji to one message (the chip's Tooltip). */
    reactors: (messageId: string, emoji: string) => [...messageKeys.all, 'reactors', messageId, emoji] as const,
    /** How far the reader has read every text channel they may view (REQ-MSG-09), kept live by the socket. */
    readStates: () => [...messageKeys.all, 'read-states'] as const,
    /** New read links of one file, asked for when the ones held ended (they last an hour). */
    attachmentLinks: (attachmentId: string) => [...messageKeys.all, 'attachment-links', attachmentId] as const,
    /** The links a PDF in the viewer was opened with, kept while it is open (C-42). */
    attachmentFrame: (attachmentId: string) => [...messageKeys.all, 'attachment-frame', attachmentId] as const,
    /** The emoji picker's emoji in one language, read once (C-12). */
    emoji: (language: string) => [...messageKeys.all, 'emoji', language] as const
}
