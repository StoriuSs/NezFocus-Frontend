/** Query keys of the messaging feature. */
export const messageKeys = {
    all: ['messages'] as const,
    /** One channel's history, every page loaded so far, and the messages on their way. */
    channel: (channelId: string) => [...messageKeys.all, 'channel', channelId] as const
}
