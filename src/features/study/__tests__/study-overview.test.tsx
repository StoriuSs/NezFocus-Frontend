import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { noteServerTime } from '@/lib/server-clock'
import { setTimeZoneSource } from '@/lib/time-zones'
import { useRealtimeStore } from '@/features/realtime/realtime.store'
import { expectNoA11yViolations } from '@/test/a11y'
import { solo, waitingSolo } from '@/test/study-sessions'
import { useStudyStore } from '../study.store'
import type { AnySession, FocusSession, SoloState, StudyToday, StudyWeek } from '../types'

const studyApi = {
    startRoomSession: vi.fn(),
    commandSession: vi.fn<(sessionId: string, command: string, version: number) => Promise<FocusSession>>(),
    changeSessionCycle: vi.fn(),
    fetchStudyToday: vi.fn<() => Promise<StudyToday>>(),
    fetchStudyWeek: vi.fn<() => Promise<{ week: StudyWeek; today: StudyToday }>>(),
    fetchSolo: vi.fn<() => Promise<SoloState>>(),
    startSolo: vi.fn<(cycle: unknown, key: string) => Promise<FocusSession>>()
}
vi.mock('../api/study.api', () => studyApi)

const { default: SoloCard } = await import('../components/SoloCard')
const { default: StudyStats } = await import('../components/StudyStats')
const { barHeight, chartScale, dateKeyAt, dayMonthOf, isMilestoneDay, weekBars, weekdayOf, weekTotal } =
    await import('../lib/week')
const { studyKeys } = await import('../api/keys')

const FIFTY_TEN = { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null }
const READ_AT = '2026-11-22T14:47:18.000Z'
const MIN = 60

/** 08's week (T2 16/11 → CN 22/11/2026): T2 0 · T3 50 · T4 40 · T5 35 · T6 60 · T7 45, Sunday's from today. */
const week = (more: Partial<StudyWeek> = {}): StudyWeek => ({
    today: '2026-11-22',
    days: [0, 50, 40, 35, 60, 45, 0].map((minutes, index) => ({
        date: `2026-11-${16 + index}`,
        seconds: minutes * MIN
    })),
    longest: 14,
    firstDate: '2026-09-01',
    ...more
})
/** World A−: 14 minutes this afternoon, not counting now; the streak through Saturday, 5. */
const today = (more: Partial<StudyToday> = {}): StudyToday => ({
    todaySeconds: 14 * MIN,
    countedUntil: null,
    streak: 5,
    readAt: READ_AT,
    ...more
})
const holdStats = (days: StudyToday = today(), held: StudyWeek = week()) => {
    studyApi.fetchStudyToday.mockResolvedValue(days)
    studyApi.fetchStudyWeek.mockResolvedValue({ week: held, today: days })
}

function Where() {
    return <span data-testid='where'>{useLocation().pathname}</span>
}

let client: QueryClient
function show(element: React.ReactNode) {
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <Toaster />
                <MemoryRouter initialEntries={['/study']}>
                    <Where />
                    <Routes>
                        <Route path='*' element={element} />
                    </Routes>
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}
const card = (inRoom: string | null = null) => show(<SoloCard inRoom={inRoom} />)
const stats = (session: AnySession | null = null) => show(<StudyStats session={session} />)

beforeAll(async () => {
    await i18n.changeLanguage('vi')
    // 08's times are An's, in Hồ Chí Minh, whatever the machine's zone (CI runs in UTC).
    setTimeZoneSource(() => 'Asia/Ho_Chi_Minh')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
    setTimeZoneSource(() => undefined)
})
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    useStudyStore.setState({ news: {}, pausedBy: {}, ended: {}, left: {}, soloEnded: null })
    noteServerTime(READ_AT)
    useRealtimeStore.setState({ socket: 'connected', downSince: null, browserOnline: true })
    for (const call of Object.values(studyApi)) call.mockReset()
    studyApi.fetchSolo.mockResolvedValue({ session: null, startCycle: FIFTY_TEN })
    holdStats()
})
afterEach(() => {
    toast.dismiss()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('the week chart’s rules (C-45)', () => {
    it('draws today from its live seconds, the days after it ahead, and sums the week', () => {
        const midweek = week({ today: '2026-11-19' })
        const bars = weekBars(midweek, 20 * MIN)
        expect(bars.map((bar) => [bar.seconds / MIN, bar.today, bar.ahead])).toEqual([
            [0, false, false],
            [50, false, false],
            [40, false, false],
            [20, true, false],
            [60, false, true],
            [45, false, true],
            [0, false, true]
        ])
        expect(weekTotal(bars) / MIN).toBe(110)
    })

    it('adds the focus run to midnight, not counted yet, to yesterday’s column (D-236)', () => {
        const midweek = week({ today: '2026-11-19' })
        const bars = weekBars(midweek, 20 * MIN, 15 * MIN)
        expect(bars.map((bar) => bar.seconds / MIN).slice(0, 4)).toEqual([0, 50, 55, 20])
        expect(weekTotal(bars) / MIN).toBe(125)
    })

    it('scales to the week’s most, 60 minutes at least; a day with seconds 4 high at least, none a line of 2', () => {
        const bars = weekBars(week(), 0)
        expect(chartScale(bars)).toBe(3600)
        expect(chartScale(weekBars(week(), 540 * MIN))).toBe(540 * MIN)
        expect(barHeight(60 * MIN, 3600)).toBe(96)
        expect(barHeight(15 * MIN, 3600)).toBe(24)
        expect(barHeight(30, 540 * MIN)).toBe(4)
        expect(barHeight(0, 3600)).toBe(2)
    })

    it('cheers on 7, 30, 100 and 365 only once today has its 15 minutes', () => {
        expect(isMilestoneDay(7, 15 * MIN)).toBe(true)
        expect(isMilestoneDay(7, 14 * MIN)).toBe(false)
        expect(isMilestoneDay(8, 40 * MIN)).toBe(false)
        expect(isMilestoneDay(365, 20 * MIN)).toBe(true)
    })

    it('names the day in one’s zone, and the weekday of a date', () => {
        // 23:30 in UTC on Saturday is already Sunday in Hồ Chí Minh.
        expect(dateKeyAt(Date.parse('2026-11-21T23:30:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-22')
        expect(dateKeyAt(Date.parse('2026-11-21T23:30:00.000Z'), 'UTC')).toBe('2026-11-21')
        expect(weekdayOf('2026-11-16')).toBe('mon')
        expect(weekdayOf('2026-11-22')).toBe('sun')
    })

    it('writes a day as dd/MM, the year only when it is not this one, in the language’s order (08 › Ngày tháng)', () => {
        expect(dayMonthOf('2026-11-20', '2026-11-22', 'vi')).toBe('20/11')
        expect(dayMonthOf('2026-12-31', '2027-01-03', 'vi')).toBe('31/12/2026')
        expect(dayMonthOf('2026-11-20', '2026-11-22', 'en')).toBe('11/20')
    })
})

describe('the Study page’s Solo block (08 S-STUDY-01)', () => {
    it('starts the last Solo’s cycle across the block and opens its page (idle)', async () => {
        studyApi.startSolo.mockResolvedValue(solo())
        card()
        expect(await screen.findByRole('heading', { name: 'Học một mình' })).toBeVisible()
        expect(screen.getByText('Theo nhịp riêng, vẫn tính vào chuỗi ngày học.')).toBeVisible()
        const start = await screen.findByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })
        await waitFor(() => expect(start).toBeEnabled())
        expect(start).toHaveClass('w-full')
        await expectNoA11yViolations()
        await userEvent.click(start)
        await waitFor(() => expect(studyApi.startSolo).toHaveBeenCalledWith(null, expect.any(String)))
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/study/solo'))
    })

    it('opens the cycle dialog from "Chu kỳ khác", the last cycle chosen (cycle-dialog)', async () => {
        card()
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        const dialog = await screen.findByRole('dialog', { name: 'Học một mình' })
        expect(within(dialog).getByRole('radio', { name: '50/10' })).toHaveAttribute('aria-checked', 'true')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(studyApi.startSolo).not.toHaveBeenCalled()
    })

    it('is off with why in a room’s session (default, REQ-STUDY-05)', async () => {
        card('Phòng học im lặng')
        expect(await screen.findByText('Bạn đang trong phiên học ở Phòng học im lặng')).toBeVisible()
        expect(await screen.findByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Chu kỳ khác' })).toBeDisabled()
    })

    it('is off with no network (offline)', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
        card()
        expect(await screen.findByText('Cần kết nối mạng để bắt đầu')).toBeVisible()
        expect(await screen.findByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })).toBeDisabled()
    })

    it('opens no cycle dialog before the last Solo’s cycle is read (Q6)', async () => {
        studyApi.fetchSolo.mockImplementation(() => new Promise(() => undefined))
        card()
        expect(await screen.findByRole('button', { name: 'Chu kỳ khác' })).toBeDisabled()
    })

    it('holds Học tiếp while syncing again, staying here, and sends it once live', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        studyApi.commandSession.mockResolvedValue(solo({ status: 'running', phaseIndex: 2, version: 3 }))
        card()
        const next = await screen.findByRole('button', { name: 'Học tiếp' })
        act(() => useRealtimeStore.setState({ socket: 'down', downSince: Date.now() - 5000 }))
        await userEvent.click(next)
        expect(studyApi.commandSession).not.toHaveBeenCalled()
        expect(screen.getByTestId('where')).toHaveTextContent(/^\/study$/)
        act(() => useRealtimeStore.setState({ socket: 'connected', downSince: null }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'continue', 2))
    })

    it('shows a running Solo in minutes, its cycle line and "Mở" (solo-running)', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        card()
        expect(await screen.findByText('Vòng 1 · nghỉ ngắn lúc 22:19')).toBeVisible()
        expect(screen.getByText('Tập trung').nextElementSibling).toHaveTextContent('· còn 31 phút')
        expect(screen.queryByText(/31:4/)).toBeNull()
        expect(screen.getByRole('link', { name: 'Mở' })).toHaveAttribute('href', '/study/solo')
        expect(screen.queryByRole('button', { name: /Bắt đầu/ })).toBeNull()
    })

    it('shows a paused Solo as paused', async () => {
        studyApi.fetchSolo.mockResolvedValue({
            session: solo({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 31 * MIN * 1000 }),
            startCycle: FIFTY_TEN
        })
        card()
        expect(await screen.findByText('Bạn đã tạm dừng')).toBeVisible()
        expect(screen.getByText('Tạm dừng')).toBeVisible()
        expect(screen.queryByText(/còn/)).toBeNull()
    })

    it('offers Học tiếp after its break, then its page (solo-waiting)', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        studyApi.commandSession.mockResolvedValue(solo({ status: 'running', phaseIndex: 2, version: 3 }))
        card()
        expect(await screen.findByText('Hết giờ nghỉ')).toBeVisible()
        expect(screen.getByText('Còn 8 phút để học tiếp')).toBeVisible()
        expect(screen.getByRole('link', { name: 'Mở' })).toHaveAttribute('href', '/study/solo')
        await userEvent.click(screen.getByRole('button', { name: 'Học tiếp' }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'continue', 2))
        expect(screen.getByTestId('where')).toHaveTextContent('/study/solo')
    })
})

describe('the Study page’s streak and week (C-45 StudyStats)', () => {
    it('shows the streak, the longest, today short of 15 minutes and the week (idle, world A−)', async () => {
        stats()
        expect(await screen.findByText('5 ngày liên tiếp')).toBeVisible()
        expect(screen.getByRole('heading', { name: 'Chuỗi ngày học' })).toHaveClass('uppercase')
        expect(screen.getByText('Dài nhất 14 ngày')).toBeVisible()
        expect(screen.getByText('Hôm nay 14 / 15 phút')).toBeVisible()
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '14')
        expect(screen.getByRole('heading', { name: 'Tuần này · 4 giờ 4 phút' })).toBeVisible()
        // Sunday below the 15-minute line, in `primary` as today; Friday reached it.
        const chart = screen.getByRole('group', { name: 'Phút học mỗi ngày tuần này' })
        expect(within(chart).getByLabelText('Hôm nay · 14 phút')).toBeVisible()
        expect(within(chart).getByLabelText('Thứ 6, 20/11 · 60 phút')).toBeVisible()
        expect(screen.getByRole('table', { name: 'Phút học mỗi ngày tuần này' })).toBeInTheDocument()
        await expectNoA11yViolations()
    })

    it('counts the running focus: today, its column, the week and the streak grow (solo-running, world S)', async () => {
        holdStats(today({ todaySeconds: 14 * MIN, countedUntil: '2026-11-22T14:29:00.000Z', streak: 5 }))
        stats(solo())
        expect(await screen.findByText('6 ngày liên tiếp')).toBeVisible()
        expect(screen.getByText('Hôm nay 32 phút · đã đủ 15 phút')).toBeVisible()
        expect(screen.getByRole('heading', { name: 'Tuần này · 4 giờ 22 phút' })).toBeVisible()
        expect(screen.getByLabelText('Hôm nay · 32 phút')).toBeVisible()
    })

    it('opens the Stats page from "Xem thống kê" (D-104)', async () => {
        stats()
        await userEvent.click(await screen.findByRole('link', { name: 'Xem thống kê' }))
        expect(screen.getByTestId('where')).toHaveTextContent('/study/stats')
    })

    it('says the longest is the streak as it passes the longest read, before a count writes it', async () => {
        holdStats(today({ countedUntil: '2026-11-22T14:29:00.000Z', streak: 5 }), week({ longest: 5 }))
        stats(solo())
        expect(await screen.findByText('6 ngày liên tiếp')).toBeInTheDocument()
        expect(screen.getByText('Dài nhất 6 ngày')).toBeVisible()
    })

    it('says how to begin again at 0, never blaming (streak-zero)', async () => {
        holdStats(today({ streak: 0 }))
        stats()
        expect(await screen.findByText('Học 15 phút hôm nay để bắt đầu chuỗi mới · Dài nhất 14 ngày')).toBeVisible()
        // No Runtime at 0 (08 › Mascot).
        expect(document.querySelector('img')).toBeNull()
    })

    it('cheers with Runtime on a milestone day (streak-milestone)', async () => {
        holdStats(today({ todaySeconds: 45 * MIN, streak: 7 }))
        stats()
        expect(await screen.findByText('7 ngày liên tiếp — giữ nhịp tốt lắm')).toBeVisible()
        expect(document.querySelector('img')).not.toBeNull()
        expect(screen.getByText('Hôm nay 45 phút · đã đủ 15 phút')).toBeVisible()
    })

    it('says how to start in place of the numbers, never studied (never-studied)', async () => {
        holdStats(
            today({ todaySeconds: 0, streak: 0 }),
            week({ firstDate: null, longest: 0, days: week().days.map((day) => ({ ...day, seconds: 0 })) })
        )
        stats()
        expect(await screen.findByRole('heading', { name: 'Chưa có phút học nào' })).toBeVisible()
        expect(screen.getByText('Học 15 phút để bắt đầu chuỗi ngày đầu tiên.')).toBeVisible()
        expect(screen.queryByRole('group')).toBeNull()
    })

    it('says the read failed, and reads again on "Thử lại"', async () => {
        studyApi.fetchStudyWeek.mockRejectedValueOnce(new Error('down'))
        stats()
        await userEvent.click(await screen.findByRole('button', { name: 'Thử lại' }))
        expect(await screen.findByText('5 ngày liên tiếp')).toBeVisible()
        expect(screen.queryByText('Không tải được thống kê')).toBeNull()
    })

    it('stays on what it shows when a read again fails', async () => {
        stats()
        expect(await screen.findByText('5 ngày liên tiếp')).toBeInTheDocument()
        studyApi.fetchStudyWeek.mockRejectedValue(new Error('down'))
        studyApi.fetchStudyToday.mockRejectedValue(new Error('down'))
        await act(async () => {
            await client.invalidateQueries()
        })
        await waitFor(() => expect(client.getQueryState(studyKeys.today())?.status).toBe('error'))
        // The query client tells its observers on the next task.
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
        expect(screen.getByText('5 ngày liên tiếp')).toBeInTheDocument()
        expect(screen.queryByText('Không tải được thống kê')).toBeNull()
    })

    it('is one Tab stop on the chart, ← → between the days gone by, each with its Tooltip', async () => {
        stats()
        const todayColumn = await screen.findByLabelText('Hôm nay · 14 phút')
        expect(todayColumn).toHaveAttribute('tabindex', '0')
        act(() => todayColumn.focus())
        await userEvent.keyboard('{ArrowLeft}')
        const saturday = screen.getByLabelText('Thứ 7, 21/11 · 45 phút')
        expect(saturday).toHaveFocus()
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Thứ 7, 21/11 · 45 phút')
        await userEvent.keyboard('{ArrowRight}{ArrowRight}')
        expect(todayColumn).toHaveFocus()
    })

    it('keeps the later of two reads of today (D-232)', async () => {
        client.setQueryData<StudyToday>(
            studyKeys.today(),
            today({ todaySeconds: 20 * MIN, readAt: '2026-11-22T14:48:00.000Z' })
        )
        stats()
        expect(await screen.findByText('Hôm nay 20 phút · đã đủ 15 phút')).toBeVisible()
    })
})
