import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { generateIdempotencyKey } from '@/lib/idempotency'
import { createServer, uploadServerIcon } from './servers.api'
import { rememberServer } from './useServers'
import type { CreateServerRequest, Server } from '../types'

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

/**
 * Store the picture of a server just made (the second request, M1 plan ›
 * rules). A failure leaves the server without one: a toast says so and offers
 * to try again with the same picture, under the same Idempotency-Key, so a
 * first try that was stored after all is answered, not stored twice. The key
 * travels with the retry rather than in useIdempotentMutation because the
 * toast outlives the dialog (data-fetching.md › Mutations and idempotency;
 * CONSTRAINTS.md › Ngoại lệ E1).
 */
export async function saveNewServerIcon(
    queryClient: QueryClient,
    server: Server,
    icon: Blob,
    messages: { failed: string; retry: string },
    idempotencyKey = generateIdempotencyKey()
): Promise<void> {
    try {
        const iconUrl = await uploadServerIcon(server.id, icon, idempotencyKey)
        rememberServer(queryClient, { ...server, iconUrl })
    } catch {
        toast.error(messages.failed, {
            action: {
                label: messages.retry,
                onClick: () => void saveNewServerIcon(queryClient, server, icon, messages, idempotencyKey)
            }
        })
    }
}
