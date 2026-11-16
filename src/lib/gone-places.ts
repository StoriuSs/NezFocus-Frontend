import axios from 'axios'

/**
 * Servers, channels and messages this tab just let go of: one was removed
 * from the server, it was deleted, or a channel went private to them
 * (D-178). Requests about them still on their way come back refused; the
 * dialog or Toast that said it went has said enough, so their failures say
 * nothing more (11 S-MOD-02 E9).
 *
 * Ids, as they appear in a request's path, are kept two minutes, long past
 * any request then on its way, unless the place is back sooner (a server
 * joined again, a channel seen again): then it is let be at once, with the
 * messages read in it. The features tell it (it lives in src/lib, which
 * must not import them).
 */
const KEEP_MS = 2 * 60_000

/** Each id gone, until when, and the place it belongs to (a message: its channel). */
const gone = new Map<string, { until: number; owner: string | undefined }>()

/** These ids are gone, from now; `owner`: the place they go and come back with. */
export function forgetPlaces(ids: Iterable<string>, owner?: string): void {
    const until = Date.now() + KEEP_MS
    for (const id of ids) gone.set(id, { until, owner })
}

/** These places are back (in the server list again): they, and what belongs to them, are not gone. */
export function rememberPlaces(ids: Iterable<string>): void {
    if (gone.size === 0) return
    const back = new Set(ids)
    for (const [id, { owner }] of gone) {
        if (back.has(id) || (owner !== undefined && back.has(owner))) gone.delete(id)
    }
}

/** Whether a failed request was about something gone: a part of its path is one of the ids. */
export function aboutGonePlace(error: unknown): boolean {
    if (gone.size === 0 || !axios.isAxiosError(error)) return false
    const now = Date.now()
    const [path = ''] = (error.config?.url ?? '').split('?')
    return path.split('/').some((part) => {
        const entry = gone.get(part)
        if (entry === undefined) return false
        if (entry.until > now) return true
        gone.delete(part)
        return false
    })
}
