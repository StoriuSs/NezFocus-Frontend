import { createElement, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LogOut } from 'lucide-react'
import { toast } from 'sonner'
import i18n from '@/i18n'
import { openInbox, useInboxStore, useUnreadRemovals } from '@/features/notifications'
import { serverKeys } from '../api/keys'
import { useServers } from '../api/useServers'
import { toastName } from '../lib/server-name'
import { useServerRemovals } from '../server-removals.store'

const toastId = (itemId: string) => `server-gone-${itemId}`

/**
 * Says each server one was put out of or banned from while away (11 S-MOD-02
 * › Luật bằng chữ, H1; D-187): its item in the inbox, not read yet, is the
 * sign, as a tab just opened does not know the list it had. A Toast `log-out`
 * "Bạn không còn ở {server}" with "Xem", which opens the inbox, where the
 * item is read. Run once, by the AppShell.
 *
 * - Once the inbox and the server list are both read; again as either
 *   changes (the inbox read again when the socket is back).
 * - Each item once in a tab, its Toast taken away once it is read elsewhere.
 *   None for an item while the inbox is open (it reads it there), for a
 *   server whose dialog this tab shows or showed (removed while here, the
 *   item not read as the API could not tell), nor for a server one is in
 *   again, by a list read after the item was made: one held from before is
 *   waited out, as on `ready` the inbox may be read again before the list.
 */
export function useRemovedWhileAway() {
    const removals = useUnreadRemovals()
    const queryClient = useQueryClient()
    const servers = useServers().data
    /** The items dealt with in this tab: said, or found not to be said. */
    const told = useRef(new Set<string>())
    /** The items whose Toast was shown. */
    const shown = useRef(new Set<string>())

    useEffect(() => {
        if (!removals || !servers) return
        const unread = new Set(removals.map((removal) => removal.id))
        for (const id of shown.current) {
            if (unread.has(id)) continue
            shown.current.delete(id)
            toast.dismiss(toastId(id))
        }
        const waiting = useServerRemovals.getState().queue
        // Read here, not watched: how fresh the list is changes no Toast on its own.
        const list = queryClient.getQueryState(serverKeys.list())
        const stale = (createdAt: string) =>
            !list || list.fetchStatus === 'fetching' || list.dataUpdatedAt < Date.parse(createdAt)
        for (const removal of removals) {
            if (told.current.has(removal.id)) continue
            const listed = servers.some((server) => server.id === removal.serverId)
            if (listed && stale(removal.createdAt)) continue
            told.current.add(removal.id)
            const inboxOpen = useInboxStore.getState().open
            if (listed || inboxOpen || waiting.some((dialog) => dialog.serverId === removal.serverId)) continue
            shown.current.add(removal.id)
            toast(i18n.t('shell.serverGone', { name: toastName(removal.name) }), {
                id: toastId(removal.id),
                icon: createElement(LogOut, { className: 'size-4', 'aria-hidden': true }),
                action: {
                    label: i18n.t('shell.serverGoneView'),
                    onClick: (event) => {
                        // Sonner hands the focus back to where it was once it leaves the toasts: now,
                        // before the inbox opens, or that later focus outside it would close it.
                        event.currentTarget.blur()
                        openInbox()
                    }
                }
            })
        }
    }, [queryClient, removals, servers])
}
