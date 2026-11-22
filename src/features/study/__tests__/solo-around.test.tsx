import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { noteServerTime } from '@/lib/server-clock'
import { expectNoA11yViolations } from '@/test/a11y'
import { solo, waitingSolo } from '@/test/study-sessions'
import { useSoloYield } from '../solo-yield.store'
import { askToYieldSolo, useStudyStore } from '../study.store'
import type { FocusSession, SoloState, StudyToday } from '../types'

const studyApi = {
    commandSession: vi.fn<(sessionId: string, command: string, version: number) => Promise<FocusSession>>(),
    fetchStudyToday: vi.fn<() => Promise<StudyToday>>(),
    fetchSolo: vi.fn<() => Promise<SoloState>>()
}
vi.mock('../api/study.api', () => studyApi)

const { SoloDockSlot } = await import('../components/SoloDockSlot')
const { SoloWatch } = await import('../components/SoloWatch')
const { default: SoloYieldDialog } = await import('../components/SoloYieldDialog')
const { tellSolo } = await import('../api/liveSessions')

// A lazy chunk's first load, the whole suite running at once, may take a while.
const LAZY = { timeout: 5000 }
const FIFTY_TEN = { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null }

/** Somewhere to go, as the app's links do. */
function Go({ to }: { to: string }) {
    const navigate = useNavigate()
    return (
        <button type='button' onClick={() => void navigate(to)}>
            go {to}
        </button>
    )
}

let client: QueryClient
function shell(at = '/study', extra: React.ReactNode = null) {
    return render(
        <QueryClientProvider client={client}>
            <Toaster />
            <TooltipProvider>
                <MemoryRouter initialEntries={[at]}>
                    <Routes>
                        <Route
                            path='*'
                            element={
                                <>
                                    <Go to='/study' />
                                    <Go to='/study/solo' />
                                    <SoloWatch />
                                    <SoloDockSlot shape='column' />
                                    {extra}
                                </>
                            }
                        />
                    </Routes>
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}
const toastText = (text: string | RegExp) => screen.findByText(text, { selector: '[data-sonner-toast] *' })
const ended = (more: Partial<FocusSession>) =>
    solo({ status: 'ended', endedAt: '2026-11-22T14:47:18.000Z', countedSeconds: 1098, version: 1, ...more })

beforeAll(async () => {
    await i18n.changeLanguage('vi')
})
afterAll(async () => {
    await i18n.changeLanguage('en')
})
beforeEach(() => {
    // The dock's column shape is the one from 1024 up.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('min-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined
    }))
    client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    useStudyStore.setState({ news: {}, pausedBy: {}, ended: {}, left: {}, soloEnded: null })
    useSoloYield.setState({ asking: null })
    noteServerTime('2026-11-22T14:47:18.000Z')
    for (const call of Object.values(studyApi)) call.mockReset()
    studyApi.fetchStudyToday.mockResolvedValue({
        todaySeconds: 14 * 60,
        countedUntil: '2026-11-22T14:29:00.000Z',
        streak: 6,
        readAt: '2026-11-22T14:47:18.000Z'
    })
    studyApi.fetchSolo.mockResolvedValue({ session: solo(), startCycle: FIFTY_TEN })
})
afterEach(() => toast.dismiss())

describe('The Solo dock (C-09 solo, solo-waiting)', () => {
    it('counts the Solo down on any page, links to its page, pauses and stops it; none on its page', async () => {
        shell('/study')
        const dock = await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        expect(within(dock).getByText(/^31:[34]\d$/)).toBeVisible()
        expect(within(dock).getByText('Tập trung')).toBeVisible()
        expect(within(dock).getByRole('link', { name: 'Mở Học một mình' })).toHaveAttribute('href', '/study/solo')
        await expectNoA11yViolations(dock)
        studyApi.commandSession.mockResolvedValue(
            solo({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_902_000, version: 1 })
        )
        await userEvent.click(within(dock).getByRole('button', { name: 'Tạm dừng' }))
        expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'pause', 0)
        expect(await within(dock).findByRole('button', { name: 'Tiếp tục' })).toBeVisible()

        await userEvent.click(screen.getByRole('button', { name: 'go /study/solo' }))
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Học một mình' })).toBeNull())
    })

    it('waits for Học tiếp after the break, counting its minutes down', async () => {
        noteServerTime('2026-11-22T15:30:48.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        shell('/study')
        const dock = await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        expect(within(within(dock).getByRole('link')).getByText('Hết giờ nghỉ')).toBeVisible()
        expect(within(dock).getByText('Còn 08:12 để học tiếp')).toBeVisible()
        studyApi.commandSession.mockResolvedValue(solo({ phaseIndex: 2, version: 3 }))
        await userEvent.click(within(dock).getByRole('button', { name: 'Học tiếp' }))
        expect(studyApi.commandSession).toHaveBeenCalledWith('solo-1', 'continue', 2)
    })

    it('says the minutes counted when stopped from the dock off its page (Q11)', async () => {
        shell('/study')
        const dock = await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        studyApi.commandSession.mockResolvedValue(ended({ endedReason: 'stopped' }))
        await userEvent.click(within(dock).getByRole('button', { name: 'Dừng học một mình' }))
        expect(await toastText('Đã dừng học một mình · 18 phút đã được tính')).toBeVisible()
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Học một mình' })).toBeNull())
    })
})

describe('A room’s session ending the Solo (D-103)', () => {
    it('says so when another starts one in one’s room (edge room-session-started)', async () => {
        shell('/study')
        await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        act(() => tellSolo(client, ended({ endedReason: 'joined_room' })))
        expect(
            await toastText('Phiên học chung đã bắt đầu · học một mình đã dừng · 18 phút đã được tính')
        ).toBeVisible()
    })

    it('says only the minutes when this tab joined or started it', async () => {
        shell('/study')
        await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        askToYieldSolo('solo-1')
        act(() => tellSolo(client, ended({ endedReason: 'joined_room' })))
        expect(await toastText('Đã dừng học một mình · 18 phút')).toBeVisible()
        expect(screen.queryByText(/Phiên học chung đã bắt đầu/)).toBeNull()
    })

    it('asks before starting a room’s session over it, with the minutes so far (start-while-solo-confirm)', async () => {
        shell('/study', <SoloYieldDialog />)
        await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        const confirm = vi.fn()
        act(() => useSoloYield.getState().ask({ kind: 'start', focusMinutes: 25, confirm }))
        const dialog = await screen.findByRole('dialog', { name: 'Bắt đầu phiên chung và dừng học một mình?' })
        expect(
            within(dialog).getByText(
                'Học một mình sẽ kết thúc; 18 phút bạn đã học vẫn được tính. Cả phòng sẽ vào Tập trung 25 phút.'
            )
        ).toBeVisible()
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
        expect(confirm).not.toHaveBeenCalled()

        act(() => useSoloYield.getState().ask({ kind: 'start', focusMinutes: 25, confirm }))
        await userEvent.click(await screen.findByRole('button', { name: 'Bắt đầu' }))
        expect(confirm).toHaveBeenCalledTimes(1)
        // Its end is this tab's own: "Đã dừng học một mình · 18 phút".
        act(() => tellSolo(client, ended({ endedReason: 'joined_room' })))
        expect(await toastText('Đã dừng học một mình · 18 phút')).toBeVisible()
    })

    it('asks before joining a room with a session, its minutes counted and running (join-room-confirm)', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: solo({ countedSeconds: 600 }), startCycle: FIFTY_TEN })
        shell('/study', <SoloYieldDialog />)
        await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        act(() => useSoloYield.getState().ask({ kind: 'join', room: 'Phòng học im lặng', confirm: () => undefined }))
        const dialog = await screen.findByRole('dialog', { name: 'Vào phòng và dừng học một mình?' })
        // 10 minutes counted, 18:18 running since 21:29: 28 minutes.
        expect(
            within(dialog).getByText(
                'Phòng học im lặng đang có phiên học chung. Học một mình sẽ kết thúc; 28 phút bạn đã học vẫn được tính.'
            )
        ).toBeVisible()
        expect(within(dialog).getByRole('button', { name: 'Ở lại' })).toBeVisible()
        expect(within(dialog).getByRole('button', { name: 'Vào phòng' })).toBeVisible()
    })

    it('closes the question once the Solo is gone meanwhile', async () => {
        shell('/study', <SoloYieldDialog />)
        await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        const confirm = vi.fn()
        act(() => useSoloYield.getState().ask({ kind: 'join', room: 'Phòng học im lặng', confirm }))
        await screen.findByRole('dialog')
        act(() => tellSolo(client, ended({ endedReason: 'stopped' })))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(useSoloYield.getState().asking).toBeNull()
        expect(confirm).not.toHaveBeenCalled()
    })
})

describe('What this tab asked, for the end it asked for only (D-234)', () => {
    it('says Học tiếp came too late from the dock too (08 › Edge)', async () => {
        noteServerTime('2026-11-22T15:38:59.000Z')
        studyApi.fetchSolo.mockResolvedValue({ session: waitingSolo(), startCycle: FIFTY_TEN })
        shell('/study')
        const dock = await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        studyApi.commandSession.mockResolvedValue(
            waitingSolo({ status: 'ended', endedReason: 'expired', endedAt: '2026-11-22T15:29:00.000Z', version: 3 })
        )
        await userEvent.click(within(dock).getByRole('button', { name: 'Học tiếp' }))
        expect(await toastText('Đã quá 10 phút chờ')).toBeVisible()
    })

    it('does not take an end elsewhere for a Dừng that changed nothing, nor a join that failed', async () => {
        shell('/study/solo')
        await waitFor(() => expect(studyApi.fetchSolo).toHaveBeenCalled())
        // Dừng sent with a version gone by: the Solo as it was.
        studyApi.commandSession.mockResolvedValue(solo({ version: 4 }))
        const { askToStopSolo } = await import('../study.store')
        askToStopSolo('solo-1')
        // (as useSoloCommand does once its answer is not an end)
        askToStopSolo(null)
        askToYieldSolo('solo-1')
        act(() => tellSolo(client, ended({ endedReason: 'stopped', version: 5 })))
        expect(useStudyStore.getState().soloEnded).toMatchObject({ stoppedHere: false, yieldedHere: false })
    })
})

describe('A read and what was told meanwhile (D-225)', () => {
    it('keeps a Solo told running while a read that began before it comes back with none', async () => {
        studyApi.fetchSolo.mockResolvedValue({ session: null, startCycle: FIFTY_TEN })
        shell('/study')
        await waitFor(() => expect(studyApi.fetchSolo).toHaveBeenCalledTimes(1))
        let answer: (state: SoloState) => void = () => undefined
        studyApi.fetchSolo.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const reading = client.refetchQueries({ queryKey: ['study', 'solo'] })
        act(() => tellSolo(client, solo({ version: 0 })))
        await act(async () => {
            answer({ session: null, startCycle: FIFTY_TEN })
            await reading
        })
        expect(await screen.findByRole('region', { name: 'Học một mình' }, LAZY)).toBeVisible()
    })
})

describe('The summary on the Solo page (D-234)', () => {
    it('is not kept for later once its toast said it off the page', async () => {
        shell('/study')
        const dock = await screen.findByRole('region', { name: 'Học một mình' }, LAZY)
        studyApi.commandSession.mockResolvedValue(ended({ endedReason: 'stopped' }))
        await userEvent.click(within(dock).getByRole('button', { name: 'Dừng học một mình' }))
        await toastText('Đã dừng học một mình · 18 phút đã được tính')
        expect(useStudyStore.getState().soloEnded).toBeNull()
    })

    it('is forgotten once one leaves the Solo page', async () => {
        shell('/study/solo')
        await waitFor(() => expect(studyApi.fetchSolo).toHaveBeenCalled())
        act(() => tellSolo(client, ended({ endedReason: 'stopped' })))
        expect(useStudyStore.getState().soloEnded).not.toBeNull()
        // On its page, its summary says it: no toast.
        expect(screen.queryByText(/đã được tính/, { selector: '[data-sonner-toast] *' })).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'go /study' }))
        await waitFor(() => expect(useStudyStore.getState().soloEnded).toBeNull())
    })
})
