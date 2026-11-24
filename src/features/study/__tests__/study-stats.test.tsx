import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { emitRealtimeEvent } from '@/features/realtime/lib/realtime-events'
import { useRealtimeStore } from '@/features/realtime/realtime.store'
import { noteServerTime } from '@/lib/server-clock'
import { setTimeZoneSource } from '@/lib/time-zones'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import { solo } from '@/test/study-sessions'
import type { StatsPeriod } from '../lib/periods'
import type {
    AnySession,
    FocusSession,
    SoloState,
    StudyHistoryLine,
    StudyHistoryPage,
    StudyPeriodStats,
    StudyToday
} from '../types'

const studyApi = {
    startRoomSession: vi.fn(),
    commandSession: vi.fn(),
    changeSessionCycle: vi.fn(),
    fetchStudyToday: vi.fn<() => Promise<StudyToday>>(),
    fetchStudyWeek: vi.fn(),
    fetchStudyPeriod: vi.fn<(period: StatsPeriod) => Promise<{ stats: StudyPeriodStats; today: StudyToday }>>(),
    fetchStudyHistory: vi.fn<(period: StatsPeriod, cursor: string | null) => Promise<StudyHistoryPage>>(),
    fetchSolo: vi.fn<() => Promise<SoloState>>(),
    startSolo: vi.fn<(cycle: unknown, key: string) => Promise<FocusSession>>()
}
vi.mock('../api/study.api', () => studyApi)

const { default: StatsBody } = await import('../components/stats/StatsBody')
const { default: PeriodPicker } = await import('../components/stats/PeriodPicker')
const { useStatsPeriod } = await import('../hooks/useStatsPeriod')
const { listenForSessions } = await import('../api/liveSessions')
const periods = await import('../lib/periods')
const { periodNumbers } = await import('../lib/period-stats')
const { lineSecondsAt, lineTime, lineTitle, lineWhen } = await import('../lib/history')

const MIN = 60
/** 21:47:18 on Sunday 22/11/2026 in Hồ Chí Minh: 08's moment, on this month's days. */
const READ_AT = '2026-11-22T14:47:18.000Z'

/** 08's four weeks (luật 9) on this month's: each week's minutes, Monday first. */
const WEEKS: Record<string, number[]> = {
    '2026-10-19': [10, 0, 25, 0, 30, 20, 5],
    '2026-10-26': [30, 45, 20, 50, 25, 60, 40],
    '2026-11-02': [35, 20, 55, 30, 15, 45, 25],
    '2026-11-09': [0, 20, 0, 30, 25, 0, 40],
    '2026-11-16': [0, 50, 40, 35, 60, 45, 45]
}
const addDays = (date: string, days: number) =>
    new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
const minutesOn = (date: string): number => {
    for (const [monday, minutes] of Object.entries(WEEKS)) {
        for (let index = 0; index < 7; index++) if (addDays(monday, index) === date) return minutes[index] ?? 0
    }
    return 0
}
const day = (date: string) => ({
    date,
    focusedSeconds: date > '2026-11-22' ? 0 : minutesOn(date) * MIN,
    roomSeconds: 0,
    soloSeconds: 0
})
const days = (start: string, end: string) => {
    const all = []
    for (let date = start; date <= end; date = addDays(date, 1)) all.push(day(date))
    return all
}

const today = (more: Partial<StudyToday> = {}): StudyToday => ({
    todaySeconds: 45 * MIN,
    countedUntil: null,
    streak: 6,
    readAt: READ_AT,
    ...more
})

/** World A's numbers of a period (08 S-STUDY-03 › Dữ liệu), as GET /me/study-stats gives them. */
function statsOf(period: StatsPeriod, more: Partial<StudyPeriodStats> = {}): StudyPeriodStats {
    const base = {
        view: period.view,
        today: '2026-11-22',
        period: { start: period.start, end: period.end },
        days: days(period.start, period.end),
        averageSeconds: 0,
        allTimeSeconds: 86 * 3600,
        firstDate: '2026-09-01',
        streak: { current: 6, longest: 14 },
        todaySeconds: 45 * MIN,
        countedUntil: null,
        readAt: READ_AT,
        grid: period.view === 'week' ? days(addDays(period.start, -21), period.end) : null,
        bestOtherWeekSeconds: period.view === 'week' ? 300 * MIN : null
    }
    if (period.view === 'month') {
        return {
            ...base,
            totalSeconds: 655 * MIN,
            roomSeconds: 400 * MIN,
            soloSeconds: 255 * MIN,
            previousSeconds: 500 * MIN,
            previousPeriodSeconds: 700 * MIN,
            ...more
        }
    }
    if (period.start === '2026-11-09') {
        return {
            ...base,
            totalSeconds: 115 * MIN,
            roomSeconds: 70 * MIN,
            soloSeconds: 45 * MIN,
            previousSeconds: 225 * MIN,
            previousPeriodSeconds: 225 * MIN,
            ...more
        }
    }
    return {
        ...base,
        totalSeconds: 275 * MIN,
        roomSeconds: 186 * MIN,
        soloSeconds: 89 * MIN,
        previousSeconds: 115 * MIN,
        previousPeriodSeconds: 115 * MIN,
        ...more
    }
}

const line = (more: Partial<StudyHistoryLine> = {}): StudyHistoryLine => ({
    sessionId: 'room-1',
    kind: 'room',
    roomName: 'Phòng học im lặng',
    roomDeleted: false,
    serverName: 'Ôn thi Giải tích 2',
    firstJoinedAt: '2026-11-21T13:00:00.000Z',
    lastLeftAt: '2026-11-21T13:50:00.000Z',
    seconds: 45 * MIN,
    joinCount: 1,
    ...more
})
/** The week's history: the room one is in first, then the latest first. */
const HISTORY: StudyHistoryLine[] = [
    line({ sessionId: 'open', firstJoinedAt: '2026-11-22T14:11:00.000Z', lastLeftAt: null, seconds: 31 * MIN }),
    line({
        sessionId: 'solo-0',
        kind: 'solo',
        roomName: null,
        serverName: null,
        firstJoinedAt: '2026-11-22T08:20:00.000Z',
        lastLeftAt: '2026-11-22T08:34:00.000Z',
        seconds: 14 * MIN
    }),
    line({ sessionId: 'room-1' })
]

let more: Partial<StudyPeriodStats> = {}
const holdPeriods = (extra: Partial<StudyPeriodStats> = {}, day: StudyToday = today()) => {
    more = extra
    studyApi.fetchStudyToday.mockResolvedValue(day)
    studyApi.fetchStudyPeriod.mockImplementation(async (period) => ({ stats: statsOf(period, more), today: day }))
}

function Where() {
    const location = useLocation()
    return <span data-testid='where'>{location.pathname + location.search}</span>
}

function StatsPage({ joined, own }: { joined: AnySession | null; own: AnySession | null }) {
    const { period, show } = useStatsPeriod()
    return (
        <>
            <PeriodPicker period={period} show={show} joined={joined} solo={own} />
            <StatsBody period={period} joined={joined} solo={own} />
            <Link to='/study/stats'>Thống kê</Link>
        </>
    )
}

let client: QueryClient
function open(url = '/study/stats', own: AnySession | null = null, joined: AnySession | null = null) {
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <Toaster />
                <MemoryRouter initialEntries={[url]}>
                    <Where />
                    <Routes>
                        <Route path='/study/stats' element={<StatsPage joined={joined} own={own} />} />
                        <Route path='*' element={null} />
                    </Routes>
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}
const where = () => screen.getByTestId('where').textContent

beforeAll(async () => {
    await i18n.changeLanguage('vi')
    setTimeZoneSource(() => 'Asia/Ho_Chi_Minh')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
    setTimeZoneSource(() => undefined)
})
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    noteServerTime(READ_AT)
    useRealtimeStore.setState({ socket: 'connected', downSince: null, browserOnline: true })
    for (const call of Object.values(studyApi)) call.mockReset()
    studyApi.fetchSolo.mockResolvedValue({
        session: null,
        startCycle: { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null }
    })
    studyApi.fetchStudyHistory.mockResolvedValue({ items: HISTORY, hasMore: false })
    holdPeriods()
})
afterEach(() => {
    toast.dismiss()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    // Online again for the query client too, or the next test's reads wait for the network.
    window.dispatchEvent(new Event('online'))
})

describe('the periods (08 S-STUDY-03 › Chọn kỳ, D-235)', () => {
    it('reads a week Monday to Sunday, a month first to last', () => {
        expect(periods.periodOf('week', '2026-11-19')).toEqual({
            view: 'week',
            date: '2026-11-19',
            start: '2026-11-16',
            end: '2026-11-22'
        })
        expect(periods.periodOf('month', '2028-02-10')).toMatchObject({ start: '2028-02-01', end: '2028-02-29' })
    })

    it('takes the URL’s period, this week when it names none or no real day', () => {
        const from = (query: string) => periods.periodFromSearch(new URLSearchParams(query), '2026-11-22')
        expect(from('view=week&date=2026-11-09')).toMatchObject({ view: 'week', start: '2026-11-09' })
        expect(from('view=month&month=2026-10')).toMatchObject({ view: 'month', date: '2026-10-01' })
        expect(from('view=month&month=2026-11')).toMatchObject({ view: 'month', date: '2026-11-22' })
        expect(from('view=week&date=2026-02-30')).toMatchObject({ view: 'week', start: '2026-11-16' })
        expect(from('')).toMatchObject({ view: 'week', start: '2026-11-16' })
        expect(periods.searchOf(from('view=month&month=2026-10'))).toBe('?view=month&month=2026-10')
    })

    it('goes back and on by a week or a month, across a year', () => {
        const week = periods.periodOf('week', '2027-01-03')
        expect(periods.shiftPeriod(week, -1, '2027-01-03')).toMatchObject({ start: '2026-12-21', end: '2026-12-27' })
        const january = periods.periodOf('month', '2027-01-03')
        expect(periods.shiftPeriod(january, -1, '2027-01-03')).toMatchObject({
            start: '2026-12-01',
            date: '2026-12-01'
        })
        expect(periods.shiftPeriod(periods.periodOf('month', '2026-12-01'), 1, '2027-01-03')).toMatchObject({
            date: '2027-01-03'
        })
        // Back on the week holding today, its day is today: "Tháng" then opens this month (D-235).
        const back = periods.shiftPeriod(periods.periodOf('week', '2026-09-24'), 1, '2026-10-01')
        expect(back).toMatchObject({ start: '2026-09-28', date: '2026-10-01' })
        expect(periods.switchView(back, 'month')).toMatchObject({ start: '2026-10-01' })
    })

    it('keeps the day looked at from a week to its month and back', () => {
        const week = periods.periodOf('week', '2026-10-05')
        const month = periods.switchView(week, 'month')
        expect(month).toMatchObject({ start: '2026-10-01', end: '2026-10-31' })
        expect(periods.switchView(month, 'week')).toMatchObject({ start: '2026-10-05' })
    })

    it('stops "›" at the period holding today and "‹" at the one holding the first day counted', () => {
        const thisWeek = periods.periodOf('week', '2026-11-22')
        expect(periods.isLatest(thisWeek, '2026-11-22')).toBe(true)
        expect(periods.isLatest(periods.periodOf('week', '2026-11-15'), '2026-11-22')).toBe(false)
        expect(periods.isEarliest(thisWeek, '2026-11-18')).toBe(true)
        expect(periods.isEarliest(thisWeek, '2026-11-15')).toBe(false)
        expect(periods.isEarliest(thisWeek, null)).toBe(true)
    })

    it('counts the days gone by, today in; lays a month out Monday first', () => {
        expect(periods.daysGoneBy(periods.periodOf('month', '2026-10-18'), '2026-10-18')).toBe(18)
        expect(periods.daysGoneBy(periods.periodOf('week', '2026-11-09'), '2026-11-22')).toBe(7)
        expect(periods.daysGoneBy(periods.periodOf('week', '2026-11-30'), '2026-11-22')).toBe(0)
        const october = periods.monthWeeks(periods.periodOf('month', '2026-10-18'))
        expect(october).toHaveLength(5)
        expect(october[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
        expect(october[4]).toEqual([
            '2026-10-26',
            '2026-10-27',
            '2026-10-28',
            '2026-10-29',
            '2026-10-30',
            '2026-10-31',
            null
        ])
    })
})

describe('the numbers as they stand now (D-235)', () => {
    const thisWeek = periods.periodOf('week', '2026-11-22')

    it('adds today’s gain to its day, the period, the side of the session, the mean, the comparison and the lifetime', () => {
        const now = periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-22', 63 * MIN, 'solo')
        expect(now.days.at(-1)).toMatchObject({ seconds: 63 * MIN, today: true, ahead: false })
        expect(now.total).toBe(293 * MIN)
        expect([now.room, now.solo]).toEqual([186 * MIN, 107 * MIN])
        expect(now.average).toBe(Math.floor((293 * MIN) / 7))
        expect(now.difference).toBe(178 * MIN)
        expect(now.allTime).toBe(86 * 3600 + 18 * MIN)
        expect(now.grid?.at(-1)?.seconds).toBe(63 * MIN)
        expect(periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-22', 63 * MIN, 'room').room).toBe(204 * MIN)
    })

    it('adds nothing to a period gone by but the lifetime, and nothing from a read of another day', () => {
        const before = periods.periodOf('week', '2026-11-09')
        const then = periodNumbers(statsOf(before), before, '2026-11-22', 63 * MIN, 'solo')
        expect(then.total).toBe(115 * MIN)
        expect(then.allTime).toBe(86 * 3600 + 18 * MIN)
        const yesterday = periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-23', 10 * MIN, null)
        expect(yesterday.total).toBe(275 * MIN)
    })

    it('puts the focus run to midnight, not counted yet, on yesterday, and on every total (D-236)', () => {
        const base = periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-22', 63 * MIN, 'solo')
        const late = periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-22', 63 * MIN, 'solo', {
            date: '2026-11-21',
            seconds: 15 * MIN
        })
        expect(late.days.at(-2)?.seconds).toBe((base.days.at(-2)?.seconds ?? 0) + 15 * MIN)
        expect(late.days.at(-1)?.seconds).toBe(base.days.at(-1)?.seconds)
        expect(late.total).toBe(base.total + 15 * MIN)
        expect(late.solo).toBe(base.solo + 15 * MIN)
        expect(late.room).toBe(base.room)
        expect(late.allTime).toBe(base.allTime + 15 * MIN)
        expect(late.grid?.at(-2)?.seconds).toBe((base.grid?.at(-2)?.seconds ?? 0) + 15 * MIN)
    })

    it('is one’s best week once its total now passes every other week’s', () => {
        expect(periodNumbers(statsOf(thisWeek), thisWeek, '2026-11-22', 45 * MIN, null).best).toBe(false)
        const close = statsOf(thisWeek, { bestOtherWeekSeconds: 280 * MIN })
        expect(periodNumbers(close, thisWeek, '2026-11-22', 50 * MIN, null).best).toBe(false)
        expect(periodNumbers(close, thisWeek, '2026-11-22', 51 * MIN, null).best).toBe(true)
        expect(
            periodNumbers(statsOf(thisWeek, { bestOtherWeekSeconds: null }), thisWeek, '2026-11-22', 600 * MIN, null)
                .best
        ).toBe(false)
    })
})

describe('a line of the history (C-47, D-230)', () => {
    const t = i18n.getFixedT('vi', 'study')
    const zone = 'Asia/Ho_Chi_Minh'

    it('names the place as one may know it now', () => {
        expect(lineTitle(t, line())).toBe('Phòng học im lặng · Ôn thi Giải tích 2')
        expect(lineTitle(t, line({ kind: 'solo', roomName: null, serverName: null }))).toBe('Học một mình')
        expect(lineTitle(t, line({ roomName: null, roomDeleted: true }))).toBe('Phòng đã bị xóa · Ôn thi Giải tích 2')
        expect(lineTitle(t, line({ roomName: null }))).toBe('Một phòng của Ôn thi Giải tích 2')
        expect(lineTitle(t, line({ roomName: null, serverName: null }))).toBe('Một phòng học')
    })

    it('says when, past midnight with the end’s day, another year’s with its year, joins from 2', () => {
        expect(lineWhen(t, line(), '2026-11-22', 'vi', zone)).toBe('T7 21/11 · 20:00 – 20:50')
        expect(lineWhen(t, line({ lastLeftAt: null }), '2026-11-22', 'vi', zone)).toBe('T7 21/11 · 20:00 – bây giờ')
        const late = line({
            firstJoinedAt: '2026-12-31T16:30:00.000Z',
            lastLeftAt: '2026-12-31T17:40:00.000Z',
            joinCount: 2
        })
        expect(lineWhen(t, late, '2027-01-03', 'vi', zone)).toBe('T5 31/12/2026 · 23:30 – 00:40 (T6) · vào 2 lần')
    })

    it('says minutes as 07 does, under a minute for 1 to 59 seconds', () => {
        expect(lineTime(t, 45)).toBe('dưới 1 phút')
        expect(lineTime(t, 65 * MIN)).toBe('1 giờ 5 phút')
        expect(lineTime(t, 540 * MIN)).toBe('9 giờ')
        expect(lineTime(t, 0)).toBe('0 phút')
    })

    it('grows the line one is in by what today gained since the history was read, no other', () => {
        const running = solo()
        const counted = today({ countedUntil: '2026-11-22T14:40:00.000Z' })
        const now = Date.parse(READ_AT)
        const open = line({ sessionId: running.id, lastLeftAt: null, seconds: 11 * MIN })
        const at = { session: running, today: counted, now }
        expect(lineSecondsAt(open, { ...at, countedToday: 45 * MIN, todaySeconds: 52 * MIN })).toBe(18 * MIN)
        expect(
            lineSecondsAt(line({ sessionId: running.id }), { ...at, countedToday: 45 * MIN, todaySeconds: 52 * MIN })
        ).toBe(45 * MIN)
        // A new day since the read: nothing taken off.
        expect(lineSecondsAt(open, { ...at, countedToday: 45 * MIN, todaySeconds: 2 * MIN })).toBe(11 * MIN)
        // Read before today was: the focus running after today's count.
        expect(lineSecondsAt(open, { ...at, countedToday: null, todaySeconds: 0 })).toBe(11 * MIN + 7 * MIN + 18)
        expect(lineSecondsAt(open, { ...at, countedToday: null, todaySeconds: 0, session: null })).toBe(11 * MIN)
    })

    it('grows the line one is in past midnight by the focus run since the last count, read the day before (D-236)', () => {
        const running = solo()
        const now = Date.parse(READ_AT)
        /** 22/11 began at 00:00 in Hồ Chí Minh. */
        const DAY = Date.parse('2026-11-21T17:00:00.000Z')
        const open = line({ sessionId: running.id, lastLeftAt: null, seconds: 11 * MIN })
        const at = { session: running, today: today({ countedUntil: '2026-11-21T16:47:00.000Z' }), now }
        // Read yesterday (45 counted then); today 2 minutes so far, 13 more before midnight not counted yet.
        const since = { readDay: DAY - 24 * 3600_000, dayStart: DAY, before: 13 * MIN }
        expect(lineSecondsAt(open, { ...at, ...since, countedToday: 45 * MIN, todaySeconds: 2 * MIN })).toBe(26 * MIN)
        // Read today: as before.
        expect(
            lineSecondsAt(open, {
                ...at,
                readDay: DAY,
                dayStart: DAY,
                before: 0,
                countedToday: 45 * MIN,
                todaySeconds: 52 * MIN
            })
        ).toBe(18 * MIN)
    })
})

describe('the Stats page (08 S-STUDY-03)', () => {
    it('shows this week: chart and split, history, streak, totals, comparison, mean, lifetime, 4 weeks (default)', async () => {
        open()
        expect(await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })).toBeVisible()
        expect(screen.getByText('Phòng học 3 giờ 6 phút · Một mình 1 giờ 29 phút')).toBeVisible()
        expect(screen.getByText('6 ngày liên tiếp')).toBeInTheDocument()
        expect(screen.getByText('Hôm nay 45 phút · đã đủ 15 phút')).toBeVisible()
        expect(screen.queryByRole('link', { name: /Xem thống kê/ })).toBeNull()
        expect(screen.getByRole('heading', { name: 'Tuần này' })).toBeVisible()
        expect(screen.getByText('4 giờ 35 phút')).toBeVisible()
        expect(screen.getByText(/^\+2 giờ 40 phút so với tuần trước/)).toBeVisible()
        expect(screen.getByText('Trung bình 39 phút / ngày')).toBeVisible()
        expect(screen.getByText('86 giờ')).toBeVisible()
        expect(screen.getByRole('heading', { name: '4 tuần · 26/10 – 22/11' })).toBeVisible()
        const history = screen.getByRole('region', { name: 'Lịch sử phiên' })
        const rows = await within(history).findAllByRole('listitem')
        expect(rows[0]).toHaveTextContent(
            'Phòng học im lặng · Ôn thi Giải tích 2CN 22/11 · 21:11 – bây giờĐang học31 phút'
        )
        expect(rows[1]).toHaveTextContent('Học một mìnhCN 22/11 · 15:20 – 15:3414 phút')
        // The period in the Header: this week, "›" off.
        expect(screen.getByText('16/11 – 22/11')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Kỳ sau' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('button', { name: 'Kỳ trước' })).toHaveAttribute('aria-disabled', 'false')
        // No Runtime on an ordinary week.
        expect(document.querySelector('img')).toBeNull()
        await expectNoA11yViolations()
    })

    it('grows with the focus running: today, the week, its Solo side, the comparison, the line in it', async () => {
        holdPeriods({}, today({ countedUntil: '2026-11-22T14:29:00.000Z' }))
        studyApi.fetchStudyHistory.mockResolvedValue({
            items: [
                line({
                    sessionId: 'solo-1',
                    kind: 'solo',
                    roomName: null,
                    serverName: null,
                    firstJoinedAt: '2026-11-22T14:29:00.000Z',
                    lastLeftAt: null,
                    seconds: 0
                })
            ],
            hasMore: false
        })
        open('/study/stats', solo())
        expect(await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 53 phút' })).toBeVisible()
        expect(screen.getByText('Hôm nay 1 giờ 3 phút · đã đủ 15 phút')).toBeVisible()
        expect(screen.getByText('Phòng học 3 giờ 6 phút · Một mình 1 giờ 47 phút')).toBeVisible()
        expect(screen.getByText(/^\+2 giờ 58 phút so với tuần trước/)).toBeVisible()
        expect(screen.getByText('Trung bình 41 phút / ngày')).toBeVisible()
        expect(await screen.findByText('18 phút')).toBeVisible()
    })

    it('reads the period and the history again after each count (streak.updated)', async () => {
        const stop = listenForSessions(client, () => false)
        open()
        await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })
        await waitFor(() => expect(studyApi.fetchStudyHistory).toHaveBeenCalledTimes(1))
        const read = studyApi.fetchStudyPeriod.mock.calls.length
        act(() =>
            emitRealtimeEvent('streak.updated', {
                current: 6,
                longest: 14,
                todaySeconds: 50 * MIN,
                countedUntil: null,
                readAt: '2026-11-22T14:50:00.000Z'
            })
        )
        await waitFor(() => expect(studyApi.fetchStudyPeriod.mock.calls.length).toBeGreaterThan(read))
        await waitFor(() => expect(studyApi.fetchStudyHistory).toHaveBeenCalledTimes(2))
        stop()
    })

    it('goes to the week before on "‹" and with ←, a new entry on the URL (previous-week)', async () => {
        open()
        await userEvent.click(await screen.findByRole('button', { name: 'Kỳ trước' }))
        expect(where()).toBe('/study/stats?view=week&date=2026-11-09')
        expect(await screen.findByRole('heading', { name: 'Tuần 09/11 – 15/11 · 1 giờ 55 phút' })).toBeVisible()
        expect(screen.getByRole('heading', { name: 'Tuần 09/11 – 15/11' })).toBeVisible()
        expect(screen.getByText('−1 giờ 50 phút so với tuần trước')).toBeVisible()
        expect(screen.getByText('Trung bình 16 phút / ngày')).toBeVisible()
        expect(screen.getByRole('heading', { name: '4 tuần · 19/10 – 15/11' })).toBeVisible()
        // The streak and today stay now's.
        expect(screen.getByText('Hôm nay 45 phút · đã đủ 15 phút')).toBeVisible()
        const next = screen.getByRole('button', { name: 'Kỳ sau' })
        expect(next).toHaveAttribute('aria-disabled', 'false')
        act(() => next.focus())
        await userEvent.keyboard('{ArrowLeft}')
        expect(where()).toBe('/study/stats?view=week&date=2026-11-02')
    })

    it('stops "‹" at the first period with data, saying why', async () => {
        holdPeriods({ firstDate: '2026-11-18' })
        open()
        const back = await screen.findByRole('button', { name: 'Kỳ trước' })
        await waitFor(() => expect(back).toHaveAttribute('aria-disabled', 'true'))
        act(() => back.focus())
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Chưa có dữ liệu trước kỳ này')
        await userEvent.click(back)
        expect(where()).toBe('/study/stats')
    })

    it('shows the month as a calendar, no 4-week grid (month)', async () => {
        open()
        await userEvent.click(await screen.findByRole('radio', { name: 'Tháng' }))
        expect(where()).toBe('/study/stats?view=month&month=2026-11')
        expect(await screen.findByRole('heading', { name: 'Tháng 11/2026 · 10 giờ 55 phút' })).toBeVisible()
        expect(within(screen.getByRole('group', { name: 'Chọn kỳ' })).getByText('Tháng 11/2026')).toBeVisible()
        const month = screen.getByRole('grid', { name: 'Phút học mỗi ngày trong tháng' })
        expect(within(month).getByLabelText('Hôm nay · 45 phút')).toHaveAttribute('tabindex', '0')
        expect(within(month).getByLabelText('Thứ 2, 09/11 · 0 phút')).toHaveTextContent('9—')
        expect(
            within(month)
                .getAllByRole('gridcell')
                .filter((cell) => cell.getAttribute('aria-label'))
        ).toHaveLength(22)
        expect(screen.queryByRole('grid', { name: 'Ngày đủ 15 phút trong 4 tuần' })).toBeNull()
        expect(screen.getByText('+2 giờ 35 phút so với tháng trước', { exact: false })).toBeVisible()
        await expectNoA11yViolations()
    })

    it('says the period before had nothing, or the same, or nothing to compare', async () => {
        holdPeriods({ previousPeriodSeconds: 0, previousSeconds: 0 })
        const { unmount } = open('/study/stats?view=week&date=2026-11-09')
        expect(await screen.findByText('Tuần trước chưa học')).toBeVisible()
        unmount()
        holdPeriods({ previousSeconds: 115 * MIN, previousPeriodSeconds: 115 * MIN, totalSeconds: 115 * MIN })
        client.clear()
        const second = open('/study/stats?view=week&date=2026-11-09')
        expect(await screen.findByText('Bằng tuần trước')).toBeVisible()
        second.unmount()
        holdPeriods({ previousSeconds: null, previousPeriodSeconds: null })
        client.clear()
        open('/study/stats?view=week&date=2026-11-09')
        await screen.findByText('Trung bình 16 phút / ngày')
        expect(screen.queryByText(/so với tuần trước|Tuần trước chưa học|Bằng tuần trước/)).toBeNull()
    })

    it('cheers one’s best week, and a streak milestone before it', async () => {
        holdPeriods({ bestOtherWeekSeconds: 200 * MIN })
        const { unmount } = open()
        expect(await screen.findByText('Tuần học nhiều nhất của bạn')).toBeVisible()
        unmount()
        client.clear()
        holdPeriods({ bestOtherWeekSeconds: 200 * MIN }, today({ streak: 7 }))
        open()
        expect(await screen.findByText('7 ngày liên tiếp — giữ nhịp tốt lắm')).toBeVisible()
        expect(screen.queryByText('Tuần học nhiều nhất của bạn')).toBeNull()
    })

    it('says how to begin, never studied, and starts a 25/5 Solo (empty)', async () => {
        holdPeriods({ firstDate: null, allTimeSeconds: 0, todaySeconds: 0 }, today({ todaySeconds: 0, streak: 0 }))
        studyApi.startSolo.mockResolvedValue(solo({ focusMinutes: 25, shortBreakMinutes: 5 }))
        open()
        expect(await screen.findByRole('heading', { name: 'Chưa có phút học nào' })).toBeVisible()
        expect(screen.queryByRole('radio', { name: 'Tuần' })).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu Tập trung 25 phút' }))
        expect(studyApi.startSolo).toHaveBeenCalledWith(
            { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null },
            expect.any(String)
        )
        await waitFor(() => expect(where()).toBe('/study/solo'))
    })

    it('is the page, not the empty one, while in a session with no second yet', async () => {
        holdPeriods(
            { firstDate: null, allTimeSeconds: 0, todaySeconds: 0, totalSeconds: 0 },
            today({ todaySeconds: 0, streak: 0, countedUntil: READ_AT })
        )
        open('/study/stats', solo({ status: 'paused', pausedRemainingMs: 50 * MIN * 1000, stretchStartedAt: null }))
        expect(await screen.findByRole('heading', { name: 'Tuần này · 0 phút' })).toBeVisible()
        expect(screen.queryByRole('heading', { name: 'Chưa có phút học nào' })).toBeNull()
    })

    it('says the first read failed with Runtime, and reads again on "Thử lại"', async () => {
        studyApi.fetchStudyPeriod.mockRejectedValueOnce(new Error('down'))
        open()
        expect(await screen.findByRole('heading', { name: 'Không tải được thống kê' })).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
        expect(await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })).toBeVisible()
    })

    it('says the history failed in its place, the numbers still there', async () => {
        studyApi.fetchStudyHistory.mockRejectedValueOnce(new Error('down'))
        open()
        expect(await screen.findByText('Không tải được lịch sử phiên')).toBeVisible()
        expect(screen.getByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
        expect(await screen.findByText('Học một mình', { selector: 'span' })).toBeInTheDocument()
        expect(screen.queryByText('Không tải được lịch sử phiên')).toBeNull()
    })

    it('says a period with no session so', async () => {
        studyApi.fetchStudyHistory.mockResolvedValue({ items: [], hasMore: false })
        open()
        expect(await screen.findByText('Chưa có phiên nào trong kỳ này')).toBeVisible()
    })

    it('loads 20 more on "Xem thêm" after the last line’s session, a line met twice kept once, then no button', async () => {
        studyApi.fetchStudyHistory.mockImplementation(async (_period, cursor) =>
            cursor === null
                ? { items: HISTORY, hasMore: true }
                : {
                      items: [
                          HISTORY[2]!,
                          line({
                              sessionId: 'room-0',
                              firstJoinedAt: '2026-11-17T13:00:00.000Z',
                              lastLeftAt: '2026-11-17T13:55:00.000Z',
                              seconds: 50 * MIN
                          })
                      ],
                      hasMore: false
                  }
        )
        open()
        await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }))
        expect(await screen.findByText('T3 17/11 · 20:00 – 20:55')).toBeVisible()
        expect(studyApi.fetchStudyHistory).toHaveBeenLastCalledWith(
            expect.objectContaining({ start: '2026-11-16' }),
            'room-1'
        )
        expect(within(screen.getByRole('region', { name: 'Lịch sử phiên' })).getAllByRole('listitem')).toHaveLength(4)
        expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull()
    })

    it('starts the history again when the cursor is no longer one’s (CONFLICT_ERROR)', async () => {
        let calls = 0
        studyApi.fetchStudyHistory.mockImplementation(async (_period, cursor) => {
            calls++
            if (cursor !== null) throw apiError(409, 'CONFLICT_ERROR')
            return { items: HISTORY, hasMore: calls === 1 }
        })
        open()
        await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }))
        await waitFor(() => expect(calls).toBe(3))
        expect(await screen.findByText('Học một mình', { selector: 'span' })).toBeVisible()
    })

    it('turns the period and "Xem thêm" off offline, keeping what was read', async () => {
        studyApi.fetchStudyHistory.mockResolvedValue({ items: HISTORY, hasMore: true })
        open('/study/stats?view=week&date=2026-11-09')
        await screen.findByRole('heading', { name: 'Tuần 09/11 – 15/11 · 1 giờ 55 phút' })
        act(() => {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
            window.dispatchEvent(new Event('offline'))
        })
        expect(await screen.findByRole('button', { name: 'Xem thêm' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Kỳ sau' })).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('radio', { name: 'Tháng' })).toBeDisabled()
        expect(screen.getByRole('heading', { name: 'Tuần 09/11 – 15/11 · 1 giờ 55 phút' })).toBeVisible()
    })

    it('keeps one Tab stop on the chart going on to a week with fewer days gone by', async () => {
        // Wednesday 18/11: this week has three columns.
        noteServerTime('2026-11-18T14:47:18.000Z')
        // This week read first, so coming back to it draws from the cache, the chart kept.
        open()
        await screen.findByRole('heading', { name: /^Tuần này · / })
        await userEvent.click(screen.getByRole('button', { name: 'Kỳ trước' }))
        await screen.findByRole('heading', { name: /^Tuần 09\/11 – 15\/11 · / })
        const before = screen.getByRole('group', { name: 'Phút học mỗi ngày trong tuần' })
        act(() => within(before).getByLabelText('Thứ 2, 09/11 · 0 phút').focus())
        await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
        expect(within(before).getByLabelText('Chủ nhật, 15/11 · 40 phút')).toHaveFocus()
        await userEvent.click(screen.getByRole('button', { name: 'Kỳ sau' }))
        await screen.findByRole('heading', { name: /^Tuần này · / })
        const chart = screen.getByRole('group', { name: 'Phút học mỗi ngày trong tuần' })
        const stops = within(chart)
            .getAllByRole('img')
            .filter((column) => column.getAttribute('tabindex') === '0')
        expect(stops).toHaveLength(1)
    })

    it('keeps the numbers past midnight while the new day is read', async () => {
        // 23:59:58 in Hồ Chí Minh: the new day comes in two seconds; its read never answers.
        noteServerTime('2026-11-22T16:59:58.000Z')
        open()
        await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })
        studyApi.fetchStudyPeriod.mockImplementation(() => new Promise(() => undefined))
        expect(
            await screen.findByRole('heading', { name: 'Tuần 16/11 – 22/11 · 4 giờ 35 phút' }, { timeout: 5000 })
        ).toBeVisible()
    }, 10_000)

    it('keeps the line one is in steady through a count, before the history is read again', async () => {
        const stop = listenForSessions(client, () => false)
        holdPeriods({}, today({ countedUntil: '2026-11-22T14:29:00.000Z' }))
        studyApi.fetchStudyHistory.mockResolvedValueOnce({
            items: [
                line({
                    sessionId: 'solo-1',
                    kind: 'solo',
                    roomName: null,
                    serverName: null,
                    firstJoinedAt: '2026-11-22T14:29:00.000Z',
                    lastLeftAt: null,
                    seconds: 0
                })
            ],
            hasMore: false
        })
        open('/study/stats', solo())
        const history = await screen.findByRole('region', { name: 'Lịch sử phiên' })
        expect(await within(history).findByText('18 phút')).toBeVisible()
        // A count: today is read with the 18 minutes in; the history's read again does not answer yet.
        studyApi.fetchStudyHistory.mockImplementation(() => new Promise(() => undefined))
        act(() =>
            emitRealtimeEvent('streak.updated', {
                current: 6,
                longest: 14,
                todaySeconds: 63 * MIN,
                countedUntil: READ_AT,
                readAt: '2026-11-22T14:47:19.000Z'
            })
        )
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
        expect(within(history).getByText('18 phút')).toBeVisible()
        stop()
    })

    it('takes this week again when the page is opened again with no period, days later', async () => {
        open()
        await screen.findByRole('heading', { name: 'Tuần này · 4 giờ 35 phút' })
        // Monday 30/11, 10:00 in Hồ Chí Minh.
        noteServerTime('2026-11-30T03:00:00.000Z')
        await userEvent.click(screen.getByRole('link', { name: 'Thống kê' }))
        expect(await screen.findByText('30/11 – 06/12')).toBeVisible()
    })

    it('is one Tab stop on the 4-week grid, the arrows moving in it, each day with its Tooltip', async () => {
        open()
        await screen.findByRole('heading', { name: '4 tuần · 26/10 – 22/11' })
        const grid = screen.getByRole('grid', { name: 'Ngày đủ 15 phút trong 4 tuần' })
        const todayCell = within(grid).getByLabelText('Hôm nay · 45 phút')
        expect(todayCell).toHaveAttribute('tabindex', '0')
        expect(
            within(grid)
                .getAllByRole('gridcell')
                .filter((cell) => cell.getAttribute('tabindex') === '0')
        ).toHaveLength(1)
        act(() => todayCell.focus())
        await userEvent.keyboard('{ArrowUp}')
        const lastSunday = within(grid).getByLabelText('Chủ nhật, 15/11 · 40 phút')
        expect(lastSunday).toHaveFocus()
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Chủ nhật, 15/11 · 40 phút')
        await userEvent.keyboard('{ArrowLeft}')
        expect(within(grid).getByLabelText('Thứ 7, 14/11 · 0 phút')).toHaveFocus()
        await userEvent.keyboard('{ArrowRight}{ArrowDown}')
        expect(todayCell).toHaveFocus()
    })
})
