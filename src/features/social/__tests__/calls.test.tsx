import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import type { ReactNode } from 'react'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { flushBeforeSignOut } from '@/lib/before-sign-out'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Call, CallJoin, Dm, MyCall, Relationship } from '../types'

const callsApi = {
    fetchMyCall: vi.fn<() => Promise<MyCall>>(),
    startCall: vi.fn<(dmId: string, video: boolean, key: string) => Promise<Call>>(),
    acceptCall: vi.fn<(callId: string) => Promise<Call>>(),
    declineCall: vi.fn<(callId: string) => Promise<Call>>(),
    endCall: vi.fn<(callId: string, onLeave?: boolean) => Promise<Call>>(),
    joinCall: vi.fn<(callId: string) => Promise<CallJoin>>()
}
vi.mock('../api/calls.api', () => callsApi)
vi.mock('../api/social.api', () => ({ fetchRelationships: vi.fn(async (): Promise<Relationship[]> => []) }))
const dmsApi = { fetchDms: vi.fn<() => Promise<Dm[]>>(), openDm: vi.fn(), closeDm: vi.fn() }
vi.mock('../api/dms.api', () => dmsApi)
vi.mock('@/features/messaging/api/messages.api', () => ({
    fetchMessages: vi.fn(async () => ({ items: [], hasMoreBefore: false, hasMoreAfter: false })),
    sendMessage: vi.fn()
}))
vi.mock('@/features/messaging/api/readStates.api', () => ({
    fetchReadStates: vi.fn(async () => []),
    ackChannel: vi.fn()
}))
const devices = { askMicrophone: vi.fn(async (): Promise<'on' | 'off' | 'blocked' | 'busy'> => 'on') }
vi.mock('@/features/voice/lib/devices', async (original) => ({
    ...(await original<typeof import('@/features/voice/lib/devices')>()),
    askMicrophone: () => devices.askMicrophone()
}))
const sounds = { startCallLoop: vi.fn((_loop: string) => sounds.stop), stop: vi.fn(), playCallEnd: vi.fn() }
vi.mock('@/lib/call-sounds', () => ({
    startCallLoop: (loop: string) => sounds.startCallLoop(loop),
    playCallEnd: () => sounds.playCallEnd()
}))
// LiveKit, as the call joins it: a link whose mic and camera do as asked.
const link = {
    room: {},
    setMic: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
    setCamera: vi.fn(async (on: boolean) => (on ? 'on' : 'off')),
    setScreen: vi.fn(),
    leave: vi.fn(async () => undefined)
}
const livekit = {
    joinRoom: vi.fn(async (_url: string, _token: string, devices: { mic: boolean; camera: boolean }) => ({
        link,
        micState: devices.mic ? 'on' : 'off',
        cameraState: devices.camera ? 'on' : 'off'
    }))
}
vi.mock('@/lib/livekit', () => ({ joinRoom: livekit.joinRoom }))
const voiceSession = { leaveRoom: vi.fn(async () => undefined) }
vi.mock('@/features/voice/lib/session', async (original) => ({
    ...(await original<typeof import('@/features/voice/lib/session')>()),
    leaveRoom: () => voiceSession.leaveRoom()
}))
vi.mock('@livekit/components-react', () => ({
    RoomContext: { Provider: ({ children }: { children: ReactNode }) => children },
    useParticipants: () => [],
    useIsSpeaking: () => false
}))

const { default: DirectMessage } = await import('../pages/DirectMessage')
const { default: Friends } = await import('../pages/Friends')
const { useDms } = await import('../api/useDms')
const { CallWatch } = await import('../components/call/CallWatch')
const { CallDockSlot } = await import('../components/call/CallDockSlot')
const { resetCallSession } = await import('../lib/call-session')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { useVoiceStore } = await import('@/features/voice')
const { connectChatLinks } = await import('../lib/chat-links')
const { connectRoomLookup } = await import('../lib/room-lookup')

connectChatLinks(() => ({
    readLink: () => null,
    channel: () => ({ kind: 'hidden' }),
    server: (serverId: string, name: string) => ({ name, iconUrl: null, initials: 'S', path: `/channels/${serverId}` })
}))
connectRoomLookup(() => ({ roomOf: () => null }))

const BINH = { id: 'binh', username: 'binh.tran', displayName: 'Bình', avatarUrl: null }
const CHI = { id: 'chi', username: 'chi.le', displayName: 'Chi', avatarUrl: null }
const dm = (id: string, user: typeof BINH): Dm => ({
    id,
    user,
    presence: 'online',
    activity: null,
    lastMessage: null,
    canMessage: true,
    createdAt: '2026-10-01T00:00:00.000Z'
})
const DMS = [dm('dm-binh', BINH), dm('dm-chi', CHI)]

/** A call between me (an) and someone; `out`: I called. */
function call(id: string, status: Call['status'], out = true, more: Partial<Call> = {}): Call {
    const user = more.user ?? BINH
    return {
        id,
        dmId: `dm-${user.id}`,
        callerId: out ? 'an' : user.id,
        calleeId: out ? user.id : 'an',
        video: false,
        status,
        endReason: null,
        user,
        // Just now: a card shows for 45 seconds from it.
        createdAt: new Date().toISOString(),
        acceptedAt: status === 'active' || status === 'ended' ? new Date(Date.now() - 3000).toISOString() : null,
        endedAt: null,
        ...more
    }
}
const heard = (event: string, which: Call) => act(() => emitRealtimeEvent(event, { call: which }))

function Shell() {
    useDms()
    return (
        <>
            <Outlet />
            <CallDockSlot shape='strip' />
            <CallWatch />
        </>
    )
}

function renderAt(at: string, before: string[] = []) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.nguyen', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: 'Asia/Ho_Chi_Minh' })
    const router = createMemoryRouter(
        [
            {
                element: <Shell />,
                children: [
                    { path: '/friends', element: <Friends /> },
                    { path: '/dm/:dmId', element: <DirectMessage /> },
                    { path: '/study', element: <h1>Học</h1> }
                ]
            }
        ],
        { initialEntries: [...before, at], initialIndex: before.length }
    )
    render(
        <QueryClientProvider client={client}>
            <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection: null }}>
                <TooltipProvider>
                    <RouterProvider router={router} />
                    <Toaster />
                </TooltipProvider>
            </ShellContext.Provider>
        </QueryClientProvider>
    )
    return { client, router }
}

const stage = () => screen.findByRole('region', { name: 'Cuộc gọi với Bình' })
/** My calls read and the page drawn: words of the socket come after. */
const settled = () => waitFor(() => expect(callsApi.fetchMyCall).toHaveBeenCalled())

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    resetCallSession()
    sessionStorage.clear()
    for (const fn of Object.values(callsApi)) fn.mockReset()
    callsApi.fetchMyCall.mockResolvedValue({ current: null, incoming: [] })
    callsApi.joinCall.mockImplementation(async (id) => ({
        call: call(id, 'active'),
        media: { url: 'wss://lk.test', token: 'tok' }
    }))
    dmsApi.fetchDms.mockResolvedValue(DMS)
    devices.askMicrophone.mockResolvedValue('on')
    sounds.startCallLoop.mockClear()
    sounds.stop.mockClear()
    sounds.playCallEnd.mockClear()
    livekit.joinRoom.mockClear()
    link.leave.mockClear()
    document.title = 'NezFocus'
})
afterEach(() => {
    act(() => void toast.dismiss())
})

describe('Gọi đi từ DM (09 S-CALL-01)', () => {
    it('rings out from the DM page with the mic asked first: Đang gọi…, Hủy, the ringback; my own Cancel shows nothing', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing'))
        callsApi.endCall.mockResolvedValue(call('c1', 'missed', true, { endReason: 'cancelled' }))
        renderAt('/dm/dm-binh')

        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))

        const page = await stage()
        expect(devices.askMicrophone).toHaveBeenCalled()
        expect(callsApi.startCall).toHaveBeenCalledWith('dm-binh', false, expect.any(String))
        expect(within(page).getByText('Đang gọi…')).toBeVisible()
        expect(sounds.startCallLoop).toHaveBeenCalledWith('ringback')
        // The call's own page: no dock (one clock a screen), the call buttons off.
        expect(screen.queryByRole('region', { name: 'Đang gọi' })).toBeNull()
        expect(screen.getByRole('button', { name: 'Gọi video: Bạn đang trong cuộc gọi này' })).toHaveAttribute(
            'aria-disabled',
            'true'
        )
        await expectNoA11yViolations()

        await userEvent.click(await within(page).findByRole('button', { name: 'Hủy cuộc gọi' }))
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Cuộc gọi với Bình' })).toBeNull())
        expect(callsApi.endCall).toHaveBeenCalledWith('c1')
        expect(sounds.stop).toHaveBeenCalled()
        expect(sounds.playCallEnd).not.toHaveBeenCalled()
    })

    it('joins the media with the mic on once they answer, counts the clock, and says it is over with its length', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing'))
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        await stage()

        heard('call.updated', call('c1', 'active'))

        const page = await stage()
        await within(page).findByText('Cuộc gọi thoại ·')
        expect(callsApi.joinCall).toHaveBeenCalledWith('c1')
        expect(livekit.joinRoom).toHaveBeenCalledWith(
            'wss://lk.test',
            'tok',
            { mic: true, camera: false },
            expect.anything()
        )
        expect(await within(page).findByRole('button', { name: 'Tắt mic (Ctrl Shift M)' })).toBeVisible()
        expect(within(page).getByText(/^00:0\d$/)).toBeVisible()

        heard(
            'call.ended',
            call('c1', 'ended', true, {
                acceptedAt: '2026-10-18T14:44:06.000Z',
                endedAt: '2026-10-18T14:47:21.000Z'
            })
        )
        expect(await within(await stage()).findByText('Cuộc gọi đã kết thúc · 03:15')).toBeVisible()
        expect(link.leave).toHaveBeenCalled()
        expect(sounds.playCallEnd).toHaveBeenCalledTimes(1)
        // Back to the DM after 2 seconds.
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Cuộc gọi với Bình' })).toBeNull(), {
            timeout: 3000
        })
    })

    it('says refused with Gọi lại, which calls the same kind again, and Đóng', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing', true, { video: true }))
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi video' }))
        await stage()

        heard('call.ended', call('c1', 'declined', true, { video: true }))

        const page = await stage()
        expect(await within(page).findByText('Cuộc gọi bị từ chối')).toBeVisible()
        callsApi.startCall.mockResolvedValue(call('c2', 'ringing', true, { video: true }))
        await userEvent.click(within(page).getByRole('button', { name: 'Gọi lại' }))
        expect(callsApi.startCall).toHaveBeenLastCalledWith('dm-binh', true, expect.any(String))
        expect(await within(await stage()).findByText('Đang gọi video…')).toBeVisible()
    })

    it('makes no call while the browser blocks the mic, and says the one line when I may not call', async () => {
        devices.askMicrophone.mockResolvedValue('blocked')
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        expect(await screen.findByText('Trình duyệt đang chặn mic nên chưa gọi được.')).toBeVisible()
        expect(callsApi.startCall).not.toHaveBeenCalled()

        devices.askMicrophone.mockResolvedValue('on')
        callsApi.startCall.mockRejectedValue(apiError(403, 'CANNOT_MESSAGE_USER'))
        await userEvent.click(screen.getByRole('button', { name: 'Gọi thoại' }))
        expect(await screen.findByText('Không thể gọi cho người dùng này')).toBeVisible()
        expect(screen.queryByRole('region', { name: 'Cuộc gọi với Bình' })).toBeNull()
    })

    it('keeps the call in the dock away from its page, which opens it again and ends it', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing'))
        callsApi.endCall.mockResolvedValue(call('c1', 'ended', true))
        const { router } = renderAt('/dm/dm-binh', ['/study'])
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        await stage()
        heard('call.updated', call('c1', 'active'))
        await within(await stage()).findByText('Cuộc gọi thoại ·')

        await userEvent.click(await screen.findByRole('button', { name: 'Thu nhỏ cuộc gọi' }))

        const dock = await screen.findByRole('region', { name: 'Đang gọi' })
        expect(router.state.location.pathname).toBe('/study')
        expect(within(dock).getByRole('link', { name: 'Bình, Cuộc gọi thoại' })).toHaveAttribute('href', '/dm/dm-binh')
        await userEvent.click(within(dock).getByRole('button', { name: 'Kết thúc cuộc gọi' }))
        await waitFor(() => expect(callsApi.endCall).toHaveBeenCalledWith('c1'))
        // Over while on another page: a Toast says it (09 DM-EDGE).
        expect(await screen.findByText(/^Cuộc gọi đã kết thúc/)).toBeVisible()
        expect(screen.queryByRole('region', { name: 'Đang gọi' })).toBeNull()
    })

    it('ends the call before signing out, with the token in hand (L4-g)', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing'))
        callsApi.endCall.mockResolvedValue(call('c1', 'missed', true, { endReason: 'cancelled' }))
        renderAt('/dm/dm-binh')
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        await stage()

        act(() => flushBeforeSignOut())

        expect(callsApi.endCall).toHaveBeenCalledWith('c1', true)
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Cuộc gọi với Bình' })).toBeNull())
    })
})

describe('Cuộc gọi đến (09 S-CALL-02)', () => {
    it('shows the card without taking the focus, first in the Tab order, the title and the ring; Esc does not decline', async () => {
        renderAt('/study')
        await screen.findByRole('heading', { name: 'Học' })
        const before = document.activeElement

        heard('call.ringing', call('c1', 'ringing', false))

        const card = await screen.findByRole('region', { name: 'Cuộc gọi đến' })
        expect(within(card).getByText('Bình')).toBeVisible()
        expect(within(card).getByText('Cuộc gọi thoại đến')).toBeVisible()
        const said = screen.getByText('Bình đang gọi, cuộc gọi thoại')
        expect(said).toHaveAttribute('aria-live', 'assertive')
        expect(card.contains(said)).toBe(false)
        expect(document.activeElement).toBe(before)
        expect(document.body.firstElementChild?.contains(card)).toBe(true)
        expect(document.title).toBe('Bình đang gọi · NezFocus')
        expect(sounds.startCallLoop).toHaveBeenCalledWith('ring')
        await userEvent.keyboard('{Escape}')
        expect(card).toBeInTheDocument()
        expect(callsApi.declineCall).not.toHaveBeenCalled()
        await expectNoA11yViolations()
    })

    it('answers: to the caller DM, the media joined; the title back', async () => {
        callsApi.acceptCall.mockResolvedValue(call('c1', 'active', false))
        const { router } = renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false, { video: true }))
        const card = await screen.findByRole('region', { name: 'Cuộc gọi đến' })

        await userEvent.click(within(card).getByRole('button', { name: 'Nghe có video' }))

        await waitFor(() => expect(router.state.location.pathname).toBe('/dm/dm-binh'))
        expect(callsApi.acceptCall).toHaveBeenCalledWith('c1')
        await waitFor(() =>
            expect(livekit.joinRoom).toHaveBeenCalledWith(
                'wss://lk.test',
                'tok',
                { mic: true, camera: true },
                expect.anything()
            )
        )
        expect(await stage()).toBeVisible()
        expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull()
        expect(document.title).toBe('NezFocus')
    })

    it('declines: the card closes, no Toast, no sound of the end', async () => {
        callsApi.declineCall.mockResolvedValue(call('c1', 'declined', false))
        renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false))
        const card = await screen.findByRole('region', { name: 'Cuộc gọi đến' })

        await userEvent.click(within(card).getByRole('button', { name: 'Từ chối' }))

        await waitFor(() => expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull())
        expect(sounds.playCallEnd).not.toHaveBeenCalled()
        expect(screen.queryByText(/Cuộc gọi nhỡ/)).toBeNull()
    })

    it('closes the card on a missed call with "Cuộc gọi nhỡ từ Bình" · Mở tin nhắn, and ignores a late ring of it (B6)', async () => {
        const { router } = renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false))
        await screen.findByRole('region', { name: 'Cuộc gọi đến' })

        heard('call.ended', call('c1', 'missed', false, { endReason: 'cancelled' }))

        expect(await screen.findByText('Cuộc gọi nhỡ từ Bình')).toBeVisible()
        expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull()
        expect(sounds.playCallEnd).toHaveBeenCalledTimes(1)
        heard('call.ringing', call('c1', 'ringing', false))
        expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Mở tin nhắn' }))
        expect(router.state.location.pathname).toBe('/dm/dm-binh')
    })

    it('stacks two cards, and closes one answered in another tab with a Toast', async () => {
        renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false))
        heard('call.ringing', call('c2', 'ringing', false, { user: CHI }))
        await waitFor(() => expect(screen.getAllByRole('region', { name: 'Cuộc gọi đến' })).toHaveLength(2))

        heard('call.updated', call('c1', 'active', false))

        expect(await screen.findByText('Đã nghe máy ở tab khác')).toBeVisible()
        const left = screen.getAllByRole('region', { name: 'Cuộc gọi đến' })
        expect(left).toHaveLength(1)
        expect(within(left[0]!).getByText('Chi')).toBeVisible()
    })

    it('rings in one tab only: none while another tab holds the lock (D-255)', async () => {
        const request = vi.fn(() => new Promise(() => undefined))
        vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { locks: { request } }))
        try {
            renderAt('/study')
            await settled()
            heard('call.ringing', call('c1', 'ringing', false))
            await screen.findByRole('region', { name: 'Cuộc gọi đến' })
            expect(request).toHaveBeenCalledWith('call-ring', expect.anything(), expect.any(Function))
            expect(sounds.startCallLoop).not.toHaveBeenCalledWith('ring')
        } finally {
            vi.unstubAllGlobals()
        }
    })
})

describe('Tải lại giữa cuộc gọi (D-255)', () => {
    it('goes back into the call this tab held, the mic on, the camera off', async () => {
        vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' } as unknown as PerformanceEntry])
        const { resetCallRejoin } = await import('../lib/call-keep')
        resetCallRejoin()
        sessionStorage.setItem('social.call', 'c1')
        callsApi.fetchMyCall.mockResolvedValue({ current: call('c1', 'active', false, { video: true }), incoming: [] })
        try {
            renderAt('/dm/dm-binh')
            await waitFor(() =>
                expect(livekit.joinRoom).toHaveBeenCalledWith(
                    'wss://lk.test',
                    'tok',
                    { mic: true, camera: false },
                    expect.anything()
                )
            )
            expect(await stage()).toBeVisible()
        } finally {
            vi.restoreAllMocks()
            resetCallRejoin()
        }
    })
})

describe('Gọi từ trang Bạn bè (09 S-DM-02)', () => {
    it('calls a friend from ⋯ › Gọi video, to their DM', async () => {
        const { fetchRelationships } = await import('../api/social.api')
        vi.mocked(fetchRelationships).mockResolvedValue([
            {
                type: 'friend',
                since: '2026-10-01T00:00:00.000Z',
                presence: 'online',
                activity: null,
                note: null,
                user: BINH
            }
        ])
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing', true, { video: true }))
        const { router } = renderAt('/friends?tab=all')

        await userEvent.click(await screen.findByRole('button', { name: 'Thêm: Bình' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Gọi video' }))

        await waitFor(() => expect(router.state.location.pathname).toBe('/dm/dm-binh'))
        expect(callsApi.startCall).toHaveBeenCalledWith('dm-binh', true, expect.any(String))
    })
})

describe('Thứ tự event và lệnh (rà L9a)', () => {
    // Finding 1 (L4a B6): a late ringing of a call already answered is old news too.
    it('keeps a call answered in another tab closed when its ringing comes late', async () => {
        renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false))
        await screen.findByRole('region', { name: 'Cuộc gọi đến' })
        heard('call.updated', call('c1', 'active', false))
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull())

        heard('call.ringing', call('c1', 'ringing', false))

        await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
        expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull()
    })

    // Finding 2: the answer to Call may come after the call's own words.
    it('joins when they answered before the answer to Call came back', async () => {
        let answer: (value: Call) => void = () => undefined
        callsApi.startCall.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        renderAt('/dm/dm-binh')
        await settled()
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        await waitFor(() => expect(callsApi.startCall).toHaveBeenCalled())

        heard('call.updated', call('c1', 'active'))
        await act(async () => answer(call('c1', 'ringing')))

        await waitFor(() => expect(callsApi.joinCall).toHaveBeenCalledWith('c1'))
        expect(sounds.startCallLoop).not.toHaveBeenCalledWith('ringback')
    })

    // Finding 3: a read of my calls begun before this tab held a call says nothing of it.
    it('keeps a call just made when a read begun before it comes back without it', async () => {
        callsApi.startCall.mockResolvedValue(call('c1', 'ringing'))
        renderAt('/dm/dm-binh')
        await settled()
        let read: (value: MyCall) => void = () => undefined
        callsApi.fetchMyCall.mockReturnValue(new Promise((resolve) => (read = resolve)))
        act(() => emitRealtimeEvent('ready', {}))
        await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
        await stage()

        await act(async () => read({ current: null, incoming: [] }))

        expect(await stage()).toBeVisible()
        expect(within(await stage()).getByText('Đang gọi…')).toBeVisible()
    })

    // Finding 4: offline, the call's end never comes: the card stops after the 45 seconds.
    it('shows no card for a call that rang longer than 45 seconds ago', async () => {
        renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false, { createdAt: new Date(Date.now() - 60_000).toISOString() }))
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
        expect(screen.queryByRole('region', { name: 'Cuộc gọi đến' })).toBeNull()
        expect(document.title).toBe('NezFocus')
    })

    // Finding 7: a call that never rang (busy) leaves the voice room as it was.
    it('stays in the voice room when the call comes back busy', async () => {
        useVoiceStore.setState({ call: { serverId: 's1', channelId: 'v1', name: 'Phòng học', phase: 'connected' } })
        callsApi.startCall.mockResolvedValue(call('c1', 'missed', true, { endReason: 'busy' }))
        try {
            renderAt('/dm/dm-binh')
            await userEvent.click(await screen.findByRole('button', { name: 'Gọi thoại' }))
            expect(await within(await stage()).findByText('Bình đang bận')).toBeVisible()
            expect(voiceSession.leaveRoom).not.toHaveBeenCalled()
        } finally {
            useVoiceStore.setState({ call: null })
        }
    })

    // Finding 12: one of two cards missed: the other keeps ringing, in place, no end sound yet.
    it('keeps ringing for the other card when one of two is missed', async () => {
        renderAt('/study')
        await settled()
        heard('call.ringing', call('c1', 'ringing', false))
        heard('call.ringing', call('c2', 'ringing', false, { user: CHI }))
        await waitFor(() => expect(screen.getAllByRole('region', { name: 'Cuộc gọi đến' })).toHaveLength(2))
        expect(sounds.startCallLoop).toHaveBeenCalledTimes(1)

        heard('call.ended', call('c1', 'missed', false, { endReason: 'cancelled' }))

        await waitFor(() => expect(screen.getAllByRole('region', { name: 'Cuộc gọi đến' })).toHaveLength(1))
        expect(sounds.startCallLoop).toHaveBeenCalledTimes(1)
        expect(sounds.stop).not.toHaveBeenCalled()
        expect(sounds.playCallEnd).not.toHaveBeenCalled()
    })
})
