import type { QueryClient } from '@tanstack/react-query'
import { messageKeys } from './keys'

/**
 * Lets go of what was read of channels one may no longer see: deleted, made
 * private to others, or of a server one left or was removed from (D-178).
 * Their histories and pins go; the files of their tray and the messages on
 * their way stop with the history (`sendAlong` hears it removed), as nothing
 * could be sent there any more (S-CHAT-04 › Edge case).
 */
export function forgetChannels(client: QueryClient, channelIds: string[]): void {
    for (const channelId of channelIds) {
        client.removeQueries({ queryKey: messageKeys.channel(channelId) })
        client.removeQueries({ queryKey: messageKeys.pins(channelId) })
    }
}
