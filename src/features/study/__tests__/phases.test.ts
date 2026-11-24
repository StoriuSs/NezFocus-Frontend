import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import '@/i18n/study'
import { cycleName, cycleSummary } from '../lib/cycle-words'
import { studiedText } from '../lib/durations'
import { sessionLineText, tabText } from '../lib/phase-words'
import { DAY_CAP_SECONDS, dayStartOf, runningBeforeDay, streakShown, todaySecondsAt } from '../lib/today'
import {
    clockText,
    isLater,
    isLongClock,
    minutesLeft,
    nextPhaseOf,
    phaseGone,
    phaseMinutes,
    remainingMs,
    roomSessionOf,
    roundOf,
    sessionCycle,
    untilMinuteChanges
} from '../lib/phases'
import { AT, session, solo, waitingSolo } from '@/test/study-sessions'
import { expiredOf, soloSecondsAt, waitLeftMs } from '../lib/solo'

const t = i18n.getFixedT('vi', 'study')
const shell = i18n.getFixedT('vi', 'common')
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

    it('says the whole minutes the clock shows, and when that number changes (C-19 list)', () => {
        expect(minutesLeft((18 * 60 + 42) * 1000)).toBe(18)
        expect(minutesLeft(18 * 60 * 1000 + 1)).toBe(18)
        expect(minutesLeft(18 * 60 * 1000)).toBe(18)
        // 01:00 still says a minute; 00:59 is under one.
        expect(minutesLeft(59_001)).toBe(1)
        expect(minutesLeft(59_000)).toBe(0)
        // 18:42 shows 18 until the clock reads 17:59, 43 seconds on.
        expect(untilMinuteChanges((18 * 60 + 42) * 1000)).toBe(43_000)
        expect(minutesLeft((18 * 60 + 42) * 1000 - 43_000)).toBe(17)
        expect(minutesLeft((18 * 60 + 42) * 1000 - 42_999)).toBe(18)
        // Under a minute, nothing changes until the phase ends.
        expect(untilMinuteChanges(30_000)).toBe(30_000)
    })

    it('chooses the long number for a phase of 100 minutes or more', () => {
        expect(isLongClock(session({ focusMinutes: 100 }))).toBe(true)
        expect(isLongClock(session({ focusMinutes: 99 }))).toBe(false)
    })
})

describe("one's minutes today (D-224, D-231)", () => {
    const today = (countedUntil: string | null, todaySeconds = 1200) => ({
        todaySeconds,
        countedUntil,
        streak: 5,
        readAt: '2026-11-22T14:47:18.000Z'
    })
    /** 22/11 began at 00:00 in Hồ Chí Minh (UTC+7). */
    const DAY = Date.parse('2026-11-21T17:00:00.000Z')

    it('knows when today began in the zone given', () => {
        expect(dayStartOf(AT, 'Asia/Ho_Chi_Minh')).toBe(DAY)
        expect(dayStartOf(AT, 'UTC')).toBe(Date.parse('2026-11-22T00:00:00.000Z'))
    })

    it('starts from 0 at midnight: a last count from yesterday wrote yesterday, the stretch counts from 00:00', () => {
        // Focus from 23:50 yesterday, counted to 23:55; at 00:10 today: 10 minutes, not 20 nor yesterday's.
        const late = session({
            phaseStartedAt: '2026-11-21T16:50:00.000Z',
            stretchStartedAt: '2026-11-21T16:50:00.000Z',
            phaseEndsAt: '2026-11-21T17:15:00.000Z'
        })
        const at = Date.parse('2026-11-21T17:10:00.000Z')
        expect(todaySecondsAt(today('2026-11-21T16:55:00.000Z', 5 * 3600), late, at, DAY)).toBe(600)
    })

    it('keeps the focus run to midnight, not counted yet, for yesterday until a count writes it (D-236)', () => {
        // Focus from 23:50 yesterday, counted to 23:55; at 00:10 today: 5 minutes of yesterday not counted yet.
        const late = session({
            phaseStartedAt: '2026-11-21T16:50:00.000Z',
            stretchStartedAt: '2026-11-21T16:50:00.000Z',
            phaseEndsAt: '2026-11-21T17:15:00.000Z'
        })
        expect(runningBeforeDay(today('2026-11-21T16:55:00.000Z'), late, DAY)).toBe(300)
        // A count since midnight wrote it; paused or in none, nothing runs.
        expect(runningBeforeDay(today('2026-11-21T17:05:00.000Z'), late, DAY)).toBe(0)
        expect(runningBeforeDay(today('2026-11-21T16:55:00.000Z'), null, DAY)).toBe(0)
        expect(runningBeforeDay(today(null), late, DAY)).toBe(0)
    })

    it('shows the streak one more once today reaches 15 minutes before a count wrote it (STUDY-07)', () => {
        // 14 minutes counted to 21:47:00: 14:18 at 21:47:18, 15:01 at 21:48:01.
        expect(streakShown(today('2026-11-22T14:47:00.000Z', 14 * 60), session(), AT, DAY)).toBe(5)
        expect(streakShown(today('2026-11-22T14:47:00.000Z', 14 * 60), session(), AT + 43_000, DAY)).toBe(6)
        // A count already took today past 15: its streak has today in it.
        expect(streakShown(today('2026-11-22T14:47:00.000Z', 16 * 60), session(), AT, DAY)).toBe(5)
    })

    describe('across midnight, the last count being of yesterday (REQ-STUDY-07)', () => {
        // A focus from 23:45 yesterday to 00:20, in Hồ Chí Minh.
        const late = session({
            phaseStartedAt: '2026-11-21T16:45:00.000Z',
            stretchStartedAt: '2026-11-21T16:45:00.000Z',
            phaseEndsAt: '2026-11-21T17:20:00.000Z'
        })
        const at = (clock: string) => Date.parse(`2026-11-21T${clock}:00.000Z`)

        it('keeps the streak of a yesterday that reached 15 minutes, one more as today does', () => {
            const day = today('2026-11-21T16:55:00.000Z', 20 * 60)
            expect(streakShown(day, late, at('17:10'), DAY)).toBe(5)
            expect(streakShown(day, late, at('17:16'), DAY)).toBe(6)
        })

        it('breaks it when yesterday fell short even with the focus run on to midnight: 0, then 1', () => {
            // 5 minutes counted to 23:58; 2 more to midnight: 7.
            const day = today('2026-11-21T16:58:00.000Z', 5 * 60)
            expect(streakShown(day, late, at('17:10'), DAY)).toBe(0)
            expect(streakShown(day, late, at('17:16'), DAY)).toBe(1)
        })

        it('counts yesterday one more when only the focus run on to midnight took it to 15 minutes', () => {
            // 800 seconds counted to 23:50; 10 more minutes to midnight: 1400.
            const day = today('2026-11-21T16:50:00.000Z', 800)
            expect(streakShown(day, late, at('17:10'), DAY)).toBe(6)
            expect(streakShown(day, late, at('17:16'), DAY)).toBe(7)
        })
    })

    it('shows no more than the 16-hour cap (D-224)', () => {
        expect(todaySecondsAt(today('2026-11-22T14:41:00.000Z', DAY_CAP_SECONDS - 60), session(), AT, DAY)).toBe(
            DAY_CAP_SECONDS
        )
    })

    it('adds the running focus from where the last count stopped, or where the stretch began if later', () => {
        // Counted to 21:47:00 (joined then): 18 seconds more at 21:47:18.
        expect(todaySecondsAt(today('2026-11-22T14:47:00.000Z'), session(), AT, DAY)).toBe(1218)
        // Counted to before the stretch (the break before it): from the stretch's start, 21:41.
        expect(todaySecondsAt(today('2026-11-22T14:30:00.000Z'), session(), AT, DAY)).toBe(1200 + 6 * 60 + 18)
    })

    it('counts no further than the phase is due to end, and adds nothing paused, in a break or in no session', () => {
        expect(
            todaySecondsAt(today('2026-11-22T15:00:00.000Z'), session(), Date.parse('2026-11-22T15:10:00Z'), DAY)
        ).toBe(1200 + 6 * 60)
        const paused = session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 90_000 })
        expect(todaySecondsAt(today('2026-11-22T14:47:00.000Z'), paused, AT, DAY)).toBe(1200)
        const rest = session({ phase: 'short_break', phaseIndex: 3, stretchStartedAt: null })
        expect(todaySecondsAt(today('2026-11-22T14:47:00.000Z'), rest, AT, DAY)).toBe(1200)
        expect(todaySecondsAt(today(null), session(), AT, DAY)).toBe(1200)
        expect(todaySecondsAt(today('2026-11-22T14:47:00.000Z'), null, AT, DAY)).toBe(1200)
        // A count written after now (a clock a little behind): nothing taken away.
        expect(todaySecondsAt(today('2026-11-22T14:48:00.000Z'), session(), AT, DAY)).toBe(1200)
    })
})

describe('the phase away from the room, in the shell words (C-19, X-01)', () => {
    it('says the phase and its minutes, "under a minute" in the last, the phase alone while paused', () => {
        expect(sessionLineText(shell, session(), AT)).toBe('Tập trung · còn 18 phút')
        expect(sessionLineText(shell, session(), Date.parse('2026-11-22T15:05:30.000Z'))).toBe(
            'Tập trung · còn dưới 1 phút'
        )
        expect(sessionLineText(shell, session({ phase: 'long_break' }), AT)).toBe('Nghỉ dài · còn 18 phút')
        expect(sessionLineText(shell, session({ status: 'paused', pausedRemainingMs: 1000 }), AT)).toBe('Tạm dừng')
    })

    it('titles the tab with the clock by the second; paused, the number still (07 S-ROOM-05)', () => {
        expect(tabText(shell, session(), AT)).toBe('18:42 · Tập trung')
        expect(tabText(shell, session({ phase: 'short_break' }), AT + 1000)).toBe('18:41 · Nghỉ ngắn')
        const paused = session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_122_000 })
        expect(tabText(shell, paused, AT + 60_000)).toBe('18:42 · Tạm dừng')
    })

    it('says a Solo waiting for Học tiếp without a number (08 S-STUDY-02)', () => {
        expect(tabText(shell, waitingSolo(), AT)).toBe('Hết giờ nghỉ')
        expect(sessionLineText(shell, waitingSolo(), AT)).toBe('Hết giờ nghỉ')
    })
})

describe("a Solo's seconds and wait (D-234, REQ-STUDY-05)", () => {
    it('adds the focus stretch running to the seconds counted, up to the phase’s end; nothing while paused or waiting', () => {
        expect(soloSecondsAt(solo(), AT)).toBe(18 * 60 + 18)
        expect(soloSecondsAt(solo({ countedSeconds: 600 }), AT)).toBe(600 + 18 * 60 + 18)
        // Past its phase's end (the tab asleep): no further than the end.
        expect(soloSecondsAt(solo(), Date.parse('2026-11-22T15:30:00.000Z'))).toBe(50 * 60)
        expect(soloSecondsAt(solo({ status: 'paused', stretchStartedAt: null, countedSeconds: 900 }), AT)).toBe(900)
        expect(soloSecondsAt(waitingSolo(), AT)).toBe(50 * 60)
    })

    it('counts down the 10 minutes of a wait', () => {
        expect(waitLeftMs(waitingSolo(), Date.parse('2026-11-22T15:30:48.000Z'))).toBe(8 * 60_000 + 12_000)
        expect(waitLeftMs(solo(), AT)).toBe(0)
    })

    it('finds a waiting Solo read again past its wait expired at its break’s end, not before', () => {
        expect(expiredOf(waitingSolo(), Date.parse('2026-11-22T15:38:59.000Z'))).toBeNull()
        expect(expiredOf(waitingSolo(), Date.parse('2026-11-22T15:41:00.000Z'))).toMatchObject({
            status: 'ended',
            endedReason: 'expired',
            endedAt: '2026-11-22T15:29:00.000Z',
            countedSeconds: 3000
        })
        expect(expiredOf(solo(), Date.parse('2026-11-22T16:00:00.000Z'))).toBeNull()
        // A break paused 6 minutes ended later than it began plus its length: 10 minutes before the wait's end.
        const pausedBreak = waitingSolo({
            phaseStartedAt: '2026-11-22T15:13:00.000Z',
            waitingUntil: '2026-11-22T15:45:00.000Z'
        })
        expect(expiredOf(pausedBreak, Date.parse('2026-11-22T15:50:00.000Z'))?.endedAt).toBe('2026-11-22T15:35:00.000Z')
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
