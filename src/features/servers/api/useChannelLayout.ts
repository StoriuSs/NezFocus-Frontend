import { useQueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { createCategory, createChannel } from './layout.api'
import { rememberServer } from './useServers'
import type { CreateChannelRequest } from '../types'

/**
 * A category at the end of the list (S-SRV-05 `category`). One key per name
 * typed: "Create" again after a lost answer is recognised, not made twice.
 * Errors are the dialog's to show.
 */
export function useCreateCategory(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (name: string, idempotencyKey) => createCategory(serverId, name, idempotencyKey),
        onSuccess: ({ server }) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}

/** A channel at the end of its group (S-SRV-05), one key per channel as filled in. */
export function useCreateChannel(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (body: CreateChannelRequest, idempotencyKey) => createChannel(serverId, body, idempotencyKey),
        onSuccess: ({ server }) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}
