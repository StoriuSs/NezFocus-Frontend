import { useEffect } from 'react'
import { hashKey, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { serverKeys } from '../api/keys'
import { notFoundServerId } from '../lib/membership'
import { toastName } from '../lib/server-name'
import type { Server } from '../types'

/**
 * Notices a server one is no longer in (D-143), until M2 says so live. Run
 * once, by the AppShell.
 *
 * - Any query or mutation refused as not found under `/servers/{id}` reads
 *   the server list again: the error alone cannot tell a gone server from a
 *   gone channel (NFR-SEC-05), the list can.
 * - A server missing from a list read from the API, that the last list had,
 *   gets a Toast "You are no longer in {server}". The page on it already goes
 *   to /study when its server is not in the list.
 * - Leaving or deleting one oneself takes it out with `setQueryData`, which
 *   React Query marks `manual`: the list moves on, without that Toast (the
 *   dialog says "Left …" itself).
 */
export function useServerGoneWatch() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()

    useEffect(() => {
        const listKey = serverKeys.list()
        let known = queryClient.getQueryData<Server[]>(listKey)

        function readAgainIfGone(error: unknown) {
            if (notFoundServerId(error)) void queryClient.invalidateQueries({ queryKey: listKey })
        }

        const stopQueries = queryClient.getQueryCache().subscribe((event) => {
            if (event.type !== 'updated') return
            if (event.action.type === 'error') return readAgainIfGone(event.action.error)
            if (event.action.type !== 'success' || event.query.queryHash !== hashKey(listKey)) return
            const servers = event.query.state.data as Server[]
            if (!event.action.manual) {
                for (const gone of known?.filter((server) => !servers.some((now) => now.id === server.id)) ?? []) {
                    // An id: two lists read close together say it once.
                    toast(t('shell.serverGone', { name: toastName(gone.name) }), { id: `server-gone-${gone.id}` })
                }
            }
            known = servers
        })
        const stopMutations = queryClient.getMutationCache().subscribe((event) => {
            if (event.type === 'updated' && event.action.type === 'error') readAgainIfGone(event.action.error)
        })
        return () => {
            stopQueries()
            stopMutations()
        }
    }, [queryClient, t])
}
