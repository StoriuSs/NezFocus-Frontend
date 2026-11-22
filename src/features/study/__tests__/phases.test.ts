import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/study'
import { cycleName, cycleSummary } from '../lib/cycle-words'
import { studiedText } from '../lib/durations'
import {
    clockText,
    isLater,
    isLongClock,
    nextPhaseOf,
    phaseGone,
    phaseMinutes,
    remainingMs,
    roomSessionOf,
    roundOf,
    sessionCycle
} from '../lib/phases'
import { AT, session } from './fixtures'

const t = i18n.getFixedT('vi', 'study')
const LONG = { longBreakMinutes: 15, longBreakEvery: 4 }

describe('the phases of a session, as the backend works them out', () => {
    it('counts rounds from 1, a focus and the break after it', () => {
        expect(roundOf(session({ phaseIndex: 0 }))).toBe(1)
        expect(roundOf(session({ phaseIndex: 1, phase: 'short_break' }))).toBe(1)
        expect(roundOf(session({ phaseIndex: 2 }))).toBe(2)
    })

    it('comes to a long break after every long_break_every rounds, a short one otherwise, focus after a break', () => {
        expect(nextPhaseOf(session({ ...LONG, phaseIndex: 6 }))).toBe('long_break')
        expect(nextPhaseOf(session({ ...LONG, phaseIndex: 4 }))).toBe('short_break')
        expect(nextPhaseOf(session({ phaseIndex: 6 }))).toBe('short_break')
        expect(nextPhaseOf(session({ ...LONG, phase: 'long_break', phaseIndex: 7 }))).toBe('focus')
        expect(nextPhaseOf(session({ phase: 'short_break', phaseIndex: 3 }))).toBe('focus')
    })

    it('knows each phase by its length', () => {
        expect(phaseMinutes(session())).toBe(25)
        expect(phaseMinutes(session({ phase: 'short_break' }))).toBe(5)
        expect(phaseMinutes(session({ ...LONG, phase: 'long_break' }))).toBe(15)
        // No long break in the cycle: its length falls back to the short one's.
        expect(phaseMinutes(session(), 'long_break')).toBe(5)
    })
})

describe("the ring's clock", () => {
    it('counts down to the end of the phase on the server, frozen while paused, nothing once over', () => {
        expect(remainingMs(session(), AT)).toBe((18 * 60 + 42) * 1000)
        expect(remainingMs(session(), Date.parse('2026-11-22T15:10:00.000Z'))).toBe(0)
        expect(remainingMs(session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 90_000 }), AT)).toBe(
            90_000
        )
        expect(remainingMs(session({ status: 'ended', phaseEndsAt: null }), AT)).toBe(0)
        expect(remainingMs(session({ status: 'running', phaseEndsAt: null }), AT)).toBe(0)
    })

    it('says minutes and seconds, rounding up so 00:00 is the end', () => {
        expect(clockText((18 * 60 + 42) * 1000)).toBe('18:42')
        expect(clockText(1)).toBe('00:01')
        expect(clockText(0)).toBe('00:00')
        expect(clockText(120 * 60_000)).toBe('120:00')
    })

    it('draws how much of the phase is gone, 0 to 1', () => {
        expect(phaseGone(session(), AT)).toBeCloseTo(1 - (18 * 60 + 42) / (25 * 60))
        expect(phaseGone(session({ phaseEndsAt: '2026-11-22T16:00:00.000Z' }), AT)).toBe(0)
        expect(phaseGone(session(), Date.parse('2026-11-22T15:30:00.000Z'))).toBe(1)
    })

    it('chooses the long number for a phase of 100 minutes or more', () => {
        expect(isLongClock(session({ focusMinutes: 100 }))).toBe(true)
        expect(isLongClock(session({ focusMinutes: 99 }))).toBe(false)
    })
})

describe('which state of a room is the later (D-225)', () => {
    it('of one session the higher version, of two the one started later', () => {
        expect(isLater(session({ version: 4 }), session())).toBe(true)
        expect(isLater(session({ version: 3 }), session())).toBe(false)
        expect(isLater(session({ version: 2 }), session())).toBe(false)
        const next = session({ id: 's2', version: 0, startedAt: '2026-11-22T15:00:00.000Z' })
        expect(isLater(next, session())).toBe(true)
        expect(isLater(session(), next)).toBe(false)
    })

    it('puts on the room only a running or paused one, as GET /servers has it', () => {
        const room = roomSessionOf(session())
        expect(room).toMatchObject({ id: 's1', status: 'running', version: 3, hostId: 'an' })
        expect(room).not.toHaveProperty('channelId')
        expect(roomSessionOf(session({ status: 'paused' }))?.status).toBe('paused')
        expect(roomSessionOf(session({ status: 'ended' }))).toBeNull()
        expect(roomSessionOf(session({ kind: 'solo', status: 'waiting' }))).toBeNull()
    })
})

describe('the words of a cycle and of minutes', () => {
    it('names a cycle short and in full (07 S-ROOM-03, the toasts)', () => {
        const cycle = sessionCycle(session())
        expect(cycle).toEqual({ focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null })
        expect(cycleName(t, cycle)).toBe('25/5')
        expect(cycleSummary(t, cycle)).toBe('25 phút tập trung · nghỉ 5 · không nghỉ dài')
        const long = { focus: 45, shortBreak: 10, longBreak: 20, longBreakEvery: 4 }
        expect(cycleName(t, long)).toBe('45/10 · nghỉ dài 20 sau mỗi 4 vòng')
        expect(cycleSummary(t, long)).toBe('45 phút tập trung · nghỉ 10 · nghỉ dài 20 sau mỗi 4 vòng')
    })

    it('writes minutes, and hours from 60 (07 › Quy ước)', () => {
        expect(studiedText(t, 45 * 60 + 59)).toBe('45 phút')
        expect(studiedText(t, 114 * 60)).toBe('1 giờ 54 phút')
        expect(studiedText(t, 120 * 60)).toBe('2 giờ')
        expect(studiedText(t, -5)).toBe('0 phút')
    })
})
