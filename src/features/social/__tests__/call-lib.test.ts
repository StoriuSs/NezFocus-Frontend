import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_CALL, calledMe, newestOf, stillNews, withCall } from '../lib/call-cache'
import { callToRejoin, keepCall, resetCallRejoin } from '../lib/call-keep'
import { callClock, callResultOf, callSeconds } from '../lib/call-result'
import type { Call } from '../types'

const BINH = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }

/** A call between me (an) and Bình; `out`: I called. */
function call(id: string, status: Call['status'], out = true, more: Partial<Call> = {}): Call {
    return {
        id,
        dmId: 'dm-binh',
        callerId: out ? 'an' : 'binh',
        calleeId: out ? 'binh' : 'an',
        video: false,
        status,
        endReason: null,
        user: BINH,
        createdAt: '2026-10-18T14:44:00.000Z',
        acceptedAt: null,
        endedAt: null,
        ...more
    }
}

describe('my calls in the cache (withCall, D-245)', () => {
    it('puts a call ringing to me among the incoming ones, oldest first, and one I make as the current one', () => {
        const first = withCall(NO_CALL, call('c1', 'ringing', false))
        const second = withCall(first, call('c2', 'ringing', false))
        expect(second.incoming.map((one) => one.id)).toEqual(['c1', 'c2'])
        expect(second.current).toBeNull()

        const out = withCall(NO_CALL, call('c3', 'ringing'))
        expect(out).toEqual({ current: call('c3', 'ringing'), incoming: [] })
    })

    it('moves a call ringing to me to the current one once answered, and takes a call over out of both', () => {
        const ringing = withCall(NO_CALL, call('c1', 'ringing', false))
        const answered = withCall(ringing, call('c1', 'active', false))
        expect(answered).toEqual({ current: call('c1', 'active', false), incoming: [] })
        expect(withCall(answered, call('c1', 'ended', false))).toEqual(NO_CALL)
        expect(withCall(ringing, call('c1', 'missed', false))).toEqual(NO_CALL)
    })

    it('knows who was called from the other one the call names', () => {
        expect(calledMe(call('c1', 'ringing', false))).toBe(true)
        expect(calledMe(call('c1', 'ringing'))).toBe(false)
    })

    // L4a B6: two words of one call may come out of order; a call only goes forward.
    it('drops a word behind what is known of a call: a ringing once answered, anything once over', () => {
        const over = new Map([['c1', call('c1', 'ended')]])
        expect(stillNews(over, call('c1', 'ringing'))).toBe(false)
        expect(stillNews(over, call('c1', 'active'))).toBe(false)
        expect(stillNews(over, call('c1', 'ended'))).toBe(true)
        expect(stillNews(over, call('c2', 'ringing'))).toBe(true)
        const answered = new Map([['c1', call('c1', 'active')]])
        expect(stillNews(answered, call('c1', 'ringing'))).toBe(false)
        expect(stillNews(answered, call('c1', 'active'))).toBe(true)
        expect(stillNews(answered, call('c1', 'declined'))).toBe(true)
    })

    it('takes the furthest of an answer and what the words said first', () => {
        const known = new Map([['c1', call('c1', 'active')]])
        expect(newestOf(known, call('c1', 'ringing')).status).toBe('active')
        expect(newestOf(known, call('c1', 'ended')).status).toBe('ended')
        expect(newestOf(new Map(), call('c1', 'ringing')).status).toBe('ringing')
    })

    it('leaves a card in its place when a word of it comes again', () => {
        const two = withCall(withCall(NO_CALL, call('c1', 'ringing', false)), call('c2', 'ringing', false))
        expect(withCall(two, call('c1', 'ringing', false)).incoming.map((one) => one.id)).toEqual(['c1', 'c2'])
    })
})

describe('the result on the call page (C-48 › Kết quả, D-255)', () => {
    const none = { cancelledByMe: false, reconnecting: false }

    it('says refused, busy and no answer to the caller, five seconds with Call again', () => {
        expect(callResultOf(call('c', 'declined'), none)).toMatchObject({
            kind: 'declined',
            buttons: true,
            holdMs: 5000
        })
        expect(callResultOf(call('c', 'missed', true, { endReason: 'busy' }), none)?.kind).toBe('busy')
        expect(callResultOf(call('c', 'missed', true, { endReason: 'no_answer' }), none)?.kind).toBe('no-answer')
        expect(callResultOf(call('c', 'failed'), none)).toMatchObject({ kind: 'failed', buttons: true })
    })

    it('shows nothing for my own Cancel, my own Decline, or a call missed to me (its card says it)', () => {
        const cancelled = call('c', 'missed', true, { endReason: 'cancelled' })
        expect(callResultOf(cancelled, { cancelledByMe: true, reconnecting: false })).toBeNull()
        expect(callResultOf(call('c', 'declined', false), none)).toBeNull()
        expect(callResultOf(call('c', 'missed', false, { endReason: 'no_answer' }), none)).toBeNull()
        // Cut off by the other side while ringing (a block): over, no reason given (SOCIAL-03).
        expect(callResultOf(cancelled, none)?.kind).toBe('ended')
    })

    it('says over with its length for two seconds, or lost when this tab was reconnecting', () => {
        const ended = call('c', 'ended', true, {
            acceptedAt: '2026-10-18T14:44:06.000Z',
            endedAt: '2026-10-18T14:47:21.500Z'
        })
        expect(callResultOf(ended, none)).toMatchObject({ kind: 'ended', seconds: 195, buttons: false, holdMs: 2000 })
        expect(callResultOf(ended, { cancelledByMe: false, reconnecting: true })).toMatchObject({
            kind: 'dropped',
            buttons: true
        })
        expect(callSeconds(call('c', 'failed'))).toBeNull()
    })

    it('counts the clock as mm:ss, h:mm:ss from an hour (09 › Số)', () => {
        expect(callClock(192_000)).toBe('03:12')
        expect(callClock(0)).toBe('00:00')
        expect(callClock((3600 + 2 * 60 + 45) * 1000)).toBe('1:02:45')
    })
})

describe('the call this tab holds, for a reload (D-255)', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        resetCallRejoin()
        sessionStorage.clear()
    })

    const navigation = (type: string) =>
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type } as unknown as PerformanceEntry])

    it('goes back into it on a reload, once', () => {
        navigation('reload')
        keepCall('c1')
        expect(callToRejoin()).toBe('c1')
        expect(callToRejoin()).toBe('c1')
        expect(sessionStorage.getItem('social.call')).toBeNull()
    })

    it('never in a duplicated tab or a new page load', () => {
        navigation('navigate')
        keepCall('c1')
        expect(callToRejoin()).toBeNull()
    })
})
