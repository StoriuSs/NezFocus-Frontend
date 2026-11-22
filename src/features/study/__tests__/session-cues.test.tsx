import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { userKeys } from '@/features/users'
import { useTitleCount } from '@/hooks/useDocumentTitle'
import { noteServerTime } from '@/lib/server-clock'
import { studyKeys } from '../api/keys'
import { useStudyToday } from '../api/useStudyToday'
import type { FocusSession, StudyToday } from '../types'
import { AT, session } from '@/test/study-sessions'

const sound = { playPhaseSound: vi.fn() }
vi.mock('@/lib/phase-sound', () => sound)
const studyApi = vi.hoisted(() => ({ fetchStudyToday: vi.fn<() => Promise<StudyToday>>() }))
vi.mock('../api/study.api', () => studyApi)
// Sonner draws on frames the fake clock holds back: what is said is checked at the call.
const sonner = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('sonner', () => sonner)

const { default: SessionCues } = await import('../components/SessionCues')

let client: QueryClient
const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const settings = (phaseSound: boolean) => client.setQueryData(userKeys.settings(), { phaseSound })
const Count = ({ n }: { n: number }) => {
    useTitleCount(n)
    return null
}

beforeAll(() => i18n.changeLanguage('vi'))
beforeEach(() => {
    client = new QueryClient()
    noteServerTime(session().serverTime)
    sound.playPhaseSound.mockReset()
    studyApi.fetchStudyToday.mockReset()
    studyApi.fetchStudyToday.mockResolvedValue({
        todaySeconds: 45 * 60,
        countedUntil: null,
        streak: 6,
        readAt: '2026-11-22T14:47:18.000Z'
    })
})
afterEach(() => {
    sonner.toast.mockReset()
    vi.useRealTimers()
})

describe('the session one is in, on every page (SessionCues, 07 S-ROOM-05)', () => {
    it('titles the tab with the phase and the clock after the unread number, and gives it back after', () => {
        const view = render(
            <>
                <Count n={2} />
                <SessionCues session={session()} />
            </>,
            { wrapper: Providers }
        )
        expect(document.title).toBe('(2) 18:42 · Tập trung · NezFocus')
        view.rerender(
            <>
                <Count n={2} />
                <SessionCues session={session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_122_000 })} />
            </>
        )
        expect(document.title).toBe('(2) 18:42 · Tạm dừng · NezFocus')
        view.unmount()
        expect(document.title).toBe('NezFocus')
    })

    it('plays the phase sound as a new phase begins, by itself or skipped, with the setting on (REQ-STUDY-06)', () => {
        settings(true)
        const view = render(<SessionCues session={session()} />, { wrapper: Providers })
        // The phase found on mounting (a reload, joining): no sound.
        expect(sound.playPhaseSound).not.toHaveBeenCalled()
        const next = (more: Partial<FocusSession> = {}) =>
            session({ phase: 'short_break', phaseIndex: 3, phaseStartedAt: new Date(AT - 2000).toISOString(), ...more })
        view.rerender(<SessionCues session={next()} />)
        expect(sound.playPhaseSound).toHaveBeenCalledTimes(1)
        // Another change of the same phase (a pause, a new version): no sound.
        view.rerender(<SessionCues session={next({ status: 'paused', version: 5 })} />)
        expect(sound.playPhaseSound).toHaveBeenCalledTimes(1)
    })

    it('plays none with the setting off, for a phase begun long ago (a tab back from sleep), nor for a new session', () => {
        settings(false)
        const view = render(<SessionCues session={session()} />, { wrapper: Providers })
        const now = new Date(AT - 1000).toISOString()
        view.rerender(<SessionCues session={session({ phaseIndex: 3, phase: 'short_break', phaseStartedAt: now })} />)
        expect(sound.playPhaseSound).not.toHaveBeenCalled()

        settings(true)
        view.rerender(
            <SessionCues session={session({ phaseIndex: 4, phaseStartedAt: new Date(AT - 60_000).toISOString() })} />
        )
        expect(sound.playPhaseSound).not.toHaveBeenCalled()
        view.rerender(<SessionCues session={session({ id: 's2', phaseIndex: 0, phaseStartedAt: now })} />)
        expect(sound.playPhaseSound).not.toHaveBeenCalled()
        view.rerender(<SessionCues session={session({ id: 's2', phaseIndex: 1, phaseStartedAt: now })} />)
        expect(sound.playPhaseSound).toHaveBeenCalledTimes(1)
    })

    it("plays a Solo's sound in the one tab that takes the phase's lock (08 S-STUDY-02, D-222)", async () => {
        settings(true)
        // Two tabs of the person's, as navigator.locks sees them: the second asking gets no lock.
        const held = new Set<string>()
        const request = vi.fn(
            async (name: string, _options: unknown, run: (lock: { name: string } | null) => Promise<void>) => {
                const lock = held.has(name) ? null : { name }
                if (lock) held.add(name)
                await run(lock)
            }
        )
        Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
        vi.useFakeTimers({ toFake: ['setTimeout'] })
        try {
            const next = session({
                phase: 'short_break',
                phaseIndex: 3,
                phaseStartedAt: new Date(AT - 2000).toISOString()
            })
            const first = render(<SessionCues session={session()} shared />, { wrapper: Providers })
            const second = render(<SessionCues session={session()} shared />, { wrapper: Providers })
            first.rerender(<SessionCues session={next} shared />)
            second.rerender(<SessionCues session={next} shared />)
            await vi.advanceTimersByTimeAsync(20_000)
            expect(request).toHaveBeenCalledTimes(2)
            expect(request.mock.calls[0]![0]).toBe('phase-sound-s1-3')
            expect(sound.playPhaseSound).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
            Reflect.deleteProperty(navigator, 'locks')
        }
    })
})

describe('the streak toast as today reaches 15 minutes (07 streak-reached, STUDY-07, D-232)', () => {
    const cues = () => render(<SessionCues session={session()} />, { wrapper: Providers })
    const flush = (ms: number) =>
        act(async () => {
            await vi.advanceTimersByTimeAsync(ms)
        })

    it('says it the moment the running focus takes today past 15 minutes, the streak one more than counted', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
        vi.setSystemTime(AT)
        noteServerTime(session().serverTime)
        // 14 minutes this afternoon, counted to 21:47:00 as An joined: 14:18 at 21:47:18.
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 14 * 60,
            countedUntil: '2026-11-22T14:47:00.000Z',
            streak: 5,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        cues()
        await flush(10)
        expect(sonner.toast).not.toHaveBeenCalled()
        await flush(41_000)
        expect(sonner.toast).not.toHaveBeenCalled()
        await flush(2_000)
        expect(sonner.toast).toHaveBeenCalledTimes(1)
        expect(sonner.toast).toHaveBeenCalledWith(
            'Đủ 15 phút hôm nay · chuỗi 6 ngày liên tiếp',
            expect.objectContaining({ id: 'study-streak', icon: expect.anything() })
        )
        // Past it, nothing again.
        await flush(60_000)
        expect(sonner.toast).toHaveBeenCalledTimes(1)
    })

    it('says nothing for a day already past 15 minutes when the session opened', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
        vi.setSystemTime(AT)
        noteServerTime(session().serverTime)
        cues()
        await flush(5_000)
        expect(sonner.toast).not.toHaveBeenCalled()
    })

    it('says it when a count takes today past 15 with nothing running, its streak as counted; again once a day starts over', async () => {
        studyApi.fetchStudyToday.mockResolvedValue({
            todaySeconds: 14 * 60,
            countedUntil: null,
            streak: 5,
            readAt: '2026-11-22T14:47:18.000Z'
        })
        const paused = session({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 60_000 })
        render(<SessionCues session={paused} />, { wrapper: Providers })
        await waitFor(() => expect(studyApi.fetchStudyToday).toHaveBeenCalled())
        await waitFor(() => expect(client.getQueryData(studyKeys.today())).toBeDefined())

        act(() => {
            client.setQueryData(studyKeys.today(), {
                todaySeconds: 16 * 60,
                countedUntil: '2026-11-22T14:47:00.000Z',
                streak: 6,
                readAt: '2026-11-22T14:47:18.000Z'
            })
        })
        await waitFor(() =>
            expect(sonner.toast).toHaveBeenCalledWith('Đủ 15 phút hôm nay · chuỗi 6 ngày liên tiếp', expect.anything())
        )
        // A new day read (0 so far), then past 15 again: said again.
        // Its own render first: the cache tells its watchers on the next tick.
        await act(async () => {
            client.setQueryData(studyKeys.today(), {
                todaySeconds: 0,
                countedUntil: null,
                streak: 6,
                readAt: '2026-11-22T14:47:18.000Z'
            })
            await new Promise((resolve) => setTimeout(resolve, 20))
        })
        act(() => {
            client.setQueryData(studyKeys.today(), {
                todaySeconds: 950,
                countedUntil: null,
                streak: 7,
                readAt: '2026-11-22T14:47:18.000Z'
            })
        })
        await waitFor(() => expect(sonner.toast).toHaveBeenCalledTimes(2))
        expect(sonner.toast).toHaveBeenLastCalledWith('Đủ 15 phút hôm nay · chuỗi 7 ngày liên tiếp', expect.anything())
    })
})

describe("one's day read on joining (useStudyToday, D-232)", () => {
    it('keeps an event read later than a GET that comes back after it', async () => {
        let answer: (today: StudyToday) => void = () => undefined
        studyApi.fetchStudyToday.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
        const { result } = renderHook(() => useStudyToday(), { wrapper: Providers })
        await waitFor(() => expect(studyApi.fetchStudyToday).toHaveBeenCalled())
        // The participation opened: its event, read at :48, while the GET (read at :47, before it opened) is on its way.
        const opened = {
            todaySeconds: 840,
            countedUntil: '2026-11-22T14:48:00.000Z',
            streak: 5,
            readAt: '2026-11-22T14:48:00.000Z'
        }
        act(() => {
            client.setQueryData(studyKeys.today(), opened)
        })
        await act(async () => {
            answer({ todaySeconds: 840, countedUntil: null, streak: 5, readAt: '2026-11-22T14:47:59.000Z' })
        })
        await waitFor(() => expect(result.current.isFetching).toBe(false))
        expect(result.current.data).toEqual(opened)
    })

    it('takes a GET read later than what is held', async () => {
        const later = { todaySeconds: 900, countedUntil: null, streak: 6, readAt: '2026-11-22T14:50:00.000Z' }
        client.setQueryData(studyKeys.today(), {
            todaySeconds: 840,
            countedUntil: null,
            streak: 5,
            readAt: '2026-11-22T14:48:00.000Z'
        })
        studyApi.fetchStudyToday.mockResolvedValue(later)
        const { result } = renderHook(() => useStudyToday(), { wrapper: Providers })
        await waitFor(() => expect(result.current.data).toEqual(later))
    })
})
