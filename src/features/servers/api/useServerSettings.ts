import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { removeServerIcon, updateServer, uploadServerIcon } from './servers.api'
import { serverKeys } from './keys'
import { rememberServer } from './useServers'
import type { Server, UpdateServerRequest } from '../types'

/** Put a field of one server in the cached list (the rail and Overview read it). */
export function patchServer(queryClient: QueryClient, serverId: string, change: Partial<Server>) {
    queryClient.setQueryData<Server[]>(serverKeys.list(), (servers) =>
        servers?.map((server) => (server.id === serverId ? { ...server, ...change } : server))
    )
}

/**
 * A new server picture, cropped (S-SET-01, MANAGE_SERVER). Sent with an
 * Idempotency-Key, so "Use picture" twice stores one. A refusal is toasted
 * by the query client and the crop dialog stays to try again.
 */
export function useUploadServerIcon(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (icon: Blob, idempotencyKey) => uploadServerIcon(serverId, icon, idempotencyKey),
        onSuccess: (iconUrl) => patchServer(queryClient, serverId, { iconUrl })
    })
}

/** Back to the initials, at once and without asking (S-SET-01 › Tương tác). */
export function useRemoveServerIcon(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => removeServerIcon(serverId),
        onSuccess: () => patchServer(queryClient, serverId, { iconUrl: null })
    })
}

/**
 * Name or welcome channel (PATCH /servers/{id}). The answer is the server as
 * the list shows it, swapped in whole. Errors are the caller's to show: under
 * the name field, or as "Could not save" with "Try again".
 */
export function useUpdateServer(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (body: UpdateServerRequest) => updateServer(serverId, body),
        onSuccess: (server) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}
