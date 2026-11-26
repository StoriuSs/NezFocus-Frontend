import { wasReloaded } from '@/lib/page-load'
import { safeSessionStorage } from '@/lib/safe-storage'

const KEY = 'voice.room'

/** The room this tab is in, kept for a reload (VC-02, D-51): this tab's storage, not the browser's. */
export interface KeptRoom {
    serverId: string
    channelId: string
}

export function keepRoom(room: KeptRoom): void {
    safeSessionStorage.set(KEY, JSON.stringify(room))
}

export function forgetRoom(): void {
    safeSessionStorage.remove(KEY)
}

/** The room this page load is to join again: read once, whatever mounts and mounts again meanwhile. */
let pending: KeptRoom | null | undefined

/**
 * The room this page load joins again (`takeRoomToRejoin`, read at the first
 * ask): the shell may be drawn, dropped and drawn again before the rooms are
 * known (signing in again on a reload; effects run twice in development).
 */
export function roomToRejoin(): KeptRoom | null {
    if (pending === undefined) pending = takeRoomToRejoin()
    return pending
}

/** Joined again, or given up: no later mount tries it. */
export function rejoinDone(): void {
    pending = null
}

/** For tests: as a new page load. */
export function resetRejoin(): void {
    pending = undefined
}

/**
 * The room to join again once, on a reload of a tab that was in it; taken,
 * so it is asked for once. A duplicated tab carries a copy of this storage:
 * not a reload, so it joins nothing and drops the copy.
 */
export function takeRoomToRejoin(): KeptRoom | null {
    const kept = safeSessionStorage.get(KEY)
    forgetRoom()
    if (!kept || !wasReloaded()) return null
    try {
        const room = JSON.parse(kept) as Partial<KeptRoom>
        return typeof room.serverId === 'string' && typeof room.channelId === 'string'
            ? { serverId: room.serverId, channelId: room.channelId }
            : null
    } catch {
        return null
    }
}
