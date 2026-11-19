/**
 * Screen sharing in a voice room (REQ-VC-05, D-101, S-ROOM-07): who shares,
 * and whether this browser can.
 */

/** Whether this browser can share a screen at all (07 ROOM-EDGE: without it, no Share button). */
export function canShareScreen(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
}

/**
 * The one screen the room shows (D-101: one a room), from LiveKit's
 * `sending` (people whose screen is published and not muted, in LiveKit's
 * order) and the API's `flagged` (the person its list marks as sharing). A
 * screen the server muted (another came first) is not in `sending`. Two at
 * once, for the moment before the server mutes the later one: the one the
 * API marked, else LiveKit's first.
 */
export function sharerOf(sending: readonly string[], flagged: string | undefined): string | undefined {
    if (flagged !== undefined && sending.includes(flagged)) return flagged
    return sending[0]
}

/** The largest box of `shape`'s proportions that fits in `room`, as a picture kept whole is (C-31 › Hình). */
export function fitted(
    room: { width: number; height: number },
    shape: { width: number; height: number }
): { width: number; height: number } {
    if (room.width <= 0 || room.height <= 0 || shape.width <= 0 || shape.height <= 0) return { width: 0, height: 0 }
    const scale = Math.min(room.width / shape.width, room.height / shape.height)
    return { width: Math.floor(shape.width * scale), height: Math.floor(shape.height * scale) }
}

/** What is hidden past each end of a scrolled row. */
export interface Ends {
    before: boolean
    after: boolean
}

/** The ends of `row` that hide tiles (a pixel of rounding is none). */
export function hiddenEnds(row: { scrollLeft: number; clientWidth: number; scrollWidth: number }): Ends {
    return {
        before: row.scrollLeft > 1,
        after: row.scrollLeft + row.clientWidth < row.scrollWidth - 1
    }
}
