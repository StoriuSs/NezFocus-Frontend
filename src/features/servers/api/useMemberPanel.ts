import { useEffect } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import type { Presence } from '@/components/ui/presence-dot'
import { onRealtimeEvent } from '@/features/realtime'
import type { MemberPage, ServerMember } from '../types'
import { serverKeys } from './keys'
import { fetchMembers } from './roles.api'

/** One page of the offline group; the online group reads page after page until all are in (D-175). */
const PAGE = 100
/** Someone changing group is read again once, a moment after the first change of a burst. */
const SETTLE_MS = 1000

const query = (presence: 'online' | 'offline', page: number) =>
    ({ presence, sort: 'name', order: 'asc', limit: PAGE, page }) as const

/** Every member online to others now, by name: all of them, however many pages. */
async function everyoneOnline(serverId: string): Promise<{ items: ServerMember[]; total: number }> {
    const items: ServerMember[] = []
    for (let page = 1; ; page++) {
        const read = await fetchMembers(serverId, query('online', page))
        items.push(...read.items)
        if (!read.meta.hasNextPage) return { items, total: read.meta.totalItems }
    }
}

/**
 * The member panel's two groups (S-SHELL-01, C-13, D-175): everyone online
 * to others (away and do not disturb included), and those offline a page of
 * 100 at a time, both by name. Kept live by `presence.updated` while shown:
 * a member staying in their group changes dot at once; one changing group
 * has the groups read again (once, a second after the first change). The
 * event says no server: someone listed in neither group is of this server
 * only while the offline group has pages not read yet. Read again each time
 * the socket is back (not while the first reading is on its way), and each
 * time the panel opens: it heard nothing while closed.
 */
export function useMemberPanel(serverId: string) {
    const queryClient = useQueryClient()
    const online = useQuery({
        queryKey: serverKeys.memberPanel(serverId, 'online'),
        queryFn: () => everyoneOnline(serverId),
        staleTime: 0
    })
    const offline = useInfiniteQuery({
        queryKey: serverKeys.memberPanel(serverId, 'offline'),
        queryFn: ({ pageParam }) => fetchMembers(serverId, query('offline', pageParam)),
        initialPageParam: 1,
        staleTime: 0,
        getNextPageParam: (last: MemberPage) => (last.meta.hasNextPage ? last.meta.currentPage + 1 : undefined)
    })

    useEffect(() => {
        let pending: ReturnType<typeof setTimeout> | undefined
        const readAgain = () => {
            pending ??= setTimeout(() => {
                pending = undefined
                void queryClient.invalidateQueries({ queryKey: serverKeys.memberPanels(serverId) })
            }, SETTLE_MS)
        }
        const stops = [
            onRealtimeEvent('presence.updated', (data) => {
                const { userId, status } = data as { userId: string; status: Presence }
                const onlineKey = serverKeys.memberPanel(serverId, 'online')
                const listed = queryClient.getQueryData<{ items: ServerMember[]; total: number }>(onlineKey)
                const isOnline = listed?.items.some((member) => member.userId === userId) ?? false
                if (isOnline && status !== 'offline') {
                    queryClient.setQueryData<{ items: ServerMember[]; total: number }>(
                        onlineKey,
                        (held) =>
                            held && {
                                ...held,
                                items: held.items.map((member) =>
                                    member.userId === userId ? { ...member, status } : member
                                )
                            }
                    )
                    return
                }
                const offlinePages = queryClient.getQueryData<InfiniteData<MemberPage>>(
                    serverKeys.memberPanel(serverId, 'offline')
                )
                const isOffline = offlinePages?.pages.some((page) =>
                    page.items.some((member) => member.userId === userId)
                )
                const unread = offlinePages?.pages.at(-1)?.meta.hasNextPage ?? true
                // Gone offline, or come online from the offline group (perhaps a page not read yet).
                if (isOnline || isOffline || (status !== 'offline' && unread)) readAgain()
            }),
            onRealtimeEvent('ready', () => {
                // Not while the first reading is on its way: it answers for now.
                const reading = [
                    serverKeys.memberPanel(serverId, 'online'),
                    serverKeys.memberPanel(serverId, 'offline')
                ]
                if (reading.every((key) => queryClient.getQueryState(key)?.fetchStatus !== 'fetching')) {
                    void queryClient.invalidateQueries({ queryKey: serverKeys.memberPanels(serverId) })
                }
            })
        ]
        return () => {
            clearTimeout(pending)
            stops.forEach((stop) => stop())
        }
    }, [queryClient, serverId])

    return { online, offline }
}
