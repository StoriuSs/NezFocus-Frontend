import { createElement, useEffect } from 'react'
import { hashKey, useQueryClient } from '@tanstack/react-query'
import { LogOut, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { serverKeys } from '../api/keys'
import { listenForServers } from '../api/liveServers'
import { forgetServerData } from '../api/useServers'
import { notFoundServerId } from '../lib/membership'
import { toastName } from '../lib/server-name'
import type { Server } from '../types'

/**
 * Keeps the servers live from socket events (`listenForServers`, D-178) and
 * says when one is gone. Run once, by the AppShell.
 *
 * - A server deleted: Toast `trash-2` "{server} was deleted" (11 S-MOD-02 ›
 *   Server bị xóa). Kicked or banned from one: until the dialog of L9b,
 *   "You are no longer in {server}". The page on it goes to the next server
 *   on the rail itself.
 *
 * - Any query or mutation refused as not found under `/servers/{id}` reads
 *   the server list again: the error alone cannot tell a gone server from a
 *   gone channel (NFR-SEC-05), the list can.
 * - A server missing from a list read from the API, that the last list had,
 *   gets a Toast "You are no longer in {server}": one removed while the
 *   socket was down, the list read again once it is back (D-179, until the
 *   inbox of M3 says it).
 * - Leaving or deleting one oneself takes it out with `setQueryData`, which
 *   React Query marks `manual`: the list moves on, without that Toast (the
 *   dialog says "Left …" itself).
 */
export function useServerGoneWatch() {
    const queryClient = useQueryClient()

    useEffect(() => {
        // For the app's life, as the chat's listeners: words read when said, so a new language never restarts it.
        listenForServers(queryClient, {
            deleted: (server) =>
                toast(i18n.t('shell.serverDeleted', { name: toastName(server.name) }), {
                    id: `server-deleted-${server.id}`,
                    icon: icon(Trash2)
                }),
            removed: (server) => sayGone(server)
        })
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
                    sayGone(gone)
                    forgetServerData(queryClient, gone)
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
    }, [queryClient])
}

const icon = (shape: typeof Trash2) => createElement(shape, { className: 'size-4', 'aria-hidden': true })

/** "You are no longer in {server}", `log-out` (11 S-MOD-02); an id, so two lists read close together say it once. */
function sayGone(server: Server) {
    toast(i18n.t('shell.serverGone', { name: toastName(server.name) }), {
        id: `server-gone-${server.id}`,
        icon: icon(LogOut)
    })
}
