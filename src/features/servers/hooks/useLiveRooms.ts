import { useEffect, useMemo, useRef, useState } from 'react'
import { useFriendIds } from '@/features/social'
import { useProfile } from '@/features/users'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useServers } from '../api/useServers'
import { keptOrder, liveRoomsOf, orderOf, type LiveRoom } from '../lib/live-rooms'
import { can } from '../lib/permissions'

/** Away this long, the page's order is worked out again on coming back (REQ-STUDY-09, D-222). */
export const AWAY_REORDER_MS = 5 * 60 * 1000

/** A room whose session ended fades this long before it goes (C-44 `leaving`). */
export const LEAVING_MS = 200

/** A row of the Study page's list: the room, and whether it is fading out. */
export interface LiveRoomItem {
    room: LiveRoom
    leaving: boolean
}

interface Held {
    /** The rooms the order was last worked from. */
    source: LiveRoom[] | undefined
    order: string[]
    /** Rooms whose session ended while in view, kept as they were for their fade. */
    leaving: LiveRoom[]
}

/**
 * The rooms studying now for the Study page (08 S-STUDY-01, Q4), from the
 * servers held (GET /servers, kept by events): in the page's order as it
 * opens, and again on coming back to the tab after more than 5 minutes
 * away. Meanwhile the order holds: phases, minutes and people change in
 * place, a room starting a session joins at the end, a room whose session
 * ends fades out for 200ms, its row kept (at once with Giảm chuyển động);
 * a room gone from what is held (put out of its server, made private, its
 * channel deleted) goes at once (08 › Edge).
 */
export function useLiveRooms() {
    const servers = useServers()
    const me = useProfile().data?.id
    const still = useMediaQuery('(prefers-reduced-motion: reduce)')
    const friends = useFriendIds()
    // Who one is and one's friends decide the first rooms: no order is worked out before they are known.
    const rooms = useMemo(
        () => (servers.data && me !== undefined && friends ? liveRoomsOf(servers.data, me, friends) : undefined),
        [servers.data, me, friends]
    )
    const [held, setHeld] = useState<Held>({ source: undefined, order: [], leaving: [] })

    if (rooms && held.source !== rooms) {
        if (!held.source) {
            setHeld({ source: rooms, order: orderOf(rooms), leaving: [] })
        } else {
            const present = new Set(rooms.map((room) => room.channelId))
            // Rooms still there and still open to one: their session ended. Any other went (CONNECT lost, put out, deleted).
            const channels = new Set(
                servers.data?.flatMap((server) =>
                    server.channels
                        .filter((channel) => can(channel.permissions, 'CONNECT'))
                        .map((channel) => channel.id)
                )
            )
            const ended = still
                ? []
                : held.source.filter((room) => !present.has(room.channelId) && channels.has(room.channelId))
            const leaving = [...held.leaving, ...ended].filter(
                (room, index, all) =>
                    !present.has(room.channelId) &&
                    channels.has(room.channelId) &&
                    all.findIndex((other) => other.channelId === room.channelId) === index
            )
            const keep = new Set(leaving.map((room) => room.channelId))
            setHeld({ source: rooms, order: keptOrder(held.order, rooms, keep), leaving })
        }
    }

    // The fade done, the rows go and those under them move up.
    const fading = held.leaving.map((room) => room.channelId).join(' ')
    useEffect(() => {
        if (!fading) return
        const timer = setTimeout(
            () => setHeld((now) => ({ ...now, order: keptOrder(now.order, now.source ?? []), leaving: [] })),
            LEAVING_MS
        )
        return () => clearTimeout(timer)
    }, [fading])

    // Back after more than 5 minutes away: the page's order again, as if opened now.
    const latest = useRef(rooms)
    useEffect(() => {
        latest.current = rooms
    }, [rooms])
    useEffect(() => {
        let hiddenAt: number | null = null
        const onChange = () => {
            if (document.hidden) {
                hiddenAt = Date.now()
                return
            }
            const current = latest.current
            if (hiddenAt !== null && Date.now() - hiddenAt > AWAY_REORDER_MS && current) {
                setHeld({ source: current, order: orderOf(current), leaving: [] })
            }
            hiddenAt = null
        }
        document.addEventListener('visibilitychange', onChange)
        return () => document.removeEventListener('visibilitychange', onChange)
    }, [])

    const byId = new Map(rooms?.map((room) => [room.channelId, room]))
    const fadingById = new Map(held.leaving.map((room) => [room.channelId, room]))
    const rows: LiveRoomItem[] = held.order.flatMap((id): LiveRoomItem[] => {
        const room = byId.get(id)
        if (room) return [{ room, leaving: false }]
        const gone = fadingById.get(id)
        return gone ? [{ room: gone, leaving: true }] : []
    })
    return {
        servers,
        /** Who one is known, the rooms worked out: until then the list is still loading. */
        ready: rooms !== undefined,
        rows,
        /** The rooms counted in "— N PHÒNG": those not fading out. */
        count: rows.filter((row) => !row.leaving).length
    }
}
