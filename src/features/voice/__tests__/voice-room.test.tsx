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
import type { JoinDevices, LinkEvents } from '@/lib/livekit'
import type { RoomPerson, VoiceDirectory, VoiceRoom, VoiceToken } from '../types'

const voiceApi = {
    requestVoiceToken: vi.fn<(channelId: string) => Promise<VoiceToken>>(),
    leaveVoiceRoom: vi.fn(async () => undefined)
}
vi.mock('../api/voice.api', () => voiceApi)

const linkEvents: LinkEvents[] = []
const setCamera = vi.fn(async (on: boolean) => (on ? 'on' : 'off'))
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, devices: JoinDevices, events: LinkEvents) => {
        linkEvents.push(events)
        return {
            link: {
                room: { name: 'live' },
                leave: vi.fn(async () => undefined),
                setMic: vi.fn(async () => 'on'),
                setCamera
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
    tracks: new Map<string, { attach: (element: HTMLVideoElement) => void; detach: () => void }>()
}))
const cameraTrack = (identity: string) => {
    if (!live.tracks.has(identity)) live.tracks.set(identity, { attach: vi.fn(), detach: vi.fn() })
    return live.tracks.get(identity)
}
vi.mock('livekit-client', () => ({ Track: { Source: { Camera: 'camera' } } }))
vi.mock('@livekit/components-react', () => ({
    RoomContext: createContext(undefined),
    useParticipants: () =>
        live.participants.map((participant) => ({
            ...participant,
            getTrackPublication: (source: string) =>
                source === 'camera' && live.cameras.includes(participant.identity)
                    ? { isMuted: false, track: cameraTrack(participant.identity) }
                    : undefined
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
    live.cameras = []
    live.tracks.clear()
    setCamera.mockClear()
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

describe('the dock away from the room (InRoomDock voice, C-09)', () => {
    const dock = (shape: 'column' | 'strip', canSpeak = true) =>
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

        sendRealtimeSignal.mockClear()
        act(() => useVoiceStore.setState({ camera: 'on' }))
        rerender({ rooms: directory([room({ people: [person(AN, 'An')] })]) })
        expect(sendRealtimeSignal).toHaveBeenCalledWith('voice.self_state', { mic: false, camera: true })
    })
})
