import { useQuery } from '@tanstack/react-query'
import { messageKeys } from './keys'
import { fetchReactors } from './reactions.api'

/**
 * Who gave one emoji to one message (SRS 1.71), asked while its chip's
 * Tooltip is open and read again each time it opens: the count on the chip
 * stays the one the list holds until the names come.
 */
export function useReactors(messageId: string, emoji: string, open: boolean) {
    return useQuery({
        queryKey: messageKeys.reactors(messageId, emoji),
        queryFn: () => fetchReactors(messageId, emoji),
        enabled: open,
        staleTime: 0
    })
}
