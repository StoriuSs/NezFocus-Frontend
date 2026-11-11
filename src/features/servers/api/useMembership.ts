import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getApiErrorType } from '@/lib/api-error'
import { refusedRule } from '../lib/layout-error'
import { transferRefusal } from '../lib/membership'
import { deleteServer, fetchServers, leaveServer, transferOwnership } from './servers.api'
import { serverKeys } from './keys'
import { forgetServer } from './useServers'
import type { Server } from '../types'

// None of these routes is `@Idempotent`. Sent again after a lost answer,
// leaving or deleting answers NOT_FOUND_ERROR: one is out of it either way,
// so that counts as done. A handover sent again is refused for not being the
// owner any more. Other errors are the dialogs' to show.

/** Done, or "not found": out of it already (left, or deleted, before). */
async function outOfIt(request: Promise<void>): Promise<void> {
    try {
        await request
    } catch (error) {
        if (getApiErrorType(error) !== 'NOT_FOUND_ERROR') throw error
    }
}

/**
 * "Leave server" (03 S-SRV-04). `moveAway` runs once it is done, and the
 * server leaves the cache once the page has moved on (Q7): the other way
 * round, the page on it falls back to /study first.
 */
export function useLeaveServer(serverId: string, moveAway: () => Promise<void>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => outOfIt(leaveServer(serverId)),
        onSuccess: async () => {
            await moveAway()
            forgetServer(queryClient, serverId)
        },
        meta: { errorToast: false }
    })
}

/**
 * "Delete server" (04 S-SET-07 `delete-type-name`): the name typed again.
 * `moveAway` as when leaving. Refused for a name that no longer matches (it
 * was renamed meanwhile), the list is read again, so the dialog asks for the
 * new one.
 */
export function useDeleteServer(serverId: string, moveAway: () => Promise<void>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (name: string) => outOfIt(deleteServer(serverId, name)),
        onSuccess: async () => {
            await moveAway()
            forgetServer(queryClient, serverId)
        },
        onError: (error) => {
            if (refusedRule(error) === 'name_mismatch') {
                void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
            }
        },
        meta: { errorToast: false }
    })
}

/**
 * Handing the server over (04 S-SET-07). What they may do changes with it, so
 * the list is read again; `moveAway` gets it before the cache does, so a
 * settings page they may no longer open moves on to one they may, without
 * "You no longer have access" (`transferred`). Refused because of the one
 * chosen (left, timed out, waiting to be deleted), the members are read again.
 */
export function useTransferOwnership(serverId: string, moveAway: (servers: Server[]) => Promise<void>) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, password }: { userId: string; password: string }) =>
            transferOwnership(serverId, userId, password),
        onSuccess: async () => {
            void queryClient.invalidateQueries({ queryKey: serverKeys.members(serverId) })
            let servers: Server[]
            try {
                servers = await fetchServers()
            } catch {
                // Handed over all the same: no longer the owner here (a leave
                // that follows asks as a member), and the rest is read again.
                queryClient.setQueryData<Server[]>(serverKeys.list(), (known) =>
                    known?.map((server) => (server.id === serverId ? { ...server, isOwner: false } : server))
                )
                void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
                return
            }
            await moveAway(servers)
            queryClient.setQueryData(serverKeys.list(), servers)
        },
        onError: (error) => {
            if (transferRefusal(error)) void queryClient.invalidateQueries({ queryKey: serverKeys.members(serverId) })
        },
        meta: { errorToast: false }
    })
}
