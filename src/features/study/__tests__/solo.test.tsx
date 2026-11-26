import { forwardRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { noteServerTime } from '@/lib/server-clock'
import { setTimeZoneSource } from '@/lib/time-zones'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import { solo, waitingSolo } from '@/test/study-sessions'
import type { ControlProps } from '../components/StudyStage'
import { useStudyStore } from '../study.store'
import type { FocusSession, SoloState, StudyToday } from '../types'

const studyApi = {
    startRoomSession: vi.fn(),
    commandSession: vi.fn<(sessionId: string, command: string, version: number) => Promise<FocusSession>>(),
    changeSessionCycle: vi.fn<(sessionId: string, version: number, cycle: unknown) => Promise<FocusSession>>(),
    fetchStudyToday: vi.fn<() => Promise<StudyToday>>(),
    fetchSolo: vi.fn<() => Promise<SoloState>>(),
    startSolo: vi.fn<(cycle: unknown, key: string) => Promise<FocusSession>>()
}
vi.mock('../api/study.api', () => studyApi)

const { default: SoloStage } = await import('../components/SoloStage')
const { tellSolo } = await import('../api/liveSessions')
const { studyKeys } = await import('../api/keys')

const Control = forwardRef<HTMLButtonElement, ControlProps>(({ icon, label, hint, disabled, ...props }, ref) => (
    <button ref={ref} type='button' aria-label={hint} aria-disabled={disabled || undefined} {...props}>
        {icon}
        {label}
    </button>
))
Control.displayName = 'Control'

const FIFTY_TEN = { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null }

function Where() {
    return <span data-testid='where'>{useLocation().pathname}</span>
}

let client: QueryClient
function page({ inRoom = null as string | null, at = '/study/solo', friends = undefined as ReactNode } = {}) {
    return render(
        <QueryClientProvider client={client}>
            <Toaster />
            <MemoryRouter initialEntries={[at]}>
                <Where />
                <Routes>
                    <Route path='*' element={<SoloStage Control={Control} inRoom={inRoom} friends={friends} />} />
                </Routes>
            </MemoryRouter>
        </QueryClientProvider>
    )
}
const toastText = (text: string | RegExp) => screen.findByText(text, { selector: '[data-sonner-toast] *' })

beforeAll(async () => {
    await i18n.changeLanguage('vi')
    // The times of 08's world S are An's, in Hồ Chí Minh, whatever the machine's zone (CI runs in UTC).
    setTimeZoneSource(() => 'Asia/Ho_Chi_Minh')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
    setTimeZoneSource(() => undefined)
})
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    useStudyStore.setState({ news: {}, pausedBy: {}, ended: {}, left: {}, soloEnded: null })
    noteServerTime('2026-11-22T14:47:18.000Z')
    for (const call of Object.values(studyApi)) call.mockReset()
    // 14 minutes this afternoon; the Solo counted from 21:29 (08 world S).
    studyApi.fetchStudyToday.mockResolvedValue({
        todaySeconds: 14 * 60,
        countedUntil: '2026-11-22T14:29:00.000Z',
        streak: 6,
        readAt: '2026-11-22T14:47:18.000Z'
    })
    studyApi.fetchSolo.mockResolvedValue({ session: null, startCycle: FIFTY_TEN })
})
afterEach(() => toast.dismiss())

describe('No Solo yet (08 S-STUDY-02 idle)', () => {
    it('starts one at once with the last Solo’s cycle, and stays on its page', async () => {
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 14 * 60,
            countedUntil: null,
            streak: 5,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        studyApi.startSolo.mockResolvedValue(solo())
        page()
        expect(await screen.findByText('Học một mình')).toBeVisible()
        expect(await screen.findByText('Bạn đã tập trung 14 phút hôm nay')).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu Tập trung 50 phút' }))
        await waitFor(() => expect(studyApi.startSolo).toHaveBeenCalledWith(null, expect.any(String)))
        expect(await screen.findByText('31:42')).toBeVisible()
        expect(screen.getByTestId('where')).toHaveTextContent('/study/solo')
    })

    it('starts with another cycle from "Chu kỳ khác", the last one chosen first (cycle-dialog)', async () => {
        studyApi.startSolo.mockResolvedValue(solo({ focusMinutes: 25, shortBreakMinutes: 5 }))
        page()
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        const dialog = await screen.findByRole('dialog', { name: 'Học một mình' })
        expect(
            within(dialog).getByText('Chọn chu kỳ cho phiên học của riêng bạn. Lần sau sẽ chọn sẵn chu kỳ này.')
        ).toBeVisible()
        expect(within(dialog).getByRole('radio', { name: '50/10' })).toHaveFocus()
        // No room: nothing says "the room's own".
        expect(within(dialog).queryByText(/Cấu hình mặc định của phòng/)).toBeNull()
        expect(within(dialog).getByText('Nghỉ dài: tắt')).toBeVisible()
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('radio', { name: '25/5' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu' }))
        await waitFor(() =>
            expect(studyApi.startSolo).toHaveBeenCalledWith(
                { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null },
                expect.any(String)
            )
        )
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('says why none starts in a room’s session (REQ-STUDY-05)', async () => {
        page({ inRoom: 'Phòng học im lặng' })
        expect(await screen.findByText('Bạn đang trong phiên học ở Phòng học im lặng')).toBeVisible()
        expect(screen.queryByRole('button', { name: /Bắt đầu/ })).toBeNull()
    })

    it('opens the Solo running in another tab, saying so (edge already-running)', async () => {
        studyApi.startSolo.mockRejectedValue(apiError(409, 'FOCUS_SESSION_ACTIVE'))
        page({ at: '/study' })
        const start = await screen.findByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        await userEvent.click(start)
        expect(await toastText('Bạn đang có phiên học một mình ở tab khác')).toBeVisible()
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/study/solo'))
        expect(await screen.findByText('31:42')).toBeVisible()
    })
})

describe('A Solo running or paused (focus, paused, edit-cycle)', () => {
    it('counts down its focus with its cycle line and today’s minutes; Đổi chu kỳ waits for a pause', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        const { container } = page()
        expect(await screen.findByText('31:42')).toBeVisible()
        expect(screen.getByText('Vòng 1 · nghỉ ngắn lúc 22:19')).toBeVisible()
        expect(await screen.findByText('Bạn đã tập trung 32 phút hôm nay')).toBeVisible()
        const change = screen.getByRole('button', { name: 'Tạm dừng để đổi chu kỳ' })
        expect(change).toHaveAttribute('aria-disabled', 'true')
        // No seats, no Mic or Camera: a Solo has no voice.
        expect(screen.queryByRole('button', { name: /Mic|Camera/ })).toBeNull()
        await expectNoA11yViolations(container)

        studyApi.commandSession.mockResolvedValue(
            solo({
                status: 'paused',
                phaseEndsAt: null,
                pausedRemainingMs: 1_902_000,
                stretchStartedAt: null,
                version: 1
            })
        )
        await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng (Space)' }))
        expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'pause', 0)
        expect(await screen.findByText('Đồng hồ đứng yên, không tính phút')).toBeVisible()
        expect(screen.getByText('Bạn đã tạm dừng')).toBeVisible()
        expect(screen.getByText('Tạm dừng · Tập trung')).toBeVisible()

        await userEvent.click(screen.getByRole('button', { name: 'Đổi chu kỳ của phiên' }))
        const dialog = await screen.findByRole('dialog', { name: 'Đổi chu kỳ' })
        expect(within(dialog).getByRole('radio', { name: '50/10' })).toHaveFocus()
    })

    it('closes Đổi chu kỳ unsaved when another tab resumes it', async () => {
        const paused = solo({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_902_000, version: 1 })
        studyApi.fetchSolo.mockResolvedValue({ session: paused, startCycle: FIFTY_TEN })
        page()
        await userEvent.click(await screen.findByRole('button', { name: 'Đổi chu kỳ của phiên' }))
        await screen.findByRole('dialog', { name: 'Đổi chu kỳ' })
        act(() => tellSolo(client, solo({ version: 2 })))
        expect(await toastText('Phiên đã tiếp tục ở tab khác')).toBeVisible()
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('skips and stops with the version seen; stopped here, its summary and the start again (ended)', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        page()
        await screen.findByText('31:42')
        studyApi.commandSession.mockResolvedValueOnce(
            solo({ phase: 'short_break', phaseIndex: 1, stretchStartedAt: null, countedSeconds: 1098, version: 1 })
        )
        await userEvent.click(screen.getByRole('button', { name: 'Bỏ qua pha này' }))
        expect(studyApi.commandSession).toHaveBeenLastCalledWith('solo-1', 'skip', 0)
        expect(await screen.findByText(/^Hết nghỉ lúc/)).toBeVisible()

        studyApi.commandSession.mockResolvedValueOnce(
            solo({
                status: 'ended',
                endedReason: 'stopped',
                endedAt: '2026-11-22T14:47:18.000Z',
                countedSeconds: 1098,
                version: 2
            })
        )
        await userEvent.click(screen.getByRole('button', { name: 'Dừng học một mình' }))
        expect(studyApi.commandSession).toHaveBeenLastCalledWith('solo-1', 'stop', 1)
        expect(await screen.findByText('Phiên học đã kết thúc')).toBeVisible()
        expect(screen.getByText('18 phút')).toBeVisible()
        expect(screen.getByText('Bạn đã dừng học một mình')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })).toBeVisible()
        expect(screen.queryByRole('button', { name: 'Dừng học một mình' })).toBeNull()
    })

    it('says a Solo under a minute plainly: no minutes, no line of today (edge too-short)', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        page()
        await screen.findByText('31:42')
        act(() =>
            tellSolo(
                client,
                solo({
                    status: 'ended',
                    endedReason: 'stopped',
                    endedAt: '2026-11-22T14:47:18.000Z',
                    countedSeconds: 40,
                    version: 1
                })
            )
        )
        expect(await screen.findByText('Phiên này chưa đủ 1 phút')).toBeVisible()
        expect(screen.queryByText(/chuỗi/)).toBeNull()
        expect(screen.queryByRole('img')).toBeNull()
    })
})

describe('Its end elsewhere (stopped-other-tab, ended-expired)', () => {
    it('says it was stopped in another tab, and when', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
        page()
        await screen.findByText('31:42')
        act(() =>
            tellSolo(
                client,
                solo({
                    status: 'ended',
                    endedReason: 'stopped',
                    endedAt: '2026-11-22T14:46:00.000Z',
                    countedSeconds: 1020,
                    version: 1
                })
            )
        )
        expect(await screen.findByText('Đã dừng ở tab hoặc thiết bị khác lúc 21:46')).toBeVisible()
        expect(screen.getByText('17 phút')).toBeVisible()
    })

    it('says a wait not taken up ended it at the break’s end', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        page()
        await screen.findByText('Hết giờ nghỉ')
        act(() =>
            tellSolo(
                client,
                waitingSolo({
                    status: 'ended',
                    endedReason: 'expired',
                    endedAt: '2026-11-22T15:29:00.000Z',
                    waitingUntil: null,
                    version: 3
                })
            )
        )
        expect(await screen.findByText('Phiên kết thúc lúc 22:29 vì bạn chưa bấm Học tiếp')).toBeVisible()
        expect(screen.getByText('50 phút')).toBeVisible()
    })

    it('finds it expired when read again past its wait, its minutes kept (D-234)', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        page()
        await screen.findByText('Hết giờ nghỉ')
        // Asleep past 22:39, then back: the read has none.
        noteServerTime('2026-11-22T15:41:00.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: null, startCycle: FIFTY_TEN })
        await act(() => client.invalidateQueries({ queryKey: studyKeys.solo() }))
        expect(await screen.findByText('Phiên kết thúc lúc 22:29 vì bạn chưa bấm Học tiếp')).toBeVisible()
        expect(screen.getByText('50 phút')).toBeVisible()
    })

    it('opens empty after a reload, the end not heard (D-234)', async () => {
        page()
        expect(await screen.findByRole('button', { name: 'Bắt đầu Tập trung 50 phút' })).toBeVisible()
        expect(screen.queryByText('Phiên học đã kết thúc')).toBeNull()
    })
})

describe('The friends studying, handed in (08 S-STUDY-02 › Dòng dưới vòng, D-254)', () => {
    const friends = <button type='button'>2 bạn đang học lúc này</button>

    it('sits under the minutes with no Solo yet, and while it runs or is paused', async () => {
        page({ friends })
        expect(await screen.findByRole('button', { name: '2 bạn đang học lúc này' })).toBeVisible()
        act(() => tellSolo(client, solo()))
        expect(await screen.findByText('31:42')).toBeVisible()
        expect(screen.getByRole('button', { name: '2 bạn đang học lúc này' })).toBeVisible()
        act(() => tellSolo(client, solo({ status: 'paused', pausedRemainingMs: 1_902_000, version: 1 })))
        expect(await screen.findByText('Đồng hồ đứng yên, không tính phút')).toBeVisible()
        expect(screen.getByRole('button', { name: '2 bạn đang học lúc này' })).toBeVisible()
    })

    it('is not there while the break is over and waiting, nor under the summary', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        page({ friends })
        expect(await screen.findByText('Hết giờ nghỉ')).toBeVisible()
        expect(screen.queryByRole('button', { name: '2 bạn đang học lúc này' })).toBeNull()
        act(() =>
            tellSolo(
                client,
                waitingSolo({
                    status: 'ended',
                    endedReason: 'stopped',
                    endedAt: '2026-11-22T15:30:00.000Z',
                    version: 3
                })
            )
        )
        expect(await screen.findByText('Phiên học đã kết thúc')).toBeVisible()
        expect(screen.queryByRole('button', { name: '2 bạn đang học lúc này' })).toBeNull()
    })
})

describe('Its break over (waiting)', () => {
    it('counts down the 10 minutes, Học tiếp focused, Dừng alone', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        const { container } = page()
        expect(await screen.findByText('Hết giờ nghỉ')).toBeVisible()
        expect(screen.getByText('08:12')).toBeVisible()
        expect(screen.getByText('Bấm Học tiếp để bắt đầu vòng mới')).toBeVisible()
        await waitFor(() => expect(screen.getByRole('button', { name: 'Học tiếp' })).toHaveFocus())
        expect(screen.getByRole('button', { name: 'Dừng học một mình' })).toBeVisible()
        expect(screen.queryByRole('button', { name: 'Bỏ qua pha này' })).toBeNull()
        expect(screen.queryByRole('button', { name: /Tạm dừng/ })).toBeNull()
        await expectNoA11yViolations(container)

        studyApi.commandSession.mockResolvedValue(
            solo({
                phaseIndex: 2,
                phaseStartedAt: '2026-11-22T15:30:48.000Z',
                phaseEndsAt: '2026-11-22T16:20:48.000Z',
                stretchStartedAt: '2026-11-22T15:30:48.000Z',
                countedSeconds: 3000,
                serverTime: '2026-11-22T15:30:48.000Z',
                version: 3
            })
        )
        await userEvent.click(screen.getByRole('button', { name: 'Học tiếp' }))
        expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'continue', 2)
        expect(await screen.findByText(/^(50:00|49:5\d)$/)).toBeVisible()
    })

    it('says the wait is over when Học tiếp comes as it ran out', async () => {
        noteServerTime('2026-11-22T15:38:59.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        page()
        studyApi.commandSession.mockResolvedValue(
            waitingSolo({
                status: 'ended',
                endedReason: 'expired',
                endedAt: '2026-11-22T15:29:00.000Z',
                waitingUntil: null,
                version: 3
            })
        )
        await userEvent.click(await screen.findByRole('button', { name: 'Học tiếp' }))
        expect(await toastText('Đã quá 10 phút chờ')).toBeVisible()
        expect(await screen.findByText('Phiên kết thúc lúc 22:29 vì bạn chưa bấm Học tiếp')).toBeVisible()
    })
})
