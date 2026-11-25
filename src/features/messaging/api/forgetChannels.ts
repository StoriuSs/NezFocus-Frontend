import type { QueryClient } from '@tanstack/react-query'
import { userKeys, type UserProfile } from '@/features/users'
import { forgetPlaces } from '@/lib/gone-places'
import { forgetDrafts } from '../lib/drafts'
import type { ChannelMessages, ReadState } from '../types'
import { messageKeys } from './keys'

/**
 * Lets go of what was read of channels one may no longer see: deleted, made
 * private to others, or of a server one left or was removed from (D-178).
 * Their histories and pins go; the files of their tray and the messages on
 * their way stop with the history (`sendAlong` hears it removed), as nothing
 * could be sent there any more (S-CHAT-04 › Edge case), and what was typed
 * in them goes too (11 S-MOD-02). Requests about them, or about a message
 * read in them, that fail after this say nothing (gone-places).
 */
export function forgetChannels(client: QueryClient, channelIds: string[]): void {
    if (channelIds.length === 0) return
    forgetDrafts(client.getQueryData<UserProfile>(userKeys.profile())?.id, channelIds)
    for (const channelId of channelIds) {
        const messageIds =
            client
                .getQueryData<ChannelMessages>(messageKeys.channel(channelId))
                ?.pages.flatMap((page) => page.items.map((message) => message.id)) ?? []
        // The messages go and come back with their channel.
        forgetPlaces([channelId, ...messageIds], channelId)
        client.removeQueries({ queryKey: messageKeys.channel(channelId) })
        client.removeQueries({ queryKey: messageKeys.pins(channelId) })
    }
}

/**
 * A DM closed on one's side (D-244): its state leaves the list, as the
 * backend's does, so its next message reads the list again (the DM is back
 * in it then, with its unread count). Its history and draft stay.
 */
export function forgetReadState(client: QueryClient, channelId: string): void {
    client.setQueryData<ReadState[]>(messageKeys.readStates(), (states) =>
        states?.filter((state) => state.channelId !== channelId)
    )
}

/** The read states read again: a DM's close that failed puts its state back (D-244). */
export function readStatesAgain(client: QueryClient): void {
    void client.invalidateQueries({ queryKey: messageKeys.readStates() })
}
