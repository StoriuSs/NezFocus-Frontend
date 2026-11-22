/**
 * The server's clock as this tab knows it (D-18, ARCHITECTURE §10.1): a
 * study session's phases end at the server's times, so a clock counting
 * down to one reads `serverNow()`, not `Date.now()`, which may be minutes
 * off on a person's machine.
 *
 * The offset is taken from what the server says live: its `ready` (each time
 * the socket is up again), each `focus_session.*` event and each answer to a
 * session command (`server_time`). Never from a list held in the cache: that
 * time was the server's when the list was read, maybe minutes ago.
 */
let offset = 0

/** The server said it was `serverTime` (ISO) now: keep how far this machine's clock is from it. */
export function noteServerTime(serverTime: string | null | undefined, now = Date.now()): void {
    if (!serverTime) return
    const told = Date.parse(serverTime)
    if (Number.isNaN(told)) return
    offset = told - now
}

/** The server's time now, in milliseconds since 1970, as `Date.now()` gives this machine's. */
export function serverNow(): number {
    return Date.now() + offset
}
