import { createContext, StrictMode, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { DeviceAnswer, JoinDevices, LinkEvents } from '@/lib/livekit'
import type { Room } from 'livekit-client'
import type { RoomPerson, VoiceDirectory, VoiceRoom, VoiceToken } from '../types'
import type { RoomSession } from '@/features/study'
import { solo, session as studySession } from '@/test/study-sessions'
import { studyKeys } from '@/features/study/api/keys'
import { noteServerTime } from '@/lib/server-clock'

const voiceApi = {
    requestVoiceToken: vi.fn<(channelId: string) => Promise<VoiceToken>>(),
    leaveVoiceRoom: vi.fn(async () => undefined),
    muteParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined),
    unmuteParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined),
    disconnectParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined)
}
vi.mock('../api/voice.api', () => voiceApi)

const linkEvents: LinkEvents[] = []
const setMic = vi.fn(async (on: boolean): Promise<DeviceAnswer> => (on ? 'on' : 'off'))
const setCamera = vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
const setScreen = vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, devices: JoinDevices, events: LinkEvents) => {
        linkEvents.push(events)
        return {
            link: {
                room: { name: 'live' },
                leave: vi.fn(async () => undefined),
                setMic,
                setCamera,
                setScreen
            },
            micState: 'off',
            cameraState: devices.camera ? 'on' : 'off'
        }
    })
}
vi.mock('@/lib/livekit', () => livekit)

/**
 * LiveKit's view of the room, as `@livekit/components-react` gives it:
 * people, and whose camera sends a picture (a camera track, attached to a
 * <video> by the page).
 */
const live = vi.hoisted(() => ({
    participants: [] as { identity: string; name: string; isMicrophoneEnabled: boolean; speaking?: boolean }[],
    cameras: [] as string[],
    /** Screens sent: muted by the server (another came first), or not yet received. */
    screens: [] as { identity: string; muted?: boolean; arriving?: boolean }[],
    tracks: new Map<string, { attach: (element: HTMLVideoElement) => void; detach: () => void }>()
}))
const cameraTrack = (identity: string) => {
    if (!live.tracks.has(identity)) live.tracks.set(identity, { attach: vi.fn(), detach: vi.fn() })
    return live.tracks.get(identity)
}
const screenTrack = (identity: string) => cameraTrack(`screen:${identity}`)
vi.mock('livekit-client', () => ({ Track: { Source: { Camera: 'camera', ScreenShare: 'screen_share' } } }))
vi.mock('@livekit/components-react', () => ({
    RoomContext: createContext(undefined),
    useParticipants: () =>
        live.participants.map((participant) => ({
            ...participant,
            getTrackPublication: (source: string) => {
                if (source === 'camera' && live.cameras.includes(participant.identity))
                    return { isMuted: false, track: cameraTrack(participant.identity) }
                const sent = live.screens.find((one) => one.identity === participant.identity)
                if (source === 'screen_share' && sent)
                    return {
                        isMuted: sent.muted ?? false,
                        track: sent.arriving ? undefined : screenTrack(participant.identity)
                    }
                return undefined
            }
        })),
    useIsSpeaking: (participant?: { speaking?: boolean }) => participant?.speaking ?? false
}))

/** The browser's camera on the preview page: one track, stopped when the camera goes off. */
function aCamera() {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] }
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
    return { stream, stop, getUserMedia }
}

const sendRealtimeSignal = vi.fn()
const realtime = vi.hoisted(() => ({ listeners: new Map<string, (data?: unknown) => void>() }))
vi.mock('@/features/realtime', () => ({
    sendRealtimeSignal,
    useConnectionBanner: () => null,
    onRealtimeEvent: (event: string, listener: (data?: unknown) => void) => {
        realtime.listeners.set(event, listener)
        return () => realtime.listeners.delete(event)
    }
}))

const { default: VoiceRoomView } = await import('../components/VoiceRoomView')
const { roomSessionOf } = await import('@/features/study')
const { default: InRoomDock } = await import('../components/InRoomDock')
const { useVoiceSession, MOVED_WINDOW_MS } = await import('../hooks/useVoiceSession')
const { resetSession, joinRoom, switchCamera, switchMic } = await import('../lib/session')
const { keepRoom, resetRejoin } = await import('../lib/rejoin')
const { useVoiceStore } = await import('../voice.store')

const AN = 'an'
const person = (id: string, name: string, on: Partial<RoomPerson> = {}): RoomPerson => ({
    user: { id, username: id, displayName: name, avatarUrl: null },
    roleIds: [],
    isOwner: false,
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
    session: null,
    cycle: { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null },
    canStartSession: false,
    canManageStudy: false,
    people: [TUAN, MINH, NAM],
    canConnect: true,
    canSpeak: true,
    canVideo: true,
    timeoutUntil: null,
    canMute: false,
    canMove: false,
    outranked: new Set(),
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
    live.cameras = []
    live.screens = []
    live.tracks.clear()
    setCamera.mockClear()
    setScreen.mockClear()
    setMic.mockClear()
    voiceApi.muteParticipant.mockClear()
    voiceApi.unmuteParticipant.mockClear()
    voiceApi.disconnectParticipant.mockClear()
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
        expect(screen.getByRole('button', { name: 'Turn on camera' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
        await expectNoA11yViolations()
    })

    it('marks a seat muted by a moderator, whatever their own mic says (C-20: mod-muted first)', async () => {
        show(room({ people: [person('nam', 'Nam', { modMuted: true, micOn: true })] }))
        const seats = screen.getByRole('list', { name: 'People in the room' })
        expect(within(seats).getByRole('listitem')).toHaveAccessibleName('Nam, muted by a moderator')
    })

    it("turns the camera on for one's own mirrored tile, and off when the page goes without joining (D-53, 07 câu L3b-c)", async () => {
        const camera = aCamera()
        const { unmount } = show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        expect(await screen.findByRole('button', { name: 'Turn off camera' })).toBeVisible()
        const picture = screen.getByTestId('own-picture') as HTMLVideoElement
        expect(picture.srcObject).toBe(camera.stream)
        expect(picture).toHaveStyle({ transform: 'scaleX(-1)', objectFit: 'cover' })
        await expectNoA11yViolations()
        unmount()
        expect(camera.stop).toHaveBeenCalled()
        expect(useVoiceStore.getState().camera).toBe('off')
    })

    it('turns the camera off when the room closes to one, or VIDEO goes, while it is on', async () => {
        const camera = aCamera()
        const { rerender } = show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        await screen.findByRole('button', { name: 'Turn off camera' })
        rerender(<VoiceRoomView room={room({ canVideo: false })} />)
        expect(camera.stop).toHaveBeenCalled()
        expect(useVoiceStore.getState()).toMatchObject({ camera: 'off', cameraPreview: null })

        camera.stop.mockClear()
        rerender(<VoiceRoomView room={room()} />)
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        await screen.findByRole('button', { name: 'Turn off camera' })
        rerender(<VoiceRoomView room={room({ timeoutUntil: new Date(Date.now() + 3_600_000).toISOString() })} />)
        expect(camera.stop).toHaveBeenCalled()
        expect(useVoiceStore.getState().camera).toBe('off')
    })

    it('joins with the camera the preview page turned on (REQ-VC-03)', async () => {
        aCamera()
        show(room())
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        await screen.findByRole('button', { name: 'Turn off camera' })
        await userEvent.click(screen.getByRole('button', { name: 'Join room' }))
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
        expect(livekit.joinRoom).toHaveBeenCalledWith(
            'ws://lk',
            'token',
            { mic: false, camera: true },
            expect.anything()
        )
        expect(useVoiceStore.getState().camera).toBe('on')
    })

    it('shows the camera blocked with how to fix it; mic and camera blocked share one Banner (S-MOD-04)', async () => {
        useVoiceStore.setState({ camera: 'blocked' })
        const { unmount } = show(room())
        expect(screen.getByText('Your browser is blocking the camera')).toBeVisible()
        expect(screen.getByRole('button', { name: 'Your browser is blocking the camera' })).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'How to fix' }))
        expect(await screen.findByText('Turn the camera back on')).toBeVisible()
        expect(screen.getByText('2. Under Camera, choose Allow.')).toBeVisible()
        // The steps sit inside the Popover's padding (C-15: 12–16), not against its border (M4 A3).
        expect(screen.getByRole('dialog')).toHaveClass('p-4')
        await expectNoA11yViolations()
        unmount()

        useVoiceStore.setState({ mic: 'blocked', camera: 'blocked' })
        show(room())
        expect(screen.getByText('Your browser is blocking the mic and camera · you can still listen')).toBeVisible()
        expect(screen.getAllByRole('button', { name: 'How to fix' })).toHaveLength(1)
    })

    it('leaves the Camera off without VIDEO, saying why (07 câu L3-c)', async () => {
        const camera = aCamera()
        show(room({ canVideo: false }))
        const button = screen.getByRole('button', {
            name: "You don't have permission to turn on your camera in this room"
        })
        expect(button).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(button)
        expect(camera.getUserMedia).not.toHaveBeenCalled()
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

    it('asks the Host of the session of the room this tab is in before switching (D-50); others switch at once', async () => {
        const { useHostLeave } = await import('@/features/study')
        await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
        voiceApi.requestVoiceToken.mockClear()
        const hosted = roomSessionOf(studySession({ channelId: 'quiet', hostId: AN }))
        const view = render(<VoiceRoomView room={room()} joinedSession={hosted} />, { wrapper: Providers })
        await userEvent.click(screen.getByRole('button', { name: 'Switch to this room' }))
        const asking = useHostLeave.getState().asking
        expect(asking).toMatchObject({ sessionId: hosted!.id, kind: 'switch' })
        expect(voiceApi.requestVoiceToken).not.toHaveBeenCalled()
        await act(async () => asking!.confirm())
        await waitFor(() => expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('thao-luan'))
        act(() => useHostLeave.setState({ asking: null }))
        view.unmount()

        await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
        voiceApi.requestVoiceToken.mockClear()
        const others = roomSessionOf(studySession({ channelId: 'quiet', hostId: 'binh' }))
        render(<VoiceRoomView room={room()} joinedSession={others} />, { wrapper: Providers })
        await userEvent.click(screen.getByRole('button', { name: 'Switch to this room' }))
        expect(useHostLeave.getState().asking).toBeNull()
        await waitFor(() => expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('thao-luan'))
    })

    it('says one is in this room elsewhere, and offers to join here (other-tab)', async () => {
        show(room({ people: [person(AN, 'An'), TUAN] }))
        expect(screen.getByText("You're in this room in another tab or on another device")).toBeVisible()
        expect(screen.getByRole('button', { name: 'Join here instead' })).toBeEnabled()
        expect(screen.getByRole('list', { name: 'People in the room' }).children).toHaveLength(1)
        await expectNoA11yViolations()
    })

    it('joins here as one already in the room: counted all along, no word of since when (D-236)', async () => {
        show(room({ people: [person(AN, 'An'), TUAN] }))
        await userEvent.click(screen.getByRole('button', { name: 'Join here instead' }))
        await waitFor(() => expect(useVoiceStore.getState().call).toMatchObject({ rejoined: true }))
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

describe("a study room's preview page (S-ROOM-01 session-running, idle, C-18)", () => {
    // The ring is a lazy chunk: under a full parallel run its import can outlast the 1 s default.
    const LAZY = { timeout: 5000 }
    const crowd = (count: number) => Array.from({ length: count }, (_, index) => person(`p${index}`, `Người ${index}`))
    const studyRoom = (more: Partial<VoiceRoom> = {}) =>
        room({ channelId: 'quiet', name: 'Phòng học im lặng', isStudyRoom: true, ...more })
    const BINH = person('binh', 'Bình')

    it('shows the ring of those in it, the Host at 12 o’clock, who is in which phase and who controls it, and when it began', async () => {
        noteServerTime(studySession().serverTime)
        const session = roomSessionOf(studySession({ channelId: 'quiet', hostId: 'binh' }))
        show(studyRoom({ session, people: [TUAN, MINH, BINH] }))
        expect(await screen.findByRole('timer', { name: /^Focus, round 2, 18 minutes left$/ }, LAZY)).toBeVisible()
        expect(screen.getByText('3 people focusing · Bình is in control')).toBeVisible()
        expect(screen.getByText(/^Study session started at \d{2}:\d{2}$/)).toBeVisible()
        const seats = screen.getByRole('group', { name: '3 people in the room' })
        expect(within(seats).getAllByRole('img')[0]).toHaveAccessibleName('Bình')
        expect(screen.getByRole('button', { name: 'Join room' })).toBeEnabled()
        await expectNoA11yViolations()
    })

    it('asks first while one’s Solo runs: joining a room with a session ends it (08 join-room-confirm); none without one', async () => {
        const { useSoloYield } = await import('@/features/study')
        const startCycle = { focus: 50, shortBreak: 10, longBreak: null, longBreakEvery: null }
        client.setQueryData(studyKeys.solo(), { session: solo(), startCycle })
        noteServerTime(studySession().serverTime)
        const session = roomSessionOf(studySession({ channelId: 'quiet', hostId: 'binh' }))
        const view = show(studyRoom({ session, people: [TUAN, BINH] }))
        await userEvent.click(await screen.findByRole('button', { name: 'Join room' }, LAZY))
        const asking = useSoloYield.getState().asking
        expect(asking).toMatchObject({ kind: 'join', room: 'Phòng học im lặng' })
        expect(voiceApi.requestVoiceToken).not.toHaveBeenCalled()
        await act(async () => asking!.confirm())
        await waitFor(() => expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('quiet'))
        act(() => useSoloYield.setState({ asking: null }))
        view.unmount()
        resetSession()
        voiceApi.requestVoiceToken.mockClear()

        client.setQueryData(studyKeys.solo(), { session: solo(), startCycle })
        show(studyRoom({ session: null, people: [TUAN] }))
        await userEvent.click(await screen.findByRole('button', { name: 'Join room' }, LAZY))
        expect(useSoloYield.getState().asking).toBeNull()
        await waitFor(() => expect(voiceApi.requestVoiceToken).toHaveBeenCalledWith('quiet'))
    })

    it('says no one controls it, or only who is on a break', async () => {
        noteServerTime(studySession().serverTime)
        const view = show(studyRoom({ session: roomSessionOf(studySession({ hostId: null })), people: [TUAN] }))
        expect(await screen.findByText('1 person focusing · No one is in control', {}, LAZY)).toBeVisible()
        view.rerender(
            <VoiceRoomView
                room={studyRoom({
                    session: roomSessionOf(studySession({ phase: 'short_break', phaseIndex: 3 })),
                    people: [TUAN, MINH]
                })}
            />
        )
        expect(await screen.findByText('2 people on a short break')).toBeVisible()
    })

    it('says "No study session yet" in the ring, or that the room is empty', async () => {
        const view = show(studyRoom({ people: [TUAN] }))
        expect(await screen.findByText('No study session yet', {}, LAZY)).toBeVisible()
        expect(screen.queryByText(/Study session started/)).toBeNull()
        view.rerender(<VoiceRoomView room={studyRoom({ people: [] })} />)
        expect(await screen.findByText('The room is empty')).toBeVisible()
    })

    it('in another session already, says the minutes left, not a second clock by the second (C-18)', async () => {
        noteServerTime(studySession().serverTime)
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        const elsewhere = roomSessionOf(studySession({ channelId: 'thao-luan' }))
        render(
            <VoiceRoomView
                room={studyRoom({ session: roomSessionOf(studySession({ channelId: 'quiet' })), people: [TUAN] })}
                joinedSession={elsewhere}
            />,
            { wrapper: Providers }
        )
        expect(await screen.findByText('18 minutes left', {}, LAZY)).toBeVisible()
        expect(screen.getByRole('timer', { name: 'Focus, round 2, 18 minutes left' })).toBeVisible()
    })

    it('in another session already, a paused one shows no number (C-19 list)', async () => {
        noteServerTime(studySession().serverTime)
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        const paused = roomSessionOf(
            studySession({ channelId: 'quiet', status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_122_000 })
        )
        render(
            <VoiceRoomView
                room={studyRoom({ session: paused, people: [TUAN] })}
                joinedSession={roomSessionOf(studySession({ channelId: 'thao-luan' }))}
            />,
            { wrapper: Providers }
        )
        expect(await screen.findByRole('timer', { name: 'Paused' }, LAZY)).toBeVisible()
        expect(screen.queryByText(/minutes left/)).toBeNull()
    })

    it('shows 11 seats and a "+N" that opens the people panel from 13 in it; a voice room’s row too', async () => {
        const opened = vi.fn()
        const view = render(<VoiceRoomView room={studyRoom({ people: crowd(13) })} onMorePeople={opened} />, {
            wrapper: Providers
        })
        const ring = await screen.findByRole('group', { name: '13 people in the room' }, LAZY)
        expect(within(ring).getAllByRole('img')).toHaveLength(11)
        await userEvent.click(within(ring).getByRole('button', { name: 'See all 13 people in the room' }))
        // The seat, for the focus to come back to, and the seats' order, for the panel's.
        expect(opened).toHaveBeenCalledWith(
            expect.any(HTMLButtonElement),
            crowd(13).map((one) => one.user.id)
        )
        view.unmount()

        render(<VoiceRoomView room={room({ people: crowd(13) })} onMorePeople={opened} />, { wrapper: Providers })
        const row = screen.getByRole('list', { name: 'People in the room' })
        expect(within(row).getAllByRole('listitem')).toHaveLength(12)
        expect(within(row).getByRole('button', { name: 'See all 13 people in the room' })).toBeVisible()
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
                .getAllByRole('button')
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

    it('shows the mic blocked in the room too, with how to fix it (S-ROOM-02 mic-blocked)', async () => {
        await joined()
        act(() => useVoiceStore.setState({ mic: 'blocked' }))
        expect(screen.getByText('Your browser is blocking the mic · you can still listen')).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'How to fix' }))
        expect(await screen.findByText('Turn the mic back on')).toBeVisible()
    })

    it('switches the camera in the room, sending the picture (C-21)', async () => {
        await joined()
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        expect(setCamera).toHaveBeenCalledWith(true)
        await waitFor(() => expect(useVoiceStore.getState().camera).toBe('on'))
        expect(screen.getByRole('button', { name: 'Turn off camera' })).toBeVisible()
    })

    describe("a moderator's menu on the tiles (D-207, D-208, ROOM-EDGE mod-menu-tile)", () => {
        const moderating = async (more: Partial<VoiceRoom> = {}) => {
            await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
            live.participants = [
                { identity: 'tuan', name: 'Tuấn', isMicrophoneEnabled: true },
                { identity: AN, name: 'An', isMicrophoneEnabled: false },
                { identity: 'nam', name: 'Nam', isMicrophoneEnabled: false },
                { identity: 'chu', name: 'Chủ', isMicrophoneEnabled: false },
                { identity: 'lan', name: 'Lan', isMicrophoneEnabled: false }
            ]
            return show(
                room({
                    people: [
                        TUAN,
                        person(AN, 'An'),
                        person('nam', 'Nam', { modMuted: true }),
                        person('chu', 'Chủ', { isOwner: true })
                    ],
                    canMute: true,
                    canMove: true,
                    outranked: new Set(['tuan', 'nam']),
                    ...more
                })
            )
        }

        it('offers Mute and Disconnect on people ranked below, none on oneself, the owner or someone not listed yet', async () => {
            await moderating()
            // The menu is fetched when needed: once Tuấn's ⋯ shows, any other would have too.
            const tuan = await screen.findByRole('button', { name: 'Manage Tuấn' })
            expect(screen.getByRole('button', { name: 'Manage Nam' })).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: 'Manage You' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Manage Chủ' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Manage Lan' })).toBeNull()
            await userEvent.click(tuan)
            const menu = await screen.findByRole('menu')
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent)
            ).toEqual(['Mute', 'Disconnect from room'])
            await expectNoA11yViolations()
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mute' }))
            await waitFor(() => expect(voiceApi.muteParticipant).toHaveBeenCalledWith('thao-luan', 'tuan'))
        })

        it('offers Unmute on someone muted, and opens at a right click', async () => {
            await moderating()
            const nam = screen.getByRole('button', { name: /^Nam, muted by a moderator/ })
            fireEvent.contextMenu(nam, { clientX: 20, clientY: 20 })
            const menu = await screen.findByRole('menu')
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Unmute' }))
            await waitFor(() => expect(voiceApi.unmuteParticipant).toHaveBeenCalledWith('thao-luan', 'nam'))

            fireEvent.contextMenu(nam, { clientX: 20, clientY: 20 })
            await userEvent.click(await screen.findByRole('menuitem', { name: 'Disconnect from room' }))
            await waitFor(() => expect(voiceApi.disconnectParticipant).toHaveBeenCalledWith('thao-luan', 'nam'))
        })

        it('offers only what the bits allow, and nothing without them', async () => {
            const { rerender } = await moderating({ canMove: false })
            await userEvent.click(await screen.findByRole('button', { name: 'Manage Tuấn' }))
            expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Mute'])
            await userEvent.keyboard('{Escape}')
            rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An')], outranked: new Set(['tuan']) })} />)
            expect(screen.queryByRole('button', { name: 'Manage Tuấn' })).toBeNull()
            fireEvent.contextMenu(screen.getByRole('button', { name: /^Tuấn/ }))
            expect(screen.queryByRole('menu')).toBeNull()
        })

        it('opens with Shift+F10 on a tile, and goes back to it when closed', async () => {
            await moderating()
            const tuan = screen.getByRole('button', { name: /^Tuấn/ })
            tuan.focus()
            await userEvent.keyboard('{Shift>}{F10}{/Shift}')
            expect(await screen.findByRole('menu')).toBeVisible()
            await userEvent.keyboard('{Escape}')
            await waitFor(() => expect(tuan).toHaveFocus())
        })
    })

    it('shows the Mic muted by a moderator: disabled, saying why, deaf to Ctrl+Shift+M (07 mod-muted)', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        live.participants = [{ identity: AN, name: 'An', isMicrophoneEnabled: false }]
        show(room({ people: [person(AN, 'An', { modMuted: true })] }))
        const mic = screen.getByRole('button', { name: 'A moderator muted your mic' })
        expect(screen.getByText('Muted')).toBeVisible()
        await userEvent.click(mic)
        await userEvent.keyboard('{Control>}{Shift>}m{/Shift}{/Control}')
        expect(setMic).not.toHaveBeenCalled()
        expect(useVoiceStore.getState().mic).toBe('off')
    })

    it('says no SPEAK first when one also is muted by a moderator: one rule for the label and the hint', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        live.participants = [{ identity: AN, name: 'An', isMicrophoneEnabled: false }]
        show(room({ canSpeak: false, people: [person(AN, 'An', { modMuted: true })] }))
        expect(screen.getByRole('button', { name: "You don't have permission to speak in this room" })).toBeVisible()
        expect(screen.queryByText('Muted')).toBeNull()
    })

    it("follows a moderator's word before the room's list catches up, both ways (D-207)", async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        live.participants = [{ identity: AN, name: 'An', isMicrophoneEnabled: false }]
        const { rerender } = show(room({ people: [person(AN, 'An')] }))
        act(() => useVoiceStore.setState({ modMuted: true }))
        expect(screen.getByRole('button', { name: 'A moderator muted your mic' })).toBeVisible()
        rerender(<VoiceRoomView room={room({ people: [person(AN, 'An', { modMuted: true })] })} />)
        act(() => useVoiceStore.setState({ modMuted: false }))
        expect(screen.getByRole('button', { name: 'Unmute (Ctrl Shift M)' })).toBeVisible()
    })

    describe('pictures and zooming in (C-20, 07 câu L3b-a, L3b-b)', () => {
        const filmed = async () => {
            await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
            live.participants = [
                { identity: AN, name: 'An', isMicrophoneEnabled: false },
                { identity: 'minh', name: 'Minh', isMicrophoneEnabled: false },
                { identity: 'nam', name: 'Nam', isMicrophoneEnabled: false }
            ]
            live.cameras = [AN, 'minh']
            const view = show(room({ people: [person(AN, 'An'), MINH, NAM] }))
            const tile = (name: RegExp) =>
                within(screen.getByRole('list', { name: 'People in the room' })).getByRole('button', { name })
            return { ...view, tile }
        }

        it('closes only the menu with Esc on a zoomed picture, the picture staying (00 Bàn phím: the nearest layer)', async () => {
            await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
            live.participants = [
                { identity: AN, name: 'An', isMicrophoneEnabled: false },
                { identity: 'minh', name: 'Minh', isMicrophoneEnabled: false }
            ]
            live.cameras = ['minh']
            show(room({ people: [person(AN, 'An'), MINH], canMute: true, outranked: new Set(['minh']) }))
            await userEvent.click(screen.getByRole('button', { name: /^Minh/ }))
            const zoomed = screen.getByRole('group', { name: 'Minh, zoomed in' })
            await userEvent.click(await within(zoomed).findByRole('button', { name: 'Manage Minh' }))
            expect(await screen.findByRole('menu')).toBeVisible()
            await userEvent.keyboard('{Escape}')
            await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
            expect(screen.getByRole('group', { name: 'Minh, zoomed in' })).toBeVisible()
        })

        it("shows the pictures of those with their camera on, one's own mirrored", async () => {
            const { tile } = await filmed()
            expect(tile(/^You/)).toHaveAccessibleName('You, mic off, camera on, press to zoom in')
            expect(tile(/^Minh/)).toHaveAccessibleName('Minh, mic off, camera on, press to zoom in')
            expect(tile(/^Nam/)).toHaveAccessibleName('Nam, mic off')
            const own = tile(/^You/).querySelector('video')
            expect(own).toHaveStyle({ transform: 'scaleX(-1)', objectFit: 'cover' })
            expect(live.tracks.get(AN)?.attach).toHaveBeenCalledWith(own)
            const minh = tile(/^Minh/).querySelector('video')
            expect(minh?.style.transform).toBe('')
            expect(live.tracks.get('minh')?.attach).toHaveBeenCalledWith(minh)
            expect(tile(/^Nam/).querySelector('video')).toBeNull()
            await expectNoA11yViolations()
        })

        it("shows only one's own picture, mirrored, under a study room's ring, while the camera is on (07 camera-on, D-56)", async () => {
            await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
            live.participants = [
                { identity: AN, name: 'An', isMicrophoneEnabled: false },
                { identity: 'minh', name: 'Minh', isMicrophoneEnabled: false }
            ]
            live.cameras = ['minh']
            const study = () =>
                room({
                    channelId: 'quiet',
                    name: 'Phòng học im lặng',
                    isStudyRoom: true,
                    people: [person(AN, 'An'), MINH]
                })
            const view = show(study())
            expect(await screen.findByText('No study session yet', {}, { timeout: 5000 })).toBeVisible()
            // Minh's camera is on: the ring shows nobody else's picture.
            expect(document.querySelector('video')).toBeNull()

            live.cameras = [AN, 'minh']
            view.rerender(<VoiceRoomView room={study()} />)
            const own = await waitFor(() => {
                const video = document.querySelector('video')
                expect(video).not.toBeNull()
                return video!
            })
            expect(document.querySelectorAll('video')).toHaveLength(1)
            expect(own).toHaveStyle({ transform: 'scaleX(-1)' })
            expect(live.tracks.get(AN)?.attach).toHaveBeenCalledWith(own)
            const tile = own.parentElement!
            expect(within(tile).getByText('You')).toBeVisible()
            expect(within(tile).getByRole('img', { name: 'mic off' })).toBeInTheDocument()

            live.cameras = ['minh']
            view.rerender(<VoiceRoomView room={study()} />)
            await waitFor(() => expect(document.querySelector('video')).toBeNull())
        })

        it('zooms a tile with a picture onto the stage, and back with a click, the button or Esc', async () => {
            const { tile } = await filmed()
            await userEvent.click(tile(/^Nam/))
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()

            await userEvent.click(tile(/^Minh/))
            expect(screen.queryByRole('list', { name: 'People in the room' })).not.toBeInTheDocument()
            const stage = screen.getByRole('group', { name: 'Minh, zoomed in' })
            expect(stage.querySelector('video')).toHaveStyle({ objectFit: 'contain' })
            await expectNoA11yViolations()
            await userEvent.keyboard('{Escape}')
            expect(tile(/^Minh/)).toHaveFocus()

            await userEvent.click(tile(/^Minh/))
            await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()

            await userEvent.click(tile(/^Minh/))
            await userEvent.click(screen.getByRole('group', { name: 'Minh, zoomed in' }).querySelector('video')!)
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()
        })

        it('goes back to the grid, the keyboard on that tile, when the person zoomed in on turns their camera off', async () => {
            const { tile, rerender } = await filmed()
            tile(/^Minh/).focus()
            await userEvent.keyboard('{Enter}')
            expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveFocus()
            live.cameras = [AN]
            rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), MINH, NAM] })} />)
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()
            expect(tile(/^Minh/)).toHaveFocus()
            live.cameras = [AN, 'minh']
            rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), MINH, NAM] })} />)
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()
        })

        it('goes back to the grid when the person zoomed in on leaves, the keyboard in the grid', async () => {
            const { tile, rerender } = await filmed()
            tile(/^Minh/).focus()
            await userEvent.keyboard('{Enter}')
            live.participants = live.participants.filter((one) => one.identity !== 'minh')
            rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), NAM] })} />)
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()
            expect(tile(/^You/).ownerDocument.activeElement?.closest('ul')).toBe(
                screen.getByRole('list', { name: 'People in the room' })
            )
        })

        it('an Esc that closes the help leaves the tile zoomed in', async () => {
            const { tile } = await filmed()
            await userEvent.click(tile(/^Minh/))
            act(() => useVoiceStore.setState({ mic: 'blocked' }))
            await userEvent.click(screen.getByRole('button', { name: 'How to fix' }))
            await screen.findByText('Turn the mic back on')
            await userEvent.keyboard('{Escape}')
            await waitFor(() => expect(screen.queryByText('Turn the mic back on')).not.toBeInTheDocument())
            expect(screen.getByRole('group', { name: 'Minh, zoomed in' })).toBeVisible()
        })

        it('keeps the keyboard stop on the same person when someone before them leaves', async () => {
            const { tile, rerender } = await filmed()
            const LAN = person('lan', 'Lan')
            live.participants = [...live.participants, { identity: 'lan', name: 'Lan', isMicrophoneEnabled: false }]
            rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), MINH, NAM, LAN] })} />)
            tile(/^Nam/).focus()
            live.participants = live.participants.filter((one) => one.identity !== 'minh')
            rerender(<VoiceRoomView room={room({ people: [person(AN, 'An'), NAM, LAN] })} />)
            expect(tile(/^Nam/).tabIndex).toBe(0)
            expect(tile(/^Lan/).tabIndex).toBe(-1)
        })

        it('moves between tiles with ← →, one stop for the group, and zooms with Enter (S-ROOM-06 › Tương tác)', async () => {
            const { tile } = await filmed()
            const tiles = within(screen.getByRole('list', { name: 'People in the room' })).getAllByRole('button')
            expect(tiles.map((one) => one.tabIndex)).toEqual([0, -1, -1])
            tiles[0]?.focus()
            await userEvent.keyboard('{ArrowLeft}')
            expect(tiles[0]).toHaveFocus()
            await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
            expect(tile(/^Nam/)).toHaveFocus()
            await userEvent.keyboard('{Enter}')
            expect(screen.getByRole('list', { name: 'People in the room' })).toBeVisible()
            await userEvent.keyboard('{ArrowLeft}')
            expect(tile(/^Minh/)).toHaveFocus()
            expect(tile(/^Minh/).tabIndex).toBe(0)
            await userEvent.keyboard('{Enter}')
            expect(screen.getByRole('group', { name: 'Minh, zoomed in' })).toBeVisible()
            await userEvent.keyboard('{Escape}')
            expect(tile(/^Minh/)).toHaveFocus()
        })
    })
})

describe('a screen shared in the room (S-ROOM-07, C-31, D-101, D-102)', () => {
    const TUAN_SHARING = person('tuan', 'Tuấn', { micOn: true, screenSharing: true })
    const people = [
        { identity: 'tuan', name: 'Tuấn', isMicrophoneEnabled: true },
        { identity: AN, name: 'An', isMicrophoneEnabled: false },
        { identity: 'minh', name: 'Minh', isMicrophoneEnabled: false }
    ]
    const sharingRoom = (more: Partial<VoiceRoom> = {}) =>
        room({ people: [TUAN_SHARING, person(AN, 'An'), MINH], ...more })
    const canShare = () =>
        Object.defineProperty(navigator, 'mediaDevices', {
            value: { getDisplayMedia: vi.fn() },
            configurable: true
        })
    const inRoom = async (shown: VoiceRoom) => {
        canShare()
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        live.participants = people
        return show(shown)
    }
    const strip = () => screen.getByRole('list', { name: 'People in the room' })

    it("shows someone else's screen on the stage, everyone in the strip above, Share disabled saying who (viewing-voice)", async () => {
        live.screens = [{ identity: 'tuan' }]
        await inRoom(sharingRoom())
        const shared = screen.getByRole('group', { name: "Tuấn's screen" })
        const video = shared.querySelector('video')
        expect(screenTrack('tuan')?.attach).toHaveBeenCalledWith(video)
        // C-31 connecting until the picture plays.
        expect(within(shared).getByText("Loading Tuấn's screen…")).toBeVisible()
        expect(shared).toHaveAttribute('aria-busy', 'true')
        fireEvent.playing(video as HTMLVideoElement)
        expect(within(shared).queryByText("Loading Tuấn's screen…")).toBeNull()
        expect(within(shared).getByRole('button', { name: 'Full screen' })).toBeVisible()

        expect(strip().style.gridTemplateColumns).toBe('')
        expect(
            within(strip())
                .getAllByRole('button')
                .map((tile) => tile.getAttribute('aria-label'))
        ).toEqual(['You, mic off', 'Tuấn, mic on, sharing their screen', 'Minh, mic off'])
        expect(strip().querySelector('li')?.style.width).toBe('146px')

        const share = screen.getByRole('button', { name: 'Tuấn is sharing their screen' })
        expect(share).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(share)
        expect(setScreen).not.toHaveBeenCalled()
        expect(screen.getByText('Tuấn is sharing their screen', { selector: '[aria-live]' })).toBeInTheDocument()
        await expectNoA11yViolations()
    })

    it('goes back to the grid when the screen stops, and says so politely', async () => {
        live.screens = [{ identity: 'tuan' }]
        const { rerender } = await inRoom(sharingRoom())
        live.screens = []
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(screen.queryByRole('group', { name: "Tuấn's screen" })).toBeNull()
        expect(strip().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 480px))')
        expect(screen.getByText('Tuấn stopped sharing', { selector: '[aria-live]' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Share your screen' })).not.toHaveAttribute('aria-disabled')
    })

    it('shows the picture still on its way as connecting', async () => {
        live.screens = [{ identity: 'tuan', arriving: true }]
        await inRoom(sharingRoom())
        expect(screen.getByText("Loading Tuấn's screen…")).toBeVisible()
    })

    it('says connecting again when the picture goes, and keeps the stage while the link comes back (ROOM-EDGE)', async () => {
        live.screens = [{ identity: 'tuan' }]
        const { rerender } = await inRoom(sharingRoom())
        const video = screen.getByRole('group', { name: "Tuấn's screen" }).querySelector('video')
        fireEvent.playing(video as HTMLVideoElement)
        expect(screen.queryByText("Loading Tuấn's screen…")).toBeNull()
        live.screens = [{ identity: 'tuan', arriving: true }]
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(screen.getByText("Loading Tuấn's screen…")).toBeVisible()

        // LiveKit lets everyone go while it comes back: the stage stays, connecting, nothing read out.
        act(() => useVoiceStore.setState((state) => ({ call: state.call && { ...state.call, phase: 'reconnecting' } })))
        live.participants = []
        live.screens = []
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(screen.getByRole('group', { name: "Tuấn's screen" })).toBeVisible()
        expect(screen.getByText("Loading Tuấn's screen…")).toBeVisible()
        expect(screen.queryByText('Tuấn stopped sharing')).toBeNull()

        // Back, still no screen: the grid.
        act(() => useVoiceStore.setState((state) => ({ call: state.call && { ...state.call, phase: 'connected' } })))
        live.participants = people
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(screen.queryByRole('group', { name: "Tuấn's screen" })).toBeNull()
    })

    it('keeps the keyboard on the same tile as the grid becomes the strip and back', async () => {
        const { rerender } = await inRoom(room({ people: [TUAN, person(AN, 'An'), MINH] }))
        within(strip())
            .getByRole('button', { name: /^Minh,/ })
            .focus()
        live.screens = [{ identity: 'tuan' }]
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(within(strip()).getByRole('button', { name: /^Minh,/ })).toHaveFocus()
        live.screens = []
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(within(strip()).getByRole('button', { name: /^Minh,/ })).toHaveFocus()

        // Elsewhere already (the controls): left there.
        screen.getByRole('button', { name: 'Leave room' }).focus()
        live.screens = [{ identity: 'tuan' }]
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(screen.getByRole('button', { name: 'Leave room' })).toHaveFocus()
        // Nowhere, but last outside the stage: not pulled back either.
        screen.getByRole('button', { name: 'Leave room' }).blur()
        live.screens = []
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(document.body).toHaveFocus()
    })

    it('ignores a screen the server muted; of two sent at once, shows the one the API marks (D-101)', async () => {
        live.screens = [{ identity: 'minh', muted: true }]
        const { rerender } = await inRoom(room({ people: [TUAN, person(AN, 'An'), MINH] }))
        expect(screen.queryByRole('group', { name: "Minh's screen" })).toBeNull()

        live.screens = [{ identity: 'minh' }, { identity: 'tuan' }]
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(screen.getByRole('group', { name: "Tuấn's screen" })).toBeVisible()
        const minhSharing = person('minh', 'Minh', { cameraOn: true, screenSharing: true })
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), minhSharing] })} />)
        expect(screen.getByRole('group', { name: "Minh's screen" })).toBeVisible()
        // No mark yet: LiveKit's first.
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(screen.getByRole('group', { name: "Tuấn's screen" })).toBeVisible()
    })

    it("shares one's own screen: the card instead of one's own picture, stopped from it (C-31 self, P7)", async () => {
        const { rerender } = await inRoom(room({ people: [TUAN, person(AN, 'An'), MINH] }))
        await userEvent.click(screen.getByRole('button', { name: 'Share your screen' }))
        expect(setScreen).toHaveBeenCalledWith(true)
        await waitFor(() => expect(useVoiceStore.getState().screen).toBe('on'))
        live.screens = [{ identity: AN }]
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An', { screenSharing: true }), MINH] })} />)

        expect(screen.getByText("You're sharing your screen")).toBeVisible()
        expect(screen.getByText('Everyone in the room sees the window you chose.')).toBeVisible()
        expect(screen.queryByRole('group', { name: "An's screen" })).toBeNull()
        expect(document.querySelector('video')).toBeNull()
        // The card's button, then the control's.
        const control = screen.getAllByRole('button', { name: 'Stop sharing' }).at(-1)
        expect(screen.getByText('Stop sharing', { selector: 'span' })).toBeVisible()
        // Not read out: one's own.
        expect(document.querySelector('[aria-live]')?.textContent).toBe('')
        await expectNoA11yViolations()

        const card = screen.getByText("You're sharing your screen").parentElement as HTMLElement
        await userEvent.click(within(card).getByRole('button', { name: 'Stop sharing' }))
        expect(setScreen).toHaveBeenLastCalledWith(false)
        await waitFor(() => expect(useVoiceStore.getState().screen).toBe('off'))
        expect(control).toHaveFocus()
    })

    it('no Share without VIDEO, or where the browser cannot share a screen (C-21, 07 ROOM-EDGE)', async () => {
        const { rerender } = await inRoom(room({ canVideo: false }))
        expect(screen.queryByRole('button', { name: 'Share your screen' })).toBeNull()
        rerender(<VoiceRoomView room={room()} />)
        expect(screen.getByRole('button', { name: 'Share your screen' })).toBeVisible()
        Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true })
        rerender(<VoiceRoomView room={room({ name: 'again' })} />)
        expect(screen.queryByRole('button', { name: 'Share your screen' })).toBeNull()
    })

    it('a shared screen takes the place of a tile zoomed in; it stopping goes back to the grid, not the zoom', async () => {
        live.cameras = ['minh']
        const { rerender } = await inRoom(room({ people: [TUAN, person(AN, 'An'), MINH] }))
        await userEvent.click(screen.getByRole('button', { name: /^Minh,/ }))
        expect(screen.getByRole('group', { name: 'Minh, zoomed in' })).toBeVisible()
        live.screens = [{ identity: 'tuan' }]
        rerender(<VoiceRoomView room={sharingRoom()} />)
        expect(screen.queryByRole('group', { name: 'Minh, zoomed in' })).toBeNull()
        // Strip tiles do not zoom, nor say they would.
        expect(within(strip()).getByRole('button', { name: /^Minh,/ })).not.toHaveAccessibleName(/zoom/)
        await userEvent.click(within(strip()).getByRole('button', { name: /^Minh,/ }))
        expect(screen.queryByRole('group', { name: 'Minh, zoomed in' })).toBeNull()
        live.screens = []
        rerender(<VoiceRoomView room={room({ people: [TUAN, person(AN, 'An'), MINH] })} />)
        expect(screen.queryByRole('group', { name: 'Minh, zoomed in' })).toBeNull()
        expect(strip().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 480px))')
    })

    it('moves along the strip with the arrow keys, one stop for all of it', async () => {
        live.screens = [{ identity: 'tuan' }]
        await inRoom(sharingRoom())
        const tiles = within(strip()).getAllByRole('button')
        expect(tiles.map((tile) => tile.tabIndex)).toEqual([0, -1, -1])
        tiles[0]!.focus()
        await userEvent.keyboard('{ArrowRight}')
        expect(tiles[1]).toHaveFocus()
    })

    it('shows ‹ / › only at an end that hides someone, and pages the strip (C-31)', async () => {
        live.screens = [{ identity: 'tuan' }]
        await inRoom(sharingRoom())
        const row = strip()
        const scrollBy = vi.fn()
        Object.assign(row, { scrollBy })
        Object.defineProperties(row, {
            clientWidth: { value: 300, configurable: true },
            scrollWidth: { value: 454, configurable: true },
            scrollLeft: { value: 0, configurable: true, writable: true }
        })
        fireEvent.scroll(row)
        const more = screen.getAllByRole('button', { name: 'See more people' })
        expect(more).toHaveLength(1)
        await userEvent.click(more[0]!)
        expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' })

        Object.defineProperty(row, 'scrollLeft', { value: 154, configurable: true })
        fireEvent.scroll(row)
        expect(screen.getAllByRole('button', { name: 'See more people' })).toHaveLength(1)
        await userEvent.click(screen.getByRole('button', { name: 'See more people' }))
        expect(scrollBy).toHaveBeenLastCalledWith({ left: -240, behavior: 'smooth' })
    })

    it('goes full screen and back from the button on the screen (C-31 fullscreen)', async () => {
        live.screens = [{ identity: 'tuan' }]
        await inRoom(sharingRoom())
        const requestFullscreen = vi.fn(async () => undefined)
        const exitFullscreen = vi.fn(async () => undefined)
        Object.assign(HTMLElement.prototype, { requestFullscreen })
        Object.assign(document, { exitFullscreen })
        const shared = screen.getByRole('group', { name: "Tuấn's screen" })
        await userEvent.click(within(shared).getByRole('button', { name: 'Full screen' }))
        expect(requestFullscreen).toHaveBeenCalled()
        const frame = requestFullscreen.mock.contexts[0] as HTMLElement
        expect(frame.contains(shared)).toBe(true)

        Object.defineProperty(document, 'fullscreenElement', { value: frame, configurable: true })
        fireEvent(document, new Event('fullscreenchange'))
        await userEvent.click(within(shared).getByRole('button', { name: 'Exit full screen' }))
        expect(exitFullscreen).toHaveBeenCalled()
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true })
    })
})

describe('the dock away from the room (InRoomDock voice, C-09)', () => {
    const dock = (shape: 'column' | 'strip', canSpeak = true, modMuted = false, session: RoomSession | null = null) =>
        render(
            <InRoomDock
                shape={shape}
                to='/channels/ot/thao-luan'
                room={{
                    serverId: 'ot',
                    channelId: 'thao-luan',
                    name: 'Phòng thảo luận nhóm',
                    canSpeak,
                    canVideo: canSpeak,
                    modMuted,
                    session,
                    count: 4
                }}
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
        await userEvent.click(screen.getByRole('button', { name: 'Turn on camera' }))
        await waitFor(() => expect(useVoiceStore.getState().camera).toBe('on'))
        expect(setCamera).toHaveBeenCalledWith(true)
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
        await userEvent.click(
            screen.getByRole('button', { name: "You don't have permission to turn on your camera in this room" })
        )
        expect(setCamera).not.toHaveBeenCalled()
    })

    it('with a study session: its phase, the time left by the second, the round (room-session, S-ROOM-05)', async () => {
        noteServerTime(studySession().serverTime)
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        const view = dock('column', true, false, roomSessionOf(studySession()))
        // The link is named by the phase and the room, never the seconds.
        const link = screen.getByRole('link', { name: 'Focus, Phòng thảo luận nhóm, Round 2' })
        expect(within(link).getByText('18:42')).toHaveClass('text-text-primary')
        // The minutes are read out only while the dock has the focus (C-09 › Accessibility), outside the link.
        const said = screen.getByText('Focus · 18 min left')
        expect(link).not.toContainElement(said)
        expect(said).toHaveAttribute('aria-live', 'off')
        act(() => link.focus())
        expect(said).toHaveAttribute('aria-live', 'polite')
        // From the link to a button of the dock: still within it.
        act(() => screen.getByRole('button', { name: 'Leave room' }).focus())
        expect(said).toHaveAttribute('aria-live', 'polite')
        act(() => link.blur())
        act(() => (document.activeElement as HTMLElement | null)?.blur())
        expect(said).toHaveAttribute('aria-live', 'off')
        await expectNoA11yViolations()

        view.unmount()
        const paused = studySession({ status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1_122_000 })
        dock('strip', true, false, roomSessionOf(paused))
        const still = screen.getByRole('link', { name: 'Paused, Phòng thảo luận nhóm, Round 2' })
        expect(within(still).getByText('18:42')).toHaveClass('text-text-secondary')
    })

    it('keeps the Mic off while a moderator has it muted', async () => {
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        dock('column', true, true)
        await userEvent.click(screen.getByRole('button', { name: 'A moderator muted your mic' }))
        expect(setMic).not.toHaveBeenCalled()
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

    it('another screen came first: the tab in that room stops its own and says who (share-race, D-101)', async () => {
        const rooms = directory([room({ people: [person('tuan', 'Tuấn', { screenSharing: true }), person(AN, 'An')] })])
        session(rooms)
        realtime.listeners.get('voice.share_rejected')?.({ channelId: 'thao-luan', userId: 'tuan' })
        expect(setScreen).not.toHaveBeenCalled()

        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        useVoiceStore.setState({ screen: 'on' })
        act(() => realtime.listeners.get('voice.share_rejected')?.({ channelId: 'quiet', userId: 'tuan' }))
        expect(setScreen).not.toHaveBeenCalled()
        // A Toast after it shows, so one about the other room would have too.
        act(() => void toast('after'))
        expect(await screen.findByText('after')).toBeVisible()
        expect(screen.queryByText(/started sharing their screen before you$/)).toBeNull()
        act(() => realtime.listeners.get('voice.share_rejected')?.({ channelId: 'thao-luan', userId: 'tuan' }))
        expect(setScreen).toHaveBeenCalledWith(false)
        expect(useVoiceStore.getState().screen).toBe('off')
        expect(await screen.findByText('Tuấn started sharing their screen before you')).toBeVisible()
    })

    it("names who came first by LiveKit's name while the room's list has not got them yet", async () => {
        session(directory([room({ people: [person(AN, 'An')] })]))
        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        const getParticipantByIdentity = vi.fn(() => ({ name: 'Phong' }))
        act(() => useVoiceStore.setState({ room: { getParticipantByIdentity } as unknown as Room }))
        act(() => realtime.listeners.get('voice.share_rejected')?.({ channelId: 'thao-luan', userId: 'phong' }))
        expect(await screen.findByText('Phong started sharing their screen before you')).toBeVisible()
        expect(getParticipantByIdentity).toHaveBeenCalledWith('phong')
    })

    it('says so when the server took the screen for VIDEO lost (ROOM-EDGE)', async () => {
        session(directory([room()]))
        act(() => useVoiceStore.setState({ screenRefused: Date.now() }))
        expect(await screen.findByText('You can no longer share your screen')).toBeVisible()
        expect(useVoiceStore.getState().screenRefused).toBeNull()
    })

    it('says so when another app holds the camera or mic: the button off, not blocked (S-MOD-04 device-busy)', async () => {
        session(directory([room()]))
        const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Device in use', 'NotReadableError'))
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
        await act(() => switchCamera(true))
        expect(useVoiceStore.getState()).toMatchObject({ camera: 'off', cameraPreview: null })
        expect(await screen.findByText('Another app is using your camera')).toBeVisible()

        await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
        setMic.mockResolvedValueOnce('busy')
        await act(() => switchMic(true))
        expect(useVoiceStore.getState().mic).toBe('off')
        expect(await screen.findByText('Another app is using your mic')).toBeVisible()
        expect(useVoiceStore.getState().deviceBusy).toBeNull()
    })

    it('joins again after a reload, mic off, once the rooms are known, and says so (reload-rejoin)', async () => {
        reload()
        keepRoom({ serverId: 'ot', channelId: 'thao-luan' })
        useVoiceStore.setState({ mic: 'on' })
        const { rerender } = session(undefined)
        expect(livekit.joinRoom).not.toHaveBeenCalled()
        rerender({ rooms: directory([room()]) })
        await waitFor(() => expect(useVoiceStore.getState().call?.phase).toBe('connected'))
        expect(useVoiceStore.getState().mic).toBe('off')
        const said = await screen.findByText('Back in Phòng thảo luận nhóm · your mic is off')
        expect(said).toBeVisible()
        expect(said.closest('[data-sonner-toast]')?.querySelector('.lucide-rotate-cw')).not.toBeNull()
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
        const said = await screen.findByText('You joined Phòng thảo luận nhóm in another tab or on another device')
        expect(said).toBeVisible()
        expect(said.closest('[data-sonner-toast]')?.querySelector('.lucide-monitor-smartphone')).not.toBeNull()
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

        sendRealtimeSignal.mockClear()
        act(() => useVoiceStore.setState({ camera: 'on' }))
        rerender({ rooms: directory([room({ people: [person(AN, 'An')] })]) })
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: true })
    })

    describe("what a moderator or the server did to one's room (D-207, D-212)", () => {
        const inLounge = async () => {
            await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
            await act(async () => useVoiceStore.setState({ mic: 'on' }))
        }
        const hear = (event: string, data: unknown) => act(() => realtime.listeners.get(event)?.(data))

        it('says the mic was muted, and turns it off, only in the tab in that room', async () => {
            await inLounge()
            session(directory([room()]))
            hear('voice.muted', { channelId: 'quiet', muted: true })
            expect(screen.queryByText('A moderator muted your mic')).toBeNull()
            hear('voice.muted', { channelId: 'thao-luan', muted: true })
            expect(await screen.findByText('A moderator muted your mic')).toBeVisible()
            await waitFor(() => expect(useVoiceStore.getState().mic).toBe('off'))
            expect(setMic).toHaveBeenLastCalledWith(false)
        })

        it('says the mic may be turned on again when unmuted, the mic still off (07 câu L4b-a)', async () => {
            await inLounge()
            session(directory([room()]))
            hear('voice.muted', { channelId: 'thao-luan', muted: false })
            expect(await screen.findByText('You can turn your mic on again')).toBeVisible()
            expect(setMic).not.toHaveBeenCalled()
        })

        it("turns the mic off when one's own row says muted, the event missed", async () => {
            await inLounge()
            session(directory([room({ people: [person(AN, 'An', { modMuted: true })] })]))
            await waitFor(() => expect(useVoiceStore.getState().mic).toBe('off'))
        })

        it.each([
            ['moderator', 'You were disconnected from the room'],
            ['permission', 'You no longer have access to this room · you left it'],
            ['channel_deleted', 'This room is no longer available']
        ])('says why one was put out: %s', async (reason, words) => {
            await inLounge()
            session(directory([room()]))
            hear('voice.disconnected', { channelId: 'thao-luan', reason })
            expect(await screen.findByText(words)).toBeVisible()
        })

        it('adds one’s minutes in the session there once told, before or after the word (07 › Edge, D-233)', async () => {
            const { hearLeft } = await import('@/features/study/study.store')
            await inLounge()
            const withSession = room({
                isStudyRoom: true,
                session: roomSessionOf(studySession({ channelId: 'thao-luan' }))
            })
            session(directory([withSession]))
            // The session ended with the room deleted: its word may come first.
            act(() => hearLeft({ sessionId: 's1', channelId: 'thao-luan', seconds: 1860 }))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'channel_deleted' })
            // Asked for: toasts of the tests before may still be leaving the stack.
            expect(await screen.findByText('This room is no longer available · 31 minutes counted')).toBeInTheDocument()

            await joinRoom({ serverId: 'ot', channelId: 'thao-luan', name: 'Phòng thảo luận nhóm' })
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'moderator' })
            expect(await screen.findByText(/^You were disconnected from the room/)).toBeInTheDocument()
            act(() => hearLeft({ sessionId: 's1', channelId: 'thao-luan', seconds: 1920 }))
            expect(
                await screen.findByText('You were disconnected from the room · 32 minutes counted')
            ).toBeInTheDocument()
        })

        it('says nothing for a kick, a ban, a server left, or a room this tab is not in', async () => {
            await inLounge()
            session(directory([room()]))
            for (const reason of ['kick', 'ban', 'server_left'])
                hear('voice.disconnected', { channelId: 'thao-luan', reason })
            hear('voice.disconnected', { channelId: 'quiet', reason: 'moderator' })
            hear('voice.muted', { channelId: 'quiet', muted: true })
            // A Toast shows a moment after it is asked for: one that does show proves the others never came.
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'permission' })
            expect(await screen.findByText('You no longer have access to this room · you left it')).toBeVisible()
            expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1)
            expect(useVoiceStore.getState().mic).toBe('on')
        })

        it('keeps the last word on the mute until the list says the same, and forgets it on leaving', async () => {
            await inLounge()
            const { rerender } = session(directory([room()]))
            hear('voice.muted', { channelId: 'thao-luan', muted: true })
            expect(useVoiceStore.getState().modMuted).toBe(true)
            rerender({ rooms: directory([room({ people: [person(AN, 'An', { modMuted: true })] })]) })
            await waitFor(() => expect(useVoiceStore.getState().modMuted).toBeNull())
            hear('voice.muted', { channelId: 'thao-luan', muted: false })
            expect(useVoiceStore.getState().modMuted).toBe(false)
            act(() => linkEvents[0]?.onEnd('removed'))
            expect(useVoiceStore.getState().modMuted).toBeNull()
        })

        const elsewhere = /in another tab or on another device/
        const inQuiet = () =>
            directory([room(), room({ channelId: 'quiet', name: 'Phòng học im lặng', people: [person(AN, 'An')] })])

        it('never says "joined elsewhere" when the API said why one was put out, its word kept past LiveKit\'s', async () => {
            await inLounge()
            const { rerender } = session(directory([room()]))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'moderator' })
            act(() => linkEvents[0]?.onEnd('removed'))
            expect(useVoiceStore.getState().removed?.reason).toBe('moderator')
            // The account then shows in another room (joined in another tab within the window).
            rerender({ rooms: inQuiet() })
            expect(await screen.findByText('You were disconnected from the room')).toBeInTheDocument()
            await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
            expect(screen.queryByText(elsewhere)).toBeNull()
        })

        it('never says "joined elsewhere" for the room this very tab joined since', async () => {
            await inLounge()
            const { rerender } = session(directory([room()]))
            act(() => linkEvents[0]?.onEnd('removed'))
            await joinRoom({ serverId: 'ot', channelId: 'quiet', name: 'Phòng học im lặng' })
            rerender({ rooms: inQuiet() })
            await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
            expect(screen.queryByText(elsewhere)).toBeNull()
        })

        it('says one Toast when the room this tab was in closes to one and leaves the list (lost access, page gone)', async () => {
            await inLounge()
            session(directory([room()]))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'permission' })
            expect(await screen.findByText('You no longer have access to this room · you left it')).toBeVisible()
            // The channel page's own Toast for a room gone from the list (ChannelPage › Removed).
            act(() => void toast('This room is no longer available', { id: 'channel-removed' }))
            expect(await screen.findByText('This room is no longer available')).toBeVisible()
            expect(document.querySelectorAll('[data-sonner-toast]')).toHaveLength(1)
        })

        it('still says it when LiveKit put the tab out first', async () => {
            await inLounge()
            session(directory([room()]))
            act(() => linkEvents[0]?.onEnd('removed'))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'moderator' })
            expect(await screen.findByText('You were disconnected from the room')).toBeVisible()
        })

        it('says until when a timeout runs, once the servers know it (D-54)', async () => {
            await inLounge()
            const { rerender } = session(directory([room()]))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'timeout' })
            await act(async () => undefined)
            expect(screen.queryByText(/timed out/)).toBeNull()
            rerender({ rooms: directory([room({ timeoutUntil: new Date(Date.now() + 3_600_000).toISOString() })]) })
            expect(await screen.findByText(/^You're timed out until .+ · you left the room$/)).toBeVisible()
        })

        it("says the plain words when the servers held still don't know until when after a while", async () => {
            vi.useFakeTimers({ shouldAdvanceTime: true })
            await inLounge()
            session(directory([room()]))
            hear('voice.disconnected', { channelId: 'thao-luan', reason: 'timeout' })
            await act(async () => vi.advanceTimersByTimeAsync(MOVED_WINDOW_MS - 1000))
            expect(screen.queryByText('You were disconnected from the room')).toBeNull()
            await act(async () => vi.advanceTimersByTimeAsync(1000))
            expect(await screen.findByText('You were disconnected from the room')).toBeVisible()
        })
    })
})
