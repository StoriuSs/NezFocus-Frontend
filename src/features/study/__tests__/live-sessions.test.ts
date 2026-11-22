import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { emitRealtimeEvent } from '@/features/realtime/lib/realtime-events'
import { serverNow } from '@/lib/server-clock'
import { studyKeys } from '../api/keys'
import { listenForSessions, tellSession } from '../api/liveSessions'
import { hearSessionLeft, useStudyStore } from '../study.store'
import type { FocusSession, SoloState, StudyToday } from '../types'
import { news, session, solo } from '@/test/study-sessions'

let client: QueryClient
const sink = vi.fn<(session: FocusSession) => void>()
let stop: () => void

beforeEach(() => {
    client = new QueryClient()
    sink.mockReset()
    useStudyStore.setState({ news: {}, pausedBy: {}, ended: {}, left: {} })
    stop = listenForSessions(client, sink)
})
afterEach(() => stop())

describe("Hearing the rooms' sessions (SRS 5.2, D-225)", () => {
    it('hands each later state to the sinks, and keeps who did what', () => {
        emitRealtimeEvent('focus_session.started', news({ version: 1 }))
        emitRealtimeEvent('focus_session.updated', news({ version: 3, action: 'skip' }))
        // Came late: older than what was told.
        emitRealtimeEvent('focus_session.updated', news({ version: 2, action: 'pause' }))
        expect(sink.mock.calls.map(([told]) => told.version)).toEqual([1, 3])
        expect(useStudyStore.getState().news['im-lang']).toMatchObject({ version: 3, action: 'skip' })
    })

    it('takes the server clock from what it tells', () => {
        vi.useFakeTimers({ now: Date.parse('2026-11-22T14:47:00.000Z') })
        emitRealtimeEvent('focus_session.updated', news({ serverTime: '2026-11-22T14:47:18.000Z' }))
        expect(serverNow()).toBe(Date.parse('2026-11-22T14:47:18.000Z'))
        vi.useRealTimers()
    })

    it('knows who paused a session while it stays paused, as heard (D-231)', () => {
        emitRealtimeEvent(
            'focus_session.updated',
            news({ version: 4, status: 'paused', action: 'pause', actorId: 'binh' })
        )
        expect(useStudyStore.getState().pausedBy.s1).toBe('binh')
        // A new cycle while paused keeps who paused it.
        emitRealtimeEvent('focus_session.updated', news({ version: 5, status: 'paused', action: 'config' }))
        expect(useStudyStore.getState().pausedBy.s1).toBe('binh')
        emitRealtimeEvent('focus_session.updated', news({ version: 6, status: 'running', action: 'resume' }))
        expect(useStudyStore.getState().pausedBy).toEqual({})
    })

    it("keeps a room's session ended, with everyone's seconds, for its summary (D-49)", () => {
        const end = news({ version: 9, status: 'ended', action: 'stop', summaries: [{ userId: 'an', seconds: 1860 }] })
        emitRealtimeEvent('focus_session.ended', end)
        expect(useStudyStore.getState().ended['im-lang']).toEqual(end)
        expect(sink).toHaveBeenCalledWith(end)
    })

    it("hands on a command's answer the same, unless a later state was told", () => {
        expect(tellSession(session({ version: 5 }))).toBe(true)
        expect(tellSession(session({ version: 5 }))).toBe(false)
        expect(tellSession(session({ channelId: null }))).toBe(false)
        expect(sink).toHaveBeenCalledTimes(1)
    })

    it("keeps who did it from the event when the command's answer brought the same state first", () => {
        tellSession(session({ version: 5, status: 'paused' }))
        emitRealtimeEvent(
            'focus_session.updated',
            news({ version: 5, status: 'paused', action: 'pause', actorId: 'an' })
        )
        expect(useStudyStore.getState().pausedBy.s1).toBe('an')
        const end = news({ version: 6, status: 'ended', action: 'stop', summaries: [{ userId: 'an', seconds: 60 }] })
        tellSession(session({ version: 6, status: 'ended' }))
        emitRealtimeEvent('focus_session.ended', end)
        expect(useStudyStore.getState().ended['im-lang']).toEqual(end)
        // The sink had each state once.
        expect(sink.mock.calls.map(([told]) => told.version)).toEqual([5, 6])
    })

    it('stops hearing once its client stops', () => {
        stop()
        emitRealtimeEvent('focus_session.started', news())
        expect(sink).not.toHaveBeenCalled()
        stop = listenForSessions(client, sink)
    })
})

describe("One's day so far (streak.updated, D-231, D-232)", () => {
    const held = (today: StudyToday) => client.setQueryData(studyKeys.today(), today)
    const today = () => client.getQueryData<StudyToday>(studyKeys.today())

    it('replaces the numbers held, unless they were read later: two reads may come in either order', () => {
        held({
            todaySeconds: 600,
            countedUntil: '2026-11-22T14:47:00.000Z',
            streak: 5,
            readAt: '2026-11-22T14:47:00.100Z'
        })
        emitRealtimeEvent('streak.updated', {
            current: 6,
            longest: 9,
            todaySeconds: 900,
            countedUntil: '2026-11-22T14:48:00.000Z',
            readAt: '2026-11-22T14:48:00.100Z'
        })
        expect(today()).toEqual({
            todaySeconds: 900,
            countedUntil: '2026-11-22T14:48:00.000Z',
            streak: 6,
            readAt: '2026-11-22T14:48:00.100Z'
        })
        // Moving straight to another room: room B's start, read at :20, then room A's close, read at :10.
        emitRealtimeEvent('streak.updated', {
            current: 6,
            longest: 9,
            todaySeconds: 960,
            countedUntil: '2026-11-22T14:49:00.000Z',
            readAt: '2026-11-22T14:49:00.200Z'
        })
        emitRealtimeEvent('streak.updated', {
            current: 6,
            longest: 9,
            todaySeconds: 960,
            countedUntil: null,
            readAt: '2026-11-22T14:49:00.100Z'
        })
        expect(today()?.countedUntil).toBe('2026-11-22T14:49:00.000Z')
        // Left the session: no count stands open any more.
        emitRealtimeEvent('streak.updated', {
            current: 6,
            longest: 9,
            todaySeconds: 990,
            countedUntil: null,
            readAt: '2026-11-22T14:50:00.000Z'
        })
        expect(today()).toEqual({
            todaySeconds: 990,
            countedUntil: null,
            streak: 6,
            readAt: '2026-11-22T14:50:00.000Z'
        })
    })

    it('reads them again once the socket is live again', () => {
        held({ todaySeconds: 600, countedUntil: null, streak: 5, readAt: '2026-11-22T14:47:00.000Z' })
        emitRealtimeEvent('ready', undefined)
        expect(client.getQueryState(studyKeys.today())?.isInvalidated).toBe(true)
    })
})

describe("One's seconds in a session as one's place closes (focus_session.left, D-233)", () => {
    afterEach(() => vi.useRealTimers())

    it('tells whoever listens for that session each total heard since, and nothing once stopped', () => {
        const heard = vi.fn()
        const stopHearing = hearSessionLeft('im-lang', 's1', Date.now(), heard)
        emitRealtimeEvent('focus_session.left', { sessionId: 's0', channelId: 'thao-luan', seconds: 60 })
        emitRealtimeEvent('focus_session.left', { sessionId: 's1', channelId: 'im-lang', seconds: 1860 })
        emitRealtimeEvent('focus_session.left', { sessionId: 's1', channelId: 'im-lang', seconds: 1900 })
        expect(heard.mock.calls).toEqual([[1860], [1900]])
        stopHearing()
        emitRealtimeEvent('focus_session.left', { sessionId: 's1', channelId: 'im-lang', seconds: 2000 })
        expect(heard).toHaveBeenCalledTimes(2)
    })

    it('tells at once one heard just before listening (the leaving may come back first); not an older one, nor another session', () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        const since = Date.now()
        emitRealtimeEvent('focus_session.left', { sessionId: 's1', channelId: 'im-lang', seconds: 1860 })
        const now = vi.fn()
        hearSessionLeft('im-lang', 's1', since, now)()
        expect(now).toHaveBeenCalledWith(1860)

        vi.advanceTimersByTime(1)
        const later = vi.fn()
        hearSessionLeft('im-lang', 's1', Date.now(), later)()
        const other = vi.fn()
        hearSessionLeft('im-lang', 's2', since, other)()
        expect(later).not.toHaveBeenCalled()
        expect(other).not.toHaveBeenCalled()
    })
})

describe("One's Solo (solo_session.updated, D-222, D-234)", () => {
    const soloHeld = () => client.getQueryData<SoloState>(studyKeys.solo())
    beforeEach(() => {
        useStudyStore.setState({ soloEnded: null })
        client.setQueryData<SoloState>(studyKeys.solo(), {
            session: solo(),
            startCycle: { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null }
        })
    })

    it('keeps each later state, the next start’s cycle its own; not an older one, nor a room’s sinks', () => {
        emitRealtimeEvent('solo_session.updated', solo({ version: 2, status: 'paused', focusMinutes: 40 }))
        emitRealtimeEvent('solo_session.updated', solo({ version: 1 }))
        expect(soloHeld()?.session).toMatchObject({ version: 2, status: 'paused' })
        expect(soloHeld()?.startCycle.focus).toBe(40)
        expect(sink).not.toHaveBeenCalled()
    })

    it('holds none once it ended, its summary in the store; an older word after it changes nothing', () => {
        emitRealtimeEvent(
            'solo_session.updated',
            solo({ version: 3, status: 'ended', endedReason: 'stopped', countedSeconds: 1098 })
        )
        expect(soloHeld()?.session).toBeNull()
        expect(useStudyStore.getState().soloEnded).toMatchObject({
            session: { id: 'solo-1', countedSeconds: 1098 },
            stoppedHere: false,
            yieldedHere: false
        })
        emitRealtimeEvent('solo_session.updated', solo({ version: 2 }))
        expect(soloHeld()?.session).toBeNull()
    })

    it('takes a command’s answer for a Solo into the query, never a room’s sink', () => {
        tellSession(solo({ version: 1, status: 'paused' }))
        expect(soloHeld()?.session?.status).toBe('paused')
        expect(sink).not.toHaveBeenCalled()
    })

    it('reads it again once the socket is live again', () => {
        emitRealtimeEvent('ready', undefined)
        expect(client.getQueryState(studyKeys.solo())?.isInvalidated).toBe(true)
    })
})
