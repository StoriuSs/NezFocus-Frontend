import { useQuery } from '@tanstack/react-query'
import { messageKeys } from './keys'
import { fetchPins } from './pins.api'

/** A channel's pinned messages, the latest pinned first (S-CHAT-02), kept live by `liveMessages`. */
export function usePins(channelId: string) {
    return useQuery({ queryKey: messageKeys.pins(channelId), queryFn: () => fetchPins(channelId) })
}
