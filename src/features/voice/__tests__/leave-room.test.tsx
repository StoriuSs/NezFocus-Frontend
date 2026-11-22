import type { ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '@/i18n'
import { roomSessionOf, useHostLeave } from '@/features/study'
import { hearLeft } from '@/features/study/study.store'
import { userKeys } from '@/features/users'
import { session } from '@/test/study-sessions'

const voice = vi.hoisted(() => ({ leaveRoom: vi.fn(async () => undefined), joinRoom: vi.fn(async () => true) }))
vi.mock('../lib/session', () => voice)
// What is said, at the call: the Toast itself is sonner's (session-cues does the same).
const sonner = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('sonner', () => ({ toast: sonner.toast }))

const { useLeaveRoom } = await import('../hooks/useLeaveRoom')

// Each test its own room: a wait for its minutes left by another test (8 seconds) hears only that room.
let rooms = 0
let QUIET = { serverId: 'ot', channelId: 'im-lang', name: 'Phòng học im lặng' }
let client: QueryClient
const Providers = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
)
const leaving = (room: Parameters<typeof useLeaveRoom>[0]) =>
    renderHook(() => useLeaveRoom(room), { wrapper: Providers }).result.current
/** The options of the n-th Toast said (its callbacks: closing, "Vào lại"). */
type Said = { onAutoClose: () => void; action: { onClick: () => void } }
const said = (n: number) => (sonner.toast.mock.calls[n] as [string, Said])[1]

beforeAll(() => i18n.changeLanguage('vi'))
beforeEach(() => {
    QUIET = { ...QUIET, channelId: `im-lang-${++rooms}` }
    client = new QueryClient()
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an', displayName: 'An', avatarUrl: null })
    voice.leaveRoom.mockClear()
    sonner.toast.mockClear()
    useHostLeave.setState({ asking: null })
})
afterEach(() => vi.useRealTimers())

describe('leaving a room (C-21, D-44, D-233)', () => {
    it('leaves a voice room at once, its Toast with no minutes (07 P4)', () => {
        leaving({ ...QUIET, session: null })()
        expect(voice.leaveRoom).toHaveBeenCalledTimes(1)
        expect(useHostLeave.getState().asking).toBeNull()
        expect(sonner.toast).toHaveBeenCalledWith(
            'Đã rời Phòng học im lặng',
            expect.objectContaining({ id: 'voice-left', duration: 8000 })
        )
        act(() => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 }))
        expect(sonner.toast).toHaveBeenCalledTimes(1)
    })

    it('asks the Host of a session not yet ended first, paused too; leaves once confirmed (D-44)', () => {
        for (const status of ['running', 'paused'] as const) {
            useHostLeave.setState({ asking: null })
            leaving({ ...QUIET, session: roomSessionOf(session({ status })) })()
            const asking = useHostLeave.getState().asking
            expect(asking).toMatchObject({ sessionId: 's1', kind: 'leave' })
            expect(voice.leaveRoom).not.toHaveBeenCalled()
            act(() => asking!.confirm())
            expect(voice.leaveRoom).toHaveBeenCalledTimes(1)
            voice.leaveRoom.mockClear()
        }
    })

    it('leaves at once one who is not the Host, a manager too', () => {
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        expect(useHostLeave.getState().asking).toBeNull()
        expect(voice.leaveRoom).toHaveBeenCalledTimes(1)
    })

    it('says the minutes counted in the same Toast once the server tells them, for that room only', async () => {
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        await act(async () => hearLeft({ sessionId: 'other', channelId: 'thao-luan', seconds: 1860 }))
        expect(sonner.toast).toHaveBeenCalledTimes(1)
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 + 59 }))
        expect(sonner.toast).toHaveBeenCalledTimes(2)
        expect(sonner.toast).toHaveBeenLastCalledWith(
            'Đã rời Phòng học im lặng · 31 phút đã được tính',
            expect.objectContaining({ id: 'voice-left', duration: expect.any(Number) })
        )
        const [, options] = sonner.toast.mock.calls[1] as [string, { duration: number }]
        // What is left of the 8 seconds, not 8 more; 3 at least, to be read.
        expect(options.duration).toBeLessThanOrEqual(8000)
        expect(options.duration).toBeGreaterThanOrEqual(3000)
    })

    it('adds nothing under a minute, nor to a Toast gone ("Vào lại" pressed)', async () => {
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 59 }))
        expect(sonner.toast).toHaveBeenCalledTimes(1)

        sonner.toast.mockClear()
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        act(() => said(0).action.onClick())
        expect(voice.joinRoom).toHaveBeenCalledWith({ serverId: 'ot', channelId: QUIET.channelId, name: QUIET.name })
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 }))
        expect(sonner.toast).toHaveBeenCalledTimes(1)
    })

    it('adds them after an earlier leaving whose Toast closed (sonner keeps that id closed)', async () => {
        leaving({ ...QUIET, session: null })()
        act(() => said(0).onAutoClose())
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 }))
        expect(sonner.toast).toHaveBeenCalledTimes(3)
        expect(sonner.toast).toHaveBeenLastCalledWith(
            'Đã rời Phòng học im lặng · 31 phút đã được tính',
            expect.anything()
        )
    })

    it('adds nothing when the minutes come after the Toast closed by itself', async () => {
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        act(() => said(0).onAutoClose())
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 }))
        expect(sonner.toast).toHaveBeenCalledTimes(1)
    })

    it('keeps the largest total: an older, smaller one coming after says nothing; another session neither', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        leaving({ ...QUIET, session: roomSessionOf(session({ hostId: 'binh' })) })()
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1860 }))
        vi.advanceTimersByTime(1)
        await act(async () => hearLeft({ sessionId: 's1', channelId: QUIET.channelId, seconds: 1700 }))
        vi.advanceTimersByTime(1)
        await act(async () => hearLeft({ sessionId: 'other', channelId: QUIET.channelId, seconds: 4000 }))
        expect(sonner.toast).toHaveBeenCalledTimes(2)
        expect(sonner.toast).toHaveBeenLastCalledWith(
            'Đã rời Phòng học im lặng · 31 phút đã được tính',
            expect.anything()
        )
    })
})
