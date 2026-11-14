import { useEffect } from 'react'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Presence } from '@/components/ui/presence-dot'
import { realtimeKeys } from '../keys'
import { onRealtimeEvent } from '../lib/realtime-events'

/**
 * What others see of the signed-in person now (REQ-AUTH-07), as the API
 * says it: from `ready` (written by the connection), then each
 * `presence.updated` about them (another tab choosing a status, every tab
 * gone unused). Server data, so in the query cache, never fetched on its
 * own (`skipToken`). Undefined until the socket first says it.
 */
export function useOwnPresence(userId: string | undefined): Presence | undefined {
    const queryClient = useQueryClient()
    useEffect(() => {
        if (!userId) return
        return onRealtimeEvent('presence.updated', (data) => {
            const { userId: who, status } = data as { userId: string; status: Presence }
            if (who === userId) queryClient.setQueryData(realtimeKeys.ownPresence(), status)
        })
    }, [queryClient, userId])
    return useQuery<Presence>({ queryKey: realtimeKeys.ownPresence(), queryFn: skipToken, staleTime: Infinity }).data
}
