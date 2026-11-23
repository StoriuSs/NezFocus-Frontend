import { forwardRef, type ReactNode } from 'react'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { noteServerTime } from '@/lib/server-clock'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import { useStudyStore, hearNews } from '../study.store'
import type { ControlProps } from '../components/StudyStage'
import type { FocusSession, RoomSession, SessionNews, SoloState, StudyRoomView, StudyToday } from '../types'
import { news, session, solo } from '@/test/study-sessions'
import { useSoloYield } from '../solo-yield.store'

const studyApi = {
    startRoomSession: vi.fn<(channelId: string, cycle: unknown, key: string) => Promise<FocusSession>>(),
    commandSession: vi.fn<(sessionId: string, command: string, version: number) => Promise<FocusSession>>(),
    changeSessionCycle: vi.fn<(sessionId: string, version: number, cycle: unknown) => Promise<FocusSession>>(),
    fetchStudyToday: vi.fn<() => Promise<StudyToday>>(),
    fetchSolo: vi.fn<() => Promise<SoloState>>()
}
vi.mock('../api/study.api', () => studyApi)

const { default: StudyStage } = await import('../components/StudyStage')
const { roomSessionOf } = await import('../lib/phases')

/** The room's round control, as the voice feature hands it in (its look is voice's). */
const Control = forwardRef<HTMLButtonElement, ControlProps>(({ icon, label, hint, ...props }, ref) => (
    <button ref={ref} type='button' aria-label={hint} {...props}>
        {icon}
        {label}
    </button>
))
Control.displayName = 'Control'

const NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Giang', 'Hà', 'Khánh', 'Lan', 'Mai']
const IDS = ['an', 'binh', 'chi', 'dung', 'giang', 'ha', 'khanh', 'lan', 'mai']
const people = (count = 9) => IDS.slice(0, count).map((id, index) => ({ id, name: NAMES[index]! }))
const ROOM_CYCLE = { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null }
const room = (live: RoomSession | null, more: Partial<StudyRoomView> = {}): StudyRoomView => ({
    channelId: 'im-lang',
    isStudyRoom: true,
    session: live,
    cycle: ROOM_CYCLE,
    canStart: true,
    canManage: false,
    ...more
})
const running = (more: Partial<FocusSession> = {}) => roomSessionOf(session(more))!

let client: QueryClient
function stage(
    view: StudyRoomView,
    {
        me = 'an',
        count = 9,
        content = null as ReactNode,
        self = undefined as ReactNode,
        joinedAt = '2026-11-22T14:05:00.000Z'
    } = {}
) {
    const ui = (next: StudyRoomView) => (
        <QueryClientProvider client={client}>
            {/* First, as the app's: a toast said as the stage mounts is heard. */}
            <Toaster />
            <StudyStage
                room={next}
                me={me}
                joinedAt={joinedAt}
                people={people(count)}
                seats={people(count).map((one) => ({ id: one.id, seat: <span>{one.name}</span> }))}
                content={content}
                self={self}
                devices={<button type='button'>Mic</button>}
                leave={<button type='button'>Rời phòng</button>}
                Control={Control}
                barRef={() => undefined}
            />
        </QueryClientProvider>
    )
    const result = render(ui(view))
    return { ...result, change: (next: StudyRoomView) => result.rerender(ui(next)) }
}
const toastText = (text: string | RegExp) => screen.findByText(text, { selector: '[data-sonner-toast] *' })

beforeAll(async () => {
    await i18n.changeLanguage('vi')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
})
beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    useStudyStore.setState({ news: {}, pausedBy: {}, ended: {} })
    noteServerTime('2026-11-22T14:47:18.000Z')
    for (const call of Object.values(studyApi)) call.mockReset()
    studyApi.fetchStudyToday.mockResolvedValue({
        todaySeconds: 45 * 60,
        countedUntil: null,
        streak: 6,
        readAt: '2026-11-22T14:47:18.000Z'
    })
    studyApi.fetchSolo.mockResolvedValue({ session: null, startCycle: ROOM_CYCLE })
    useSoloYield.setState({ asking: null })
})
afterEach(() => toast.dismiss())

describe('A study room with no session (07 S-ROOM-06 study-room-idle)', () => {
    it("starts one at once with the room's cycle", async () => {
        studyApi.startRoomSession.mockResolvedValue(session({ version: 0 }))
        stage(room(null))
        expect(await screen.findByText('Chưa có phiên học')).toBeVisible()
        expect(screen.getByText('8 người đang ở trong phòng cùng bạn')).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Bắt đầu Tập trung 25 phút' }))
        await waitFor(() => expect(studyApi.startRoomSession).toHaveBeenCalledWith('im-lang', null, expect.any(String)))
    })

    it('asks first while one’s Solo runs: starting ends it (08 start-while-solo-confirm, D-103)', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: ROOM_CYCLE })
        studyApi.startRoomSession.mockResolvedValue(session({ version: 0 }))
        stage(room(null))
        await waitFor(() => expect(studyApi.fetchSolo).toHaveBeenCalled())
        await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu Tập trung 25 phút' }))
        expect(useSoloYield.getState().asking).toMatchObject({ kind: 'start', focusMinutes: 25 })
        expect(studyApi.startRoomSession).not.toHaveBeenCalled()
        act(() => useSoloYield.getState().asking?.confirm())
        await waitFor(() => expect(studyApi.startRoomSession).toHaveBeenCalledWith('im-lang', null, expect.any(String)))
    })

    it('asks first from "Chu kỳ khác" while one’s Solo runs, the focus minutes chosen', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: ROOM_CYCLE })
        stage(room(null))
        await waitFor(() => expect(studyApi.fetchSolo).toHaveBeenCalled())
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        const dialog = await screen.findByRole('dialog', { name: 'Bắt đầu phiên học' })
        await userEvent.click(within(dialog).getByRole('radio', { name: '50/10' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu cho cả phòng' }))
        expect(useSoloYield.getState().asking).toMatchObject({ kind: 'start', focusMinutes: 50 })
        expect(studyApi.startRoomSession).not.toHaveBeenCalled()
    })

    it('says who may start, to one who may not', async () => {
        stage(room(null, { canStart: false }), { count: 1 })
        expect(await screen.findByText('Chỉ người quản lý phòng học bắt đầu được phiên')).toBeVisible()
        expect(screen.getByText('Bạn đang ở trong phòng một mình')).toBeVisible()
        expect(screen.queryByRole('button', { name: /Bắt đầu/ })).toBeNull()
    })

    it('starts with another cycle from "Chu kỳ khác" (S-ROOM-03)', async () => {
        studyApi.startRoomSession.mockResolvedValue(session({ version: 0, focusMinutes: 50, shortBreakMinutes: 10 }))
        stage(room(null))
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        const dialog = await screen.findByRole('dialog', { name: 'Bắt đầu phiên học' })
        expect(
            within(dialog).getByText('Cả 9 người trong phòng sẽ cùng nhịp. Bạn sẽ là người điều khiển.')
        ).toBeVisible()
        expect(within(dialog).getByText('Nghỉ dài: tắt · Cấu hình mặc định của phòng')).toBeVisible()
        expect(within(dialog).getByRole('radio', { name: '25/5' })).toHaveFocus()
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('radio', { name: '50/10' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu cho cả phòng' }))
        await waitFor(() =>
            expect(studyApi.startRoomSession).toHaveBeenCalledWith(
                'im-lang',
                { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null },
                expect.any(String)
            )
        )
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    })

    it('checks a custom cycle when sent, the focus on the first field out of range', async () => {
        stage(room(null))
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        const dialog = await screen.findByRole('dialog')
        await userEvent.click(within(dialog).getByRole('radio', { name: 'Tùy chỉnh' }))
        const focus = within(dialog).getByLabelText('Tập trung (5–120)')
        await userEvent.clear(focus)
        await userEvent.type(focus, '150')
        await userEvent.click(within(dialog).getByRole('switch', { name: 'Nghỉ dài' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Bắt đầu cho cả phòng' }))
        expect(within(dialog).getByText('Tập trung phải từ 5 đến 120 phút')).toBeVisible()
        expect(focus).toHaveFocus()
        expect(studyApi.startRoomSession).not.toHaveBeenCalled()
        await userEvent.clear(focus)
        await userEvent.type(focus, '45')
        expect(within(dialog).queryByText('Tập trung phải từ 5 đến 120 phút')).toBeNull()
        expect(within(dialog).getByText('45 phút tập trung · nghỉ 5 · nghỉ dài 15 sau mỗi 4 vòng')).toBeVisible()
    })

    it('closes and says who started first when someone did (S-ROOM-03 conflict)', async () => {
        let refuse!: (error: unknown) => void
        studyApi.startRoomSession.mockImplementation(() => new Promise((_, reject) => (refuse = reject)))
        const { change } = stage(room(null))
        await userEvent.click(await screen.findByRole('button', { name: 'Chu kỳ khác' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu cho cả phòng' }))
        // Bình's session came first; the dialog closes with it, before the refusal comes back.
        change(room(running({ hostId: 'binh' })))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        await act(async () => refuse(apiError(409, 'FOCUS_SESSION_ACTIVE')))
        expect(await toastText('Bình vừa bắt đầu phiên học')).toBeVisible()
    })

    it("leaves a refusal about one's own session elsewhere to the usual toast", async () => {
        studyApi.startRoomSession.mockRejectedValue(apiError(409, 'FOCUS_SESSION_ACTIVE'))
        stage(room(null))
        await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu Tập trung 25 phút' }))
        await waitFor(() => expect(studyApi.startRoomSession).toHaveBeenCalled())
        expect(screen.queryByText(/vừa bắt đầu phiên học/)).toBeNull()
    })
})

describe('A session running (07 S-ROOM-02)', () => {
    it('shows the phase, the time left and the next phase, the Host pausing it', async () => {
        studyApi.commandSession.mockResolvedValue(session({ status: 'paused', version: 4 }))
        stage(room(running()))
        const timer = await screen.findByRole('timer', { name: 'Tập trung, vòng 2, còn 18 phút' })
        expect(within(timer).getByText('18:42')).toBeVisible()
        expect(within(timer).getByText(/^Vòng 2 · nghỉ ngắn lúc \d\d:\d\d$/)).toBeVisible()
        expect(screen.getByText('8 người đang Tập trung cùng bạn')).toBeVisible()
        expect(screen.getByRole('group', { name: '9 người trong phòng' })).toBeVisible()
        await expectNoA11yViolations(document.body)
        await userEvent.click(screen.getByRole('button', { name: 'Tạm dừng phiên học (Space)' }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('s1', 'pause', 3))
    })

    it('gives a participant no Host controls', async () => {
        stage(room(running()), { me: 'phong' })
        await screen.findByRole('timer')
        expect(screen.queryByRole('button', { name: /Tạm dừng/ })).toBeNull()
        expect(screen.queryByRole('button', { name: 'Điều khiển phiên học' })).toBeNull()
    })

    it('says the whole room is on a break, and when focus comes back', async () => {
        stage(
            room(
                running({
                    phase: 'short_break',
                    phaseIndex: 3,
                    phaseStartedAt: '2026-11-22T15:06:00.000Z',
                    phaseEndsAt: '2026-11-22T14:50:38.000Z'
                })
            )
        )
        expect(await screen.findByText('Cả phòng đang nghỉ ngắn')).toBeVisible()
        expect(screen.getByText(/^Tập trung lại lúc \d\d:\d\d$/)).toBeVisible()
        expect(screen.getByText('03:20')).toBeVisible()
        expect(await screen.findByText('Bạn đã tập trung 45 phút hôm nay')).toBeVisible()
    })

    it("tells no Host's room who will control it", async () => {
        stage(room(running({ hostId: null })), { me: 'phong', count: 3 })
        expect(await screen.findByText('Người quản lý phòng học vào sẽ điều khiển phiên')).toBeVisible()
        expect(screen.queryByText(/hôm nay/)).toBeNull()
    })

    it("says one's minutes today with the focus running since the last count (07 Q5, D-231)", async () => {
        // Joined at 21:47:00 with 20 minutes from this afternoon: still 20 (just-joined).
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 20 * 60,
            countedUntil: '2026-11-22T14:47:00.000Z',
            streak: 6,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        const { unmount } = stage(room(running()), { me: 'phong' })
        expect(await screen.findByText('Bạn đã tập trung 20 phút hôm nay')).toBeVisible()
        unmount()

        // Counted to before this focus began (21:41): its 6 minutes 18 seconds are added.
        client.clear()
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 20 * 60,
            countedUntil: '2026-11-22T14:30:00.000Z',
            streak: 6,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        const again = stage(room(running()), { me: 'phong' })
        expect(await screen.findByText('Bạn đã tập trung 26 phút hôm nay')).toBeVisible()
        again.unmount()

        // Under a whole minute today: no line yet.
        client.clear()
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 40,
            countedUntil: null,
            streak: 0,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        stage(room(running()), { me: 'phong' })
        await screen.findByRole('timer')
        await waitFor(() => expect(studyApi.fetchStudyToday).toHaveBeenCalled())
        expect(screen.queryByText(/hôm nay/)).toBeNull()
    })

    it('skips the phase from the menu, which says where it goes; the cycle changes only while paused', async () => {
        studyApi.commandSession.mockResolvedValue(session({ phase: 'short_break', phaseIndex: 3, version: 4 }))
        stage(room(running()))
        await userEvent.click(await screen.findByRole('button', { name: 'Điều khiển phiên học' }))
        const menu = await screen.findByRole('menu')
        expect(within(menu).getByRole('menuitem', { name: /Đổi chu kỳ/ })).toHaveAttribute('aria-disabled', 'true')
        expect(within(menu).getByText('Tạm dừng để đổi chu kỳ')).toBeVisible()
        expect(within(menu).getByText('Kết thúc cho cả 9 người')).toBeVisible()
        await userEvent.click(within(menu).getByRole('menuitem', { name: /Bỏ qua pha.*Sang Nghỉ ngắn ngay/ }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('s1', 'skip', 3))
    })

    it('stops for the room only once asked again (S-ROOM-04 stop-confirm)', async () => {
        studyApi.commandSession.mockResolvedValue(session({ status: 'ended', version: 4 }))
        stage(room(running()))
        await userEvent.click(await screen.findByRole('button', { name: 'Điều khiển phiên học' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: /Dừng phiên học/ }))
        const dialog = await screen.findByRole('dialog', { name: 'Dừng phiên học cho cả phòng (9 người)?' })
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus())
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('button', { name: 'Dừng phiên học' }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('s1', 'stop', 3))
    })

    it('shows a manager who controls it, when that is not them (S-ROOM-04 moderator)', async () => {
        stage(room(running({ hostId: 'binh' }), { canManage: true }))
        await userEvent.click(await screen.findByRole('button', { name: 'Điều khiển phiên học' }))
        expect(await screen.findByText('Bình đang điều khiển · bạn có quyền quản lý phòng học')).toBeVisible()
    })

    it('syncing again, reads "Đang đồng bộ lại…" and holds a command pressed until the socket is back (07 syncing)', async () => {
        studyApi.commandSession.mockResolvedValue(session({ status: 'paused', version: 4 }))
        const { useRealtimeStore } = await import('@/features/realtime/realtime.store')
        act(() => useRealtimeStore.setState({ socket: 'down', downSince: Date.now() - 5000 }))
        stage(room(running()))
        expect(await screen.findByText('Đang đồng bộ lại…')).toBeVisible()
        const pause = screen.getByRole('button', { name: 'Tạm dừng phiên học (Space)' })
        await userEvent.click(pause)
        expect(pause).toHaveAttribute('aria-busy', 'true')
        expect(studyApi.commandSession).not.toHaveBeenCalled()
        act(() => useRealtimeStore.setState({ socket: 'connected', downSince: null }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('s1', 'pause', 3))
    })

    it('tells one just joined since when their time counts (07 just-joined)', async () => {
        stage(room(running()), { me: 'phong', joinedAt: '2026-11-22T14:47:10.000Z' })
        expect(await toastText(/^Bạn đang được tính giờ từ \d\d:\d\d$/)).toBeVisible()
    })

    it('shows the compact block over the grid (D-55)', async () => {
        stage(room(running()), { content: <p>Lưới</p> })
        expect(await screen.findByText('Vòng 2 · 9 người')).toBeVisible()
        expect(screen.getByText('18:42')).toBeVisible()
        expect(screen.queryByRole('timer')).toBeNull()
        // The grid has no people line and no minutes today (07 › Hai cách xem).
        await waitFor(() => expect(studyApi.fetchStudyToday).toHaveBeenCalled())
        expect(screen.queryByText(/hôm nay/)).toBeNull()
    })
})

describe('A session paused', () => {
    const paused = (more: Partial<FocusSession> = {}) =>
        running({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: (18 * 60 + 42) * 1000, version: 4, ...more })

    it('says who paused it when heard, else only that it is (D-231)', async () => {
        const { change } = stage(room(paused()))
        expect(await screen.findByText('Đã tạm dừng')).toBeVisible()
        expect(screen.getByText('Đồng hồ đứng yên, không tính phút')).toBeVisible()
        expect(screen.getByText('8 người đang chờ cùng bạn')).toBeVisible()
        expect(screen.queryByText(/hôm nay/)).toBeNull()
        act(() => hearNews(news({ status: 'paused', version: 5, action: 'pause', actorId: 'an' })))
        change(room(paused({ version: 5 })))
        expect(await screen.findByText('Bạn đã tạm dừng')).toBeVisible()
        act(() => hearNews(news({ status: 'paused', version: 6, action: 'pause', actorId: 'binh' })))
        expect(await screen.findByText('Bình đã tạm dừng')).toBeVisible()
    })

    it('lets anyone resume a session with no Host (D-119)', async () => {
        studyApi.commandSession.mockResolvedValue(session({ version: 5 }))
        stage(room(paused({ hostId: null })), { me: 'phong', count: 3 })
        expect(await screen.findByText('Bấm Tiếp tục để chạy lại')).toBeVisible()
        expect(screen.queryByText('Đồng hồ đứng yên, không tính phút')).toBeNull()
        await waitFor(() => expect(studyApi.fetchStudyToday).toHaveBeenCalled())
        expect(screen.queryByText(/hôm nay/)).toBeNull()
        expect(screen.queryByRole('button', { name: 'Điều khiển phiên học' })).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Tiếp tục phiên học (Space)' }))
        await waitFor(() => expect(studyApi.commandSession).toHaveBeenCalledWith('s1', 'resume', 4))
    })

    it('changes the cycle, still paused (S-ROOM-04 paused-edit-config)', async () => {
        studyApi.changeSessionCycle.mockResolvedValue(session({ version: 5, status: 'paused' }))
        stage(room(paused()))
        await userEvent.click(await screen.findByRole('button', { name: 'Điều khiển phiên học' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: /Đổi chu kỳ.*Đang 25\/5/ }))
        const dialog = await screen.findByRole('dialog', { name: 'Đổi chu kỳ' })
        expect(
            within(dialog).getByText('Pha hiện tại (Tập trung) sẽ bắt đầu lại với độ dài mới. Giờ đã học được giữ.')
        ).toBeVisible()
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('radio', { name: '50/10' }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))
        await waitFor(() =>
            expect(studyApi.changeSessionCycle).toHaveBeenCalledWith('s1', 4, {
                focus: 50,
                shortBreak: 10,
                longBreak: null,
                longBreakEvery: null
            })
        )
    })

    it('closes the cycle dialog unsaved when someone resumes meanwhile, saying who', async () => {
        const { change } = stage(room(paused()))
        await userEvent.click(await screen.findByRole('button', { name: 'Điều khiển phiên học' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: /Đổi chu kỳ/ }))
        await screen.findByRole('dialog', { name: 'Đổi chu kỳ' })
        act(() => hearNews(news({ status: 'running', version: 5, action: 'resume', actorId: 'binh' })))
        change(room(running({ version: 5 })))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(await toastText('Bình đã tiếp tục phiên học')).toBeInTheDocument()
    })
})

describe('A session ended while one was here (07 ended, D-49)', () => {
    const ended = (more: Partial<SessionNews> = {}) =>
        news({
            status: 'ended',
            version: 9,
            action: 'stop',
            actorId: 'an',
            endedAt: '2026-11-22T14:50:00.000Z',
            endedReason: 'stopped',
            summaries: [{ userId: 'an', seconds: 31 * 60 + 20 }],
            ...more
        })

    it("sums up one's minutes, today and the streak, with the start under it", async () => {
        act(() => hearNews(ended()))
        stage(room(null))
        expect(await screen.findByText('Phiên học đã kết thúc')).toBeVisible()
        expect(screen.getByText('31 phút')).toBeVisible()
        expect(await screen.findByText('Hôm nay 45 phút · chuỗi 6 ngày')).toBeVisible()
        expect(screen.getByText('Bạn đã dừng phiên học')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Bắt đầu Tập trung 25 phút' })).toBeVisible()
    })

    it('says who stopped it, or that the study room was turned off', async () => {
        act(() => hearNews(ended({ actorId: 'binh', summaries: [] })))
        const { change } = stage(room(null))
        expect(await screen.findByText('Bình đã dừng phiên học cho cả phòng')).toBeVisible()
        expect(screen.getByText('Phiên này chưa đủ 1 phút')).toBeVisible()
        act(() => hearNews(ended({ version: 10, endedReason: 'study_disabled', actorId: null })))
        change(room(null, { isStudyRoom: false, canStart: false }))
        expect(await screen.findByText('Chế độ phòng học đã tắt')).toBeVisible()
        expect(screen.queryByRole('button', { name: /Bắt đầu/ })).toBeNull()
    })

    it('shows no summary of a session that ended before one joined this time', async () => {
        act(() => hearNews(ended()))
        stage(room(null), { joinedAt: '2026-11-22T14:55:00.000Z' })
        expect(await screen.findByText('Chưa có phiên học')).toBeVisible()
        expect(screen.queryByText('Phiên học đã kết thúc')).toBeNull()
    })
})

describe("The room hears others' doings (07 › Ma trận vai trò)", () => {
    it('names who skipped, changed the cycle or started; says nothing of its own', async () => {
        const { change } = stage(room(running()), { me: 'an' })
        await screen.findByRole('timer')
        act(() => hearNews(news({ version: 4, action: 'skip', actorId: 'binh', phase: 'short_break', phaseIndex: 3 })))
        change(room(running({ version: 4, phase: 'short_break', phaseIndex: 3 })))
        expect(await toastText('Bình đã bỏ qua pha')).toBeVisible()
        expect(screen.getByText('Chuyển sang Nghỉ ngắn, 5 phút')).toBeInTheDocument()
        act(() =>
            hearNews(
                news({
                    version: 5,
                    action: 'config',
                    actorId: 'chi',
                    focusMinutes: 45,
                    shortBreakMinutes: 10,
                    longBreakMinutes: 20,
                    longBreakEvery: 4
                })
            )
        )
        expect(await toastText('Chi đã đổi chu kỳ thành 45/10 · nghỉ dài 20 sau mỗi 4 vòng')).toBeVisible()
        act(() => hearNews(news({ version: 6, action: 'skip', actorId: 'an' })))
        change(room(null))
        act(() =>
            hearNews(
                news({ id: 's2', version: 0, action: 'start', actorId: 'dung', startedAt: '2026-11-22T15:00:00.000Z' })
            )
        )
        expect(await toastText('Dũng đã bắt đầu phiên học')).toBeVisible()
        expect(screen.queryByText('An đã bỏ qua pha')).toBeNull()
    })

    it('tells one made Host whose place they took', async () => {
        stage(room(running({ hostId: 'binh' })), { me: 'an' })
        await screen.findByRole('timer')
        act(() => hearNews(news({ version: 5, action: 'host', actorId: null, hostId: 'an' })))
        expect(await toastText('Bình đã rời phòng · bạn đang điều khiển phiên học')).toBeVisible()
    })
})

describe('"Cả phòng thở ra" as the phase changes (DESIGN.md › Motion) and one’s own camera (D-56)', () => {
    const animate = vi.fn()
    beforeEach(() => {
        animate.mockReset()
        Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true, writable: true })
    })
    afterEach(() => {
        delete (HTMLElement.prototype as { animate?: unknown }).animate
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
        )
    })
    /** The break that began a second ago on the server's clock (14:47:18 there). */
    const breakNow = (more: Partial<FocusSession> = {}) =>
        running({
            phase: 'short_break',
            phaseIndex: 3,
            phaseStartedAt: '2026-11-22T14:47:17.000Z',
            phaseEndsAt: '2026-11-22T14:52:17.000Z',
            stretchStartedAt: null,
            ...more
        })
    const seatCalls = () => animate.mock.calls.filter(([frames]) => JSON.stringify(frames).includes('scale'))
    const labelCalls = () => animate.mock.calls.filter(([frames]) => !JSON.stringify(frames).includes('scale'))

    it('slides the new phase’s label up 8 and lets the seats breathe one after another, 40 ms apart', async () => {
        const view = stage(room(running()))
        expect(await screen.findByRole('timer')).toBeVisible()
        // Not for the phase found on joining.
        expect(animate).not.toHaveBeenCalled()

        view.change(room(breakNow()))
        await waitFor(() => expect(seatCalls()).toHaveLength(9))
        expect(seatCalls().map(([, options]) => (options as KeyframeAnimationOptions).delay)).toEqual([
            0, 40, 80, 120, 160, 200, 240, 280, 320
        ])
        expect(labelCalls()).toHaveLength(1)
        expect(labelCalls()[0]![0]).toEqual([
            { translate: '0 8px', opacity: 0 },
            { translate: '0 0', opacity: 1 }
        ])
        // The clock's number never moves.
        const clock = screen.getByRole('timer').querySelector('.font-numeric')
        expect(animate.mock.contexts).not.toContain(clock)
    })

    it('plays nothing for the phase found on opening the page, even one just begun', async () => {
        stage(room(breakNow()))
        expect(await screen.findByRole('timer')).toBeVisible()
        await act(() => new Promise((done) => setTimeout(done, 50)))
        expect(animate).not.toHaveBeenCalled()
    })

    it('plays no catch-up: not for a phase that began a while ago, nor in a hidden tab', async () => {
        const view = stage(room(running()))
        expect(await screen.findByRole('timer')).toBeVisible()
        view.change(room(breakNow({ phaseStartedAt: '2026-11-22T14:46:00.000Z' })))
        const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
        view.change(room(running({ phaseIndex: 4, phaseStartedAt: '2026-11-22T14:47:17.000Z' })))
        hidden.mockRestore()
        await screen.findByRole('timer')
        expect(animate).not.toHaveBeenCalled()
    })

    it('only crossfades the label with movement reduced', async () => {
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({
                    matches: query.includes('reduce'),
                    media: query,
                    addEventListener: vi.fn(),
                    removeEventListener: vi.fn()
                }) as never
        )
        const view = stage(room(running()))
        expect(await screen.findByRole('timer')).toBeVisible()
        view.change(room(breakNow()))
        await waitFor(() => expect(animate).toHaveBeenCalledTimes(1))
        expect(animate.mock.calls[0]).toEqual([[{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' }])
    })

    it('shows one’s own camera under the lines of the ring, not over the controls (07 camera-on)', async () => {
        stage(room(running()), { self: <div data-testid='own-camera' /> })
        const own = await screen.findByTestId('own-camera')
        const lines = screen.getByText('8 người đang Tập trung cùng bạn')
        expect(lines.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(
            own.compareDocumentPosition(screen.getByRole('button', { name: 'Rời phòng' })) &
                Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy()
    })
})
