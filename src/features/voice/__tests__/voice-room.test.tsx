import { createContext, StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { LinkEvents } from '@/lib/livekit'
import type { RoomPerson, VoiceDirectory, VoiceRoom, VoiceToken } from '../types'

const voiceApi = {
    requestVoiceToken: vi.fn<(channelId: string) => Promise<VoiceToken>>(),
    leaveVoiceRoom: vi.fn(async () => undefined)
}
vi.mock('../api/voice.api', () => voiceApi)

const linkEvents: LinkEvents[] = []
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, _mic: boolean, events: LinkEvents) => {
        linkEvents.push(events)
        return {
            link: { room: { name: 'live' }, leave: vi.fn(async () => undefined), setMic: vi.fn(async () => 'on') },
            micState: 'off'
        }
    })
}
vi.mock('@/lib/livekit', () => livekit)

/** LiveKit's view of the room, as `@livekit/components-react` gives it. */
const live = vi.hoisted(() => ({
    participants: [] as { identity: string; name: string; isMicrophoneEnabled: boolean; speaking?: boolean }[]
}))
vi.mock('@livekit/components-react', () => ({
    RoomContext: createContext(undefined),
    useParticipants: () => live.participants,
    useIsSpeaking: (participant?: { speaking?: boolean }) => participant?.speaking ?? false
}))

const sendRealtimeSignal = vi.fn()
const realtime = vi.hoisted(() => ({ listeners: new Map<string, () => void>() }))
vi.mock('@/features/realtime', () => ({
    sendRealtimeSignal,
    onRealtimeEvent: (event: string, listener: () => void) => {
        realtime.listeners.set(event, listener)
        return () => realtime.listeners.delete(event)
    }
}))

const { default: VoiceRoomView } = await import('../components/VoiceRoomView')
const { default: InRoomDock } = await import('../components/InRoomDock')
const { useVoiceSession, MOVED_WINDOW_MS } = await import('../hooks/useVoiceSession')
const { resetSession, joinRoom } = await import('../lib/session')
const { keepRoom, resetRejoin } = await import('../lib/rejoin')
const { useVoiceStore } = await import('../voice.store')

const AN = 'an'
const person = (id: string, name: string, on: Partial<RoomPerson> = {}): RoomPerson => ({
    user: { id, username: id, displayName: name, avatarUrl: null },
    joinedAt: '2026-11-18T14:40:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false,
    ...on
})
const TUAN = person('tuan', 'Tuấn', { micOn: true })
const MINH = person('minh', 'Minh', { cameraOn: true })
const NAM = person('nam', 'Nam')
const room = (more: Partial<VoiceRoom> = {}): VoiceRoom => ({
    serverId: 'ot',
    channelId: 'thao-luan',
    name: 'Phòng thảo luận nhóm',
    isStudyRoom: false,
    people: [TUAN, MINH, NAM],
    canConnect: true,
    canSpeak: true,
    canVideo: true,
    timeoutUntil: null,
    ...more
})

let client: QueryClient
function Providers({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter>{children}</MemoryRouter>
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
}
const show = (voiceRoom: VoiceRoom) => render(<VoiceRoomView room={voiceRoom} />, { wrapper: Providers })

beforeEach(() => {
    resetSession()
    resetRejoin()
    sessionStorage.clear()
    linkEvents.length = 0
    live.participants = []
    voiceApi.requestVoiceToken.mockReset()
    voiceApi.requestVoiceToken.mockResolvedValue({ token: 'token', url: 'ws://lk' })
    sendRealtimeSignal.mockClear()
    livekit.joinRoom.mockClear()
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: AN, username: 'an', displayName: 'An', avatarUrl: null })
})
afterEach(() => {
    toast.dismiss()
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe("a voice room's preview page (S-ROOM-01 voice-preview)", () => {
    it('shows who is in it, how many, oneself, and the way in', async () => {
        show(room())
        const seats = screen.getByRole('list', { name: 'People in the room' })
        expect(
            within(seats)
                .getAllByRole('listitem')
                .map((seat) => seat.getAttribute('aria-label'))
        ).toEqual(['Tuấn, mic on', 'Minh, camera on', 'Nam'])
        expect(screen.getByText('3 people in the room')).toBeVisible()
        expect(screen.getByText('You')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Unmute (Ctrl Shift M)' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
        await expectNoA11yViolations()
    })

    it('says the room is empty', () => {
        show(room({ people: [] }))
        expect(screen.queryByRole('list', { name: 'People in the room' })).not.toBeInTheDocument()
        expect(screen.getByText('No one is in the room')).toBeVisible()
    })

    it('joins, the button busy meanwhile, then shows the room', async () => {
        let answer!: (token: VoiceToken) => void
        voiceApi.requestVoiceToken.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        live.participants = [{ identity: AN, name: 'An', isMicrophoneEnabled: false }]
        const { rerender } = show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        expect(screen.getByRole('button', { name: 'Join room' })).toHaveAttribute('aria-busy', 'true')
        await act(async () => answer({ token: 'token', url: 'ws://lk' }))
        rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), TUAN] })} />)
        expect(await screen.findByRole('button', { name: 'Leave room' })).toBeVisible()
    })

    it('says a join failed, neutral, under the buttons (join-error)', async () => {
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        expect(await screen.findByText("Couldn't join the room. Check your connection and try again.")).toBeVisible()
    })

    it('says how long one is timed out, without Mic or own tile (forbidden, D-54)', () => {
        show(room({ canConnect: false, timeoutUntil: new Date(Date.now() + 3_600_000).toISOString() }))
        expect(screen.getByRole('button', { name: 'Join room' })).toBeDisabled()
        expect(screen.getByText(/You're timed out until .* · you can't join rooms yet\./)).toBeVisible()
        expect(screen.queryByRole('button', { name: /Unmute/ })).not.toBeInTheDocument()
        expect(screen.queryByText('You')).not.toBeInTheDocument()
    })

    it('says one may not join without CONNECT, or after the API refused', async () => {
        const { unmount } = show(room({ canConnect: false }))
        expect(screen.getByText("You don't have permission to join this room.")).toBeVisible()
        unmount()
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(403, 'FORBIDDEN_ERROR'))
        show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        expect(await screen.findByText("You don't have permission to join this room.")).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join room' })).toBeDisabled()
    })

    it("says until when a refused join is timed out, from the API's answer, before the server is read again", async () => {
        voiceApi.requestVoiceToken.mockRejectedValueOnce(
            apiError(403, 'MEMBER_TIMED_OUT', {
                data: { timeoutUntil: new Date(Date.now() + 3_600_000).toISOString() }
            })
        )
        show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        expect(await screen.findByText(/You're timed out until .* · you can't join rooms yet\./)).toBeVisible()
    })

    it('forgets a refusal once the page is left, or the room opens to one: the button works again', async () => {
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(403, 'FORBIDDEN_ERROR'))
        const { unmount } = show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        expect(await screen.findByText("You don't have permission to join this room.")).toBeVisible()
        unmount()
        show(room())
        expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
    })

    it('needs a connection to join (offline)', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
        show(room())
        expect(screen.getByRole('button', { name: 'Join room' })).toBeDisabled()
        expect(screen.getByText('You need a connection to join a room')).toBeVisible()
    })

    it('offers to switch from the room this tab is in (switch-room)', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
        show(room())
        expect(screen.getByRole('button', { name: 'Switch to this room' })).toBeEnabled()
    })

    it('says one is in this room elsewhere, and offers to join here (other-tab)', async () => {
        show(room({ people: [person(AN, 'An'), TUAN] }))
        expect(screen.getByText("You're in this room in another tab or on another device")).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join here instead' })).toBeEnabled()
        expect(screen.getByRole('list', { name: 'People in the room' }).children).toHaveLength(1)
        await expectNoA11yViolations()
    })

    it('shows the mic blocked with how to fix it; the room may still be joined to listen (mic-blocked)', async () => {
        useVoiceStore.setState({ mic: 'blocked' })
        show(room())
        expect(screen.getByText('Your browser is blocking the mic · you can still listen')).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'How to fix' }))
        expect(await screen.findByText('Turn the mic back on')).toBeVisible()
        expect(screen.getByText('2. Under Microphone, choose Allow.')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
        await expectNoA11yViolations()
    })

    it('leaves the Mic off without SPEAK, saying why (07 câu L3-c)', async () => {
        show(room({ canSpeak: false }))
        const mic = screen.getByRole('button', { name: "You don't have permission to speak in this room" })
        expect(mic).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(mic)
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        expect(useVoiceStore.getState().mic).toBe('off')
    })

    it('switches the mic with Ctrl+Shift+M only where the Mic shows (not on a page one may not join)', async () => {
        const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] })
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
        const { unmount } = show(room({ canConnect: false }))
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        expect(getUserMedia).not.toHaveBeenCalled()
        unmount()
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(403, 'FORBIDDEN_ERROR'))
        const refused = show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        await screen.findByText("You don't have permission to join this room.")
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        expect(getUserMedia).not.toHaveBeenCalled()
        refused.unmount()
        show(room())
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        await waitFor(() => expect(useVoiceStore.getState().mic).toBe('on'))
    })
})

describe('the room once joined (S-ROOM-06 voice)', () => {
    const joined = async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        live.participants = [
            { identity: 'tuan', name: 'Tuấn', isMicrophoneEnabled: true, speaking: true },
            { identity: AN, name: 'An', isMicrophoneEnabled: false },
            { identity: 'lan', name: 'Lan', isMicrophoneEnabled: false }
        ]
        return show(room({ people: [TUAN, person(AN, 'An')] }))
    }

    it('shows everyone a tile, oneself first, who speaks, in a grid of 2 columns', async () => {
        await joined()
        const grid = screen.getByRole('list', { name: 'People in the room' })
        expect(
            within(grid)
                .getAllByRole('listitem')
                .map((tile) => tile.getAttribute('aria-label'))
        ).toEqual(['You, mic off', 'Tuấn, mic on, speaking', 'Lan, mic off'])
        expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 480px))')
        await expectNoA11yViolations()
    })

    it('leaves without asking, then offers to join again (C-21, 07 P4)', async () => {
        const { rerender } = await joined()
        await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
        expect(useVoiceStore.getState().call).toBeNull()
        expect(await screen.findByText('Left Phòng thảo luận nhóm')).toBeVisible()
        rerender(<VoiceRoomView room={room({ people: [TUAN] })} />)
        expect(screen.getByRole('button', { name: 'Join room' })).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Join again' }))
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
    })

    it('says so when joining again from the Toast fails, wherever one is', async () => {
        await joined()
        await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
        voiceApi.requestVoiceToken.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE_ERROR'))
        await userEvent.click(await screen.findByRole('button', { name: 'Join again' }))
        expect(
            await screen.findByText("Couldn't join the room. Check your connection and try again.", {
                selector: '[data-title]'
            })
        ).toBeVisible()
    })

    it('switches the mic with Ctrl+Shift+M', async () => {
        await joined()
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        await waitFor(() => expect(useVoiceStore.getState().mic).toBe('on'))
    })
})

describe('the dock away from the room (InRoomDock voice, C-09)', () => {
    const dock = (shape: 'column' | 'strip', canSpeak = true) =>
        render(
            <InRoomDock
                shape={shape}
                to='/channels/ot/thao-luan'
                room={{ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm', canSpeak, count: 4 }}
            />,
            { wrapper: Providers }
        )

    it('says where one is and how many, opens the room, switches the mic, leaves', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        dock('column')
        expect(screen.getByRole('link', { name: /In a room.*Phòng thảo luận nhóm.*4 people/ })).toHaveAttribute(
            'href',
            '/channels/ot/thao-luan'
        )
        await expectNoA11yViolations()
        await userEvent.click(screen.getByRole('button', { name: 'Unmute (Ctrl Shift M)' }))
        await waitFor(() => expect(useVoiceStore.getState().mic).toBe('on'))
        await userEvent.click(screen.getByRole('button', { name: 'Leave room' }))
        expect(useVoiceStore.getState().call).toBeNull()
        expect(await screen.findByText('Left Phòng thảo luận nhóm')).toBeVisible()
    })

    it('says when LiveKit tries again; a Mic without SPEAK does nothing', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        act(() => linkEvents[0]?.onReconnecting())
        dock('strip', false)
        expect(screen.getByText(/Reconnecting…/)).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: "You don't have permission to speak in this room" }))
        expect(useVoiceStore.getState().mic).toBe('off')
    })
})

describe('voice in every tab (useVoiceSession)', () => {
    const directory = (rooms: VoiceRoom[]): VoiceDirectory => ({
        room: (channelId) => rooms.find((one) => one.channelId === channelId),
        roomOf: (userId) => rooms.find((one) => one.people.some((p) => p.user.id === userId))
    })
    // As the app runs it (main.tsx): effects run twice in development.
    const Strict = ({ children }: { children: ReactNode }) => (
        <StrictMode>
            <Providers>{children}</Providers>
        </StrictMode>
    )
    const session = (initial: VoiceDirectory | undefined) =>
        renderHook(({ rooms }) => useVoiceSession(rooms), { wrapper: Strict, initialProps: { rooms: initial } })
    const reload = () =>
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as unknown as PerformanceEntry])

    it('joins again after a reload, mic off, once the rooms are known, and says so (reload-rejoin)', async () => {
        reload()
        keepRoom({ serverId: 'ot', channelId: 'thao-luan' })
        useVoiceStore.setState({ mic: 'on' })
        const { rerender } = session(undefined)
        expect(livekit.joinRoom).not.toHaveBeenCalled()
        rerender({ rooms: directory([room()]) })
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
        expect(useVoiceStore.getState().mic).toBe('off')
        expect(await screen.findByText('Back in Phòng thảo luận nhóm · your mic is off')).toBeVisible()
    })

    it('still joins again when the shell is drawn again before the rooms are known (signing in on a reload)', async () => {
        reload()
        keepRoom({ serverId: 'ot', channelId: 'thao-luan' })
        session(undefined).unmount()
        session(directory([room()]))
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
    })

    it('joins again when the timeout the rooms still hold is over', async () => {
        reload()
        keepRoom({ serverId: 'ot', channelId: 'thao-luan' })
        session(directory([room({ timeoutUntil: new Date(Date.now() - 60_000).toISOString() })]))
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
    })

    it('does not join again a room gone or closed to one meanwhile', async () => {
        reload()
        keepRoom({ serverId: 'ot', channelId: 'thao-luan' })
        session(directory([room({ canConnect: false })]))
        keepRoom({ serverId: 'ot', channelId: 'gone' })
        session(directory([room()]))
        await act(async () => undefined)
        expect(voiceApi.requestVoiceToken).not.toHaveBeenCalled()
    })

    it('says where one went when put out for a room joined elsewhere (07 câu L3-b)', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
        const { rerender } = session(directory([room()]))
        act(() => linkEvents[0]?.onEnd('removed'))
        rerender({ rooms: directory([room({ people: [person(AN, 'An')] })]) })
        expect(
            await screen.findByText('You joined Phòng thảo luận nhóm in another tab or on another device')
        ).toBeVisible()
        expect(useVoiceStore.getState().removed).toBeNull()
    })

    it('forgets being put out once its new room has not shown for a while', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        useVoiceStore.setState({ removed: { channelId: 'quiet', at: Date.now() } })
        session(directory([room()]))
        await act(async () => vi.advanceTimersByTimeAsync(MOVED_WINDOW_MS))
        expect(useVoiceStore.getState().removed).toBeNull()
    })

    it('says its mic again when its own row says otherwise, and when the socket is back (D-206)', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        sendRealtimeSignal.mockClear()
        const { rerender } = session(directory([room({ people: [person(AN, 'An')] })]))
        expect(sendRealtimeSignal).not.toHaveBeenCalled()
        rerender({ rooms: directory([room({ people: [person(AN, 'An', { micOn: true })] })]) })
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: false })
        sendRealtimeSignal.mockClear()
        act(() => realtime.listeners.get('ready')?.())
        expect(sendRealtimeSignal).toHaveBeenCalledTimes(1)
    })
})
