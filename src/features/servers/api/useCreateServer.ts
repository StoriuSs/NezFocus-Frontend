import { useQueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { createServer } from './servers.api'
import { rememberServer } from './useServers'
import type { CreateServerRequest } from '../types'

/**
 * Create a server (S-SRV-01). Sent with an Idempotency-Key: a double click or
 * a retry after a lost answer makes one server. Errors are the dialog's to
 * show, under its fields, not a toast.
 */
export function useCreateServer() {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (body: CreateServerRequest, idempotencyKey) => createServer(body, idempotencyKey),
        onSuccess: (server) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}
