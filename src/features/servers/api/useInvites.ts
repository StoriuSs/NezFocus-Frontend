import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
import { acceptInvite, createInvite, fetchInvitePreview, fetchInvites, revokeInvite } from './invites.api'
import { serverKeys } from './keys'
import { rememberServer } from './useServers'
import type { InviteListItem, InviteSettings } from '../types'

/**
 * A link to hand out (S-SRV-02); the Invites page fetches its list again.
 * Errors are the dialog's to show, in place of the link.
 */
export function useCreateInvite(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (settings: InviteSettings, idempotencyKey) => createInvite(serverId, settings, idempotencyKey),
        // Not awaited: the link shows at once, the list catches up.
        onSuccess: () => void queryClient.invalidateQueries({ queryKey: serverKeys.invites(serverId) }),
        meta: { errorToast: false }
    })
}

/**
 * The invite page (S-SRV-03). Not retried: a 410 or a 429 is an answer, and
 * a retry would only count another wrong code against the network.
 */
export function useInvitePreview(code: string | null, channel: string | null) {
    return useQuery({
        queryKey: [...serverKeys.invite(code ?? ''), channel],
        queryFn: () => fetchInvitePreview(code!, channel),
        enabled: code !== null,
        retry: false,
        staleTime: 30_000,
        meta: { errorToast: false }
    })
}

/** Join; the server goes to the end of the rail (C-05), or is updated in place for a member. */
export function useAcceptInvite() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (code: string) => acceptInvite(code),
        onSuccess: ({ server }) => rememberServer(queryClient, server),
        meta: { errorToast: false }
    })
}

/** The links of a server that still open (S-SET-04). */
export function useServerInvites(serverId: string) {
    return useQuery({ queryKey: serverKeys.invites(serverId), queryFn: () => fetchInvites(serverId) })
}

/**
 * Revoke a link, from the invite panel or the Invites page; the row leaves
 * the page at once, and so does one that had already run out (INVITE_INVALID).
 */
export function useRevokeInvite(serverId: string) {
    const queryClient = useQueryClient()
    const drop = (code: string) =>
        queryClient.setQueryData<InviteListItem[]>(serverKeys.invites(serverId), (invites) =>
            invites?.filter((invite) => invite.code !== code)
        )
    return useMutation({
        mutationFn: (code: string) => revokeInvite(code),
        onSuccess: (_, code) => drop(code),
        onError: (error, code) => {
            if (getApiErrorType(error) === 'INVITE_INVALID') drop(code)
        },
        meta: { errorToast: false }
    })
}
