import type { Call, MyCall } from '../types'

/** No call made, none ringing (`GET /me/call` before it is read, or after a failed read). */
export const NO_CALL: MyCall = { current: null, incoming: [] }

/** Ringing or answered: the call still holds its two (D-242). */
export const isOpenCall = (call: Pick<Call, 'status'>): boolean => call.status === 'ringing' || call.status === 'active'

/** Whether I am the one called (the call names the other one as `user`). */
export const calledMe = (call: Pick<Call, 'calleeId' | 'user'>): boolean => call.user.id !== call.calleeId

/**
 * My calls with `call` as it is now (`call.*`, a command's answer): one
 * ringing to me among the incoming ones (two at most, oldest first: the
 * backend's rule; a word of one already there leaves it in its place), one
 * I make or am in as the current one, one over in neither.
 */
export function withCall(my: MyCall, call: Call): MyCall {
    const current = my.current?.id === call.id ? null : my.current
    if (call.status === 'ringing' && calledMe(call)) {
        const held = my.incoming.some((one) => one.id === call.id)
        return {
            current,
            incoming: held ? my.incoming.map((one) => (one.id === call.id ? call : one)) : [...my.incoming, call]
        }
    }
    const incoming = my.incoming.filter((one) => one.id !== call.id)
    return isOpenCall(call) ? { current: call, incoming } : { current, incoming }
}

/** How far a call has gone: ringing, answered, over. A call only ever goes forward (D-242). */
const stepOf = (call: Pick<Call, 'status'>): number =>
    call.status === 'ringing' ? 0 : call.status === 'active' ? 1 : 2

/**
 * Whether a word of a call still counts (L4a B6): two words of one call may
 * come out of order, so one behind what is known of it (a ringing after it
 * was answered, anything after its end) is old news: the card would ring
 * again after the end. `seen` holds the furthest word of each call.
 */
export function stillNews(seen: ReadonlyMap<string, Pick<Call, 'status'>>, call: Pick<Call, 'id' | 'status'>): boolean {
    const known = seen.get(call.id)
    return !known || stepOf(call) >= stepOf(known)
}

/** The furthest of `call` and what is known of it (an answer may come after the call's own words). */
export function newestOf<T extends Pick<Call, 'id' | 'status'>>(seen: ReadonlyMap<string, T>, call: T): T {
    const known = seen.get(call.id)
    return known && stepOf(known) > stepOf(call) ? known : call
}
