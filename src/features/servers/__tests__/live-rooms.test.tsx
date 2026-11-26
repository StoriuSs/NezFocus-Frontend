import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { roomSessionOf } from '@/features/study'
import { noteServerTime } from '@/lib/server-clock'
import { expectNoA11yViolations } from '@/test/a11y'
import { session } from '@/test/study-sessions'
import type { RoomPerson, Server, ServerChannel } from '../types'

const profile = { id: 'an' as string | undefined }
vi.mock('@/features/users/api/useProfile', () => ({
    useProfile: () => ({ data: profile.id ? { id: profile.id } : undefined })
}))
const serversApi = { fetchServers: vi.fn<() => Promise<Server[]>>() }
vi.mock('../api/servers.api', () => serversApi)

const { compareRooms, keptOrder, liveRoomsOf, orderOf, studyingRoomOf } = await import('../lib/live-rooms')
const { AWAY_REORDER_MS, LEAVING_MS } = await import('../hooks/useLiveRooms')
const { serverKeys } = await import('../api/keys')
const { relationshipsQuery } = await import('@/features/social')
const { default: LiveRooms } = await import('../components/live-rooms/LiveRooms')

const CONNECT = 1n << 15n
const person = (id: string): RoomPerson => ({
    user: { id, username: id, displayName: null, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-22T14:10:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false
})
const people = (count: number, ...named: string[]) => [
    ...named.map(person),
    ...Array.from({ length: count - named.length }, (_, index) => person(`p${index}`))
]
/** A study room with a session started at `startedAt`, `inside` people in it. */
const room = (
    id: string,
    inside: RoomPerson[],
    more: Partial<ServerChannel> = {},
    startedAt = '2026-11-22T14:11:00.000Z'
) =>
    channel(id, {
        isStudyRoom: true,
        voiceStates: inside,
        focusSession: roomSessionOf(session({ id: `s-${id}`, channelId: id, startedAt })),
        ...more
    })
const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: null,
    type: 'voice',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: false,
    studyStarter: 'anyone',
    studyFocusMinutes: 25,
    studyShortBreakMinutes: 5,
    studyLongBreakMinutes: null,
    studyLongBreakEvery: null,
    taskBoardEnabled: false,
    permissions: String(CONNECT),
    viewRoleIds: null,
    voiceStates: [],
    focusSession: null,
    ...extra
})
const server = (id: string, name: string, channels: ServerChannel[]): Server => ({
    id,
    name,
    iconUrl: null,
    isOwner: false,
    memberCount: 12,
    permissions: '0',
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels
})

/** 08's world A− at 21:47: "Phòng học im lặng" (8 people, 21:11) and "Góc học khuya" (Tuấn alone, 21:39). */
const worldA = (imLang = people(8)) => [
    server('ot', 'Ôn thi Giải tích 2', [
        channel('chung', { type: 'text', voiceStates: null }),
        room('im-lang', imLang, { name: 'Phòng học im lặng' }),
        channel('thao-luan', { voiceStates: [person('dung')] })
    ]),
    server('cg', 'CLB Guitar PTIT', [
        room('goc-khuya', [person('tuan')], { name: 'Góc học khuya' }, '2026-11-22T14:39:00.000Z')
    ])
]

describe('the rooms studying now (live-rooms, REQ-STUDY-09, D-217)', () => {
    it('takes the voice rooms with a session one may join, oneself left out of the people', () => {
        const servers = worldA([person('an'), ...people(8)])
        servers[0]?.channels.push(room('locked', people(3), { permissions: '0' }))
        const rooms = liveRoomsOf(servers, 'an')
        expect(rooms.map((found) => [found.channelId, found.people, found.here, found.serverName])).toEqual([
            ['im-lang', 8, true, 'Ôn thi Giải tích 2'],
            ['goc-khuya', 1, false, 'CLB Guitar PTIT']
        ])
    })

    it('puts the room one is in first, then more people, then the earlier session', () => {
        const rooms = liveRoomsOf(
            [
                server('a', 'A', [
                    room('late-big', people(5), {}, '2026-11-22T14:30:00.000Z'),
                    room('early-big', people(5), {}, '2026-11-22T14:00:00.000Z'),
                    room('small', people(2)),
                    room('mine', [person('an')])
                ])
            ],
            'an'
        )
        expect(orderOf(rooms)).toEqual(['mine', 'early-big', 'late-big', 'small'])
        expect(rooms.slice().sort(compareRooms)[0]?.channelId).toBe('mine')
    })

    it('keeps the order while one looks: a new room at the end, a fading one where it was', () => {
        const rooms = liveRoomsOf(worldA(), 'an')
        const [imLang] = rooms
        const more = liveRoomsOf([server('x', 'X', [room('big', people(12))])], 'an')
        expect(keptOrder(['goc-khuya', 'im-lang'], [...rooms, ...more])).toEqual(['goc-khuya', 'im-lang', 'big'])
        expect(keptOrder(['goc-khuya', 'im-lang'], imLang ? [imLang] : [], new Set(['goc-khuya']))).toEqual([
            'goc-khuya',
            'im-lang'
        ])
        expect(keptOrder(['goc-khuya', 'im-lang'], imLang ? [imLang] : [])).toEqual(['im-lang'])
    })
})

let client: QueryClient
const hold = (servers: Server[]) => {
    act(() => {
        client.setQueryData(serverKeys.list(), servers)
    })
}
function page() {
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter>
                    <LiveRooms />
                </MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}
const rows = () => within(screen.getByRole('list')).getAllByRole('link')

describe('the session one takes part in, whichever tab is in its room (studyingRoomOf, A3-a)', () => {
    const servers = () => [
        server('ot', 'Ôn thi', [room('im-lang', people(3, 'binh')), room('thao-luan', people(2, 'an'))]),
        server('np', 'Nhóm', [room('goc', people(1, 'chi'))])
    ]

    it("is this tab's room's, as soon as it is in one", () => {
        const found = studyingRoomOf(servers(), 'an', { channelId: 'im-lang' })
        expect(found).toMatchObject({ name: 'im-lang', session: { id: 's-im-lang' } })
    })

    it("in another tab's or device's room, the one the servers list one in", () => {
        expect(studyingRoomOf(servers(), 'an', null)).toMatchObject({
            name: 'thao-luan',
            session: { id: 's-thao-luan' }
        })
    })

    it('is none in a room with no session, or listed in none', () => {
        const quiet = [server('ot', 'Ôn thi', [channel('im-lang', { isStudyRoom: true, voiceStates: [person('an')] })])]
        expect(studyingRoomOf(quiet, 'an', null)).toBeNull()
        expect(studyingRoomOf(quiet, 'an', { channelId: 'im-lang' })).toBeNull()
        expect(studyingRoomOf(servers(), 'dung', null)).toBeNull()
        expect(studyingRoomOf(servers(), undefined, null)).toBeNull()
    })
})

describe("the Study page's rooms (08 S-STUDY-01, C-44)", () => {
    beforeAll(async () => {
        await i18n.changeLanguage('vi')
        // What the cache holds reaches the list at once, fake timers or not.
        notifyManager.setScheduler((callback) => callback())
    })
    afterAll(async () => {
        await i18n.changeLanguage('en')
        notifyManager.setScheduler((callback) => setTimeout(callback, 0))
    })
    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
        // No friends unless a test says so: the order waits for them (D-254).
        client.setQueryData(relationshipsQuery.queryKey, [])
        noteServerTime('2026-11-22T14:47:18.000Z')
        serversApi.fetchServers.mockReset()
        serversApi.fetchServers.mockImplementation(() => new Promise(() => undefined))
        profile.id = 'an'
    })
    afterEach(() => {
        vi.useRealTimers()
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    })

    it('lists each room as a link with its phase, name and people, the server cut first', async () => {
        client.setQueryData(serverKeys.list(), worldA([person('an'), ...people(8)]))
        page()
        expect(screen.getByRole('heading', { name: 'Đang học lúc này — 2 phòng' })).toHaveClass('uppercase')
        const [imLang, gocKhuya] = rows()
        expect(imLang).toHaveAttribute('href', '/channels/ot/im-lang')
        expect(imLang).toHaveAccessibleName(
            'Phòng học im lặng, Ôn thi Giải tích 2, Tập trung · còn 18 phút, 8 người, bạn đang ở đây'
        )
        expect(within(imLang as HTMLElement).getByText('Bạn ở đây')).toBeVisible()
        expect(within(imLang as HTMLElement).getByText('Ôn thi Giải tích 2')).toHaveClass('truncate')
        expect(gocKhuya).toHaveAttribute('href', '/channels/cg/goc-khuya')
        expect(within(gocKhuya as HTMLElement).getByText('1 người ·', { exact: false })).toBeVisible()
        expect(within(gocKhuya as HTMLElement).queryByText('Bạn ở đây')).toBeNull()
        await expectNoA11yViolations()
    })

    it('hands the room’s page the session the row showed and its name (08 room-ended-on-join, Edge)', async () => {
        client.setQueryData(serverKeys.list(), worldA([person('an'), ...people(8)]))
        const Opened = () => <output>{JSON.stringify(useLocation().state)}</output>
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MemoryRouter>
                        <Routes>
                            <Route path='/' element={<LiveRooms />} />
                            <Route path='/channels/:serverId/:channelId' element={<Opened />} />
                        </Routes>
                    </MemoryRouter>
                </TooltipProvider>
            </QueryClientProvider>
        )
        await userEvent.click(rows()[0]!)
        expect(JSON.parse(screen.getByRole('status').textContent!)).toEqual({
            studyRow: { sessionId: 's-im-lang', name: 'Phòng học im lặng' }
        })
    })

    it('says "Chỉ có bạn" alone in one’s room, and "Tạm dừng" with no minutes', () => {
        const servers = worldA([person('an')])
        const paused = servers[1]?.channels[0]
        if (paused?.focusSession) paused.focusSession = { ...paused.focusSession, status: 'paused', phaseEndsAt: null }
        client.setQueryData(serverKeys.list(), servers)
        page()
        const [mine, other] = rows()
        expect(within(mine as HTMLElement).getByText('Chỉ có bạn ·', { exact: false })).toBeVisible()
        expect(within(other as HTMLElement).getByText('Tạm dừng')).toBeVisible()
        expect(within(other as HTMLElement).queryByText(/còn/)).toBeNull()
    })

    it('is one Tab stop, ↑ ↓ moving between the rows', async () => {
        client.setQueryData(serverKeys.list(), worldA())
        page()
        await userEvent.tab()
        const [first, second] = rows()
        expect(first).toHaveFocus()
        expect(second).toHaveAttribute('tabindex', '-1')
        await userEvent.keyboard('{ArrowDown}')
        expect(second).toHaveFocus()
        await userEvent.keyboard('{ArrowDown}')
        expect(second).toHaveFocus()
        await userEvent.keyboard('{ArrowUp}')
        expect(first).toHaveFocus()
    })

    it('keeps its order while looked at: a new session at the end, an ended one fading out, then gone', () => {
        client.setQueryData(serverKeys.list(), worldA())
        page()
        expect(rows().map((link) => link.getAttribute('href'))).toEqual([
            '/channels/ot/im-lang',
            '/channels/cg/goc-khuya'
        ])
        // Phòng thảo luận nhóm starts with 12 people: more than both, still at the end.
        const busy = worldA()
        busy[0]?.channels.splice(2, 1, room('thao-luan', people(12), { name: 'Phòng thảo luận nhóm' }))
        hold(busy)
        expect(screen.getByRole('heading', { name: 'Đang học lúc này — 3 phòng' })).toBeVisible()
        expect(rows().at(-1)).toHaveAttribute('href', '/channels/ot/thao-luan')

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        const ended = worldA()
        ended[0]?.channels.splice(2, 1, channel('thao-luan', { isStudyRoom: true, voiceStates: people(12) }))
        const imLang = ended[0]?.channels[1]
        if (imLang) imLang.focusSession = null
        hold(ended)
        // Faded, out of the count and out of the Tab order, for 200ms.
        expect(screen.getByRole('heading', { name: 'Đang học lúc này — 1 phòng' })).toBeVisible()
        const fading = document.querySelector('a[href="/channels/ot/im-lang"]')
        expect(fading).toHaveClass('opacity-0')
        expect(fading).toHaveAttribute('tabindex', '-1')
        act(() => {
            vi.advanceTimersByTime(LEAVING_MS)
        })
        expect(document.querySelector('a[href="/channels/ot/im-lang"]')).toBeNull()
        expect(rows()).toHaveLength(1)
    })

    it('drops a room gone from what is held at once (put out of its server, 08 › Edge)', () => {
        client.setQueryData(serverKeys.list(), worldA())
        page()
        hold(worldA().slice(0, 1))
        expect(rows()).toHaveLength(1)
        expect(document.querySelector('a[href="/channels/cg/goc-khuya"]')).toBeNull()
    })

    it('orders again on coming back after more than 5 minutes away, not sooner', () => {
        client.setQueryData(serverKeys.list(), worldA())
        page()
        // Góc học khuya fills up: 12 people, still second while looked at.
        const full = worldA()
        const goc = full[1]?.channels[0]
        if (goc) goc.voiceStates = people(12)
        hold(full)
        expect(rows()[0]).toHaveAttribute('href', '/channels/ot/im-lang')
        const away = (ms: number) => {
            const now = Date.now()
            vi.spyOn(Date, 'now').mockReturnValue(now)
            Object.defineProperty(document, 'hidden', { configurable: true, value: true })
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'))
            })
            vi.spyOn(Date, 'now').mockReturnValue(now + ms)
            Object.defineProperty(document, 'hidden', { configurable: true, value: false })
            act(() => {
                document.dispatchEvent(new Event('visibilitychange'))
            })
            vi.restoreAllMocks()
        }
        away(AWAY_REORDER_MS - 1000)
        expect(rows()[0]).toHaveAttribute('href', '/channels/ot/im-lang')
        away(AWAY_REORDER_MS + 1000)
        expect(rows()[0]).toHaveAttribute('href', '/channels/cg/goc-khuya')
    })

    it('drops a room at once when one may no longer join it (CONNECT lost, 08 › Edge)', () => {
        client.setQueryData(serverKeys.list(), worldA())
        page()
        const locked = worldA()
        const goc = locked[1]?.channels[0]
        if (goc) goc.permissions = '0'
        hold(locked)
        expect(document.querySelector('a[href="/channels/cg/goc-khuya"]')).toBeNull()
    })

    it('orders with the room one is in first even when one’s profile comes after the servers', () => {
        profile.id = undefined
        client.setQueryData(
            serverKeys.list(),
            worldA(people(8)).map((held, index) =>
                index === 1
                    ? {
                          ...held,
                          channels: [
                              room(
                                  'goc-khuya',
                                  [person('tuan'), person('an')],
                                  { name: 'Góc học khuya' },
                                  '2026-11-22T14:39:00.000Z'
                              )
                          ]
                      }
                    : held
            )
        )
        const view = page()
        profile.id = 'an'
        view.rerender(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MemoryRouter>
                        <LiveRooms />
                    </MemoryRouter>
                </TooltipProvider>
            </QueryClientProvider>
        )
        expect(rows()[0]).toHaveAttribute('href', '/channels/cg/goc-khuya')
    })

    it('stays on the rooms it shows when a read again fails', async () => {
        client.setQueryData(serverKeys.list(), worldA())
        serversApi.fetchServers.mockReset()
        serversApi.fetchServers.mockRejectedValue(new Error('down'))
        page()
        await act(async () => {
            await client.invalidateQueries({ queryKey: serverKeys.list() })
        })
        expect(rows()).toHaveLength(2)
        expect(screen.queryByText('Không tải được danh sách phòng')).toBeNull()
    })

    it('says none is studying (no-active-rooms), with no number in its title', () => {
        client.setQueryData(serverKeys.list(), [server('ot', 'Ôn thi Giải tích 2', [channel('thao-luan')])])
        page()
        expect(screen.getByRole('heading', { name: 'Đang học lúc này' })).toBeVisible()
        expect(screen.getByRole('heading', { name: 'Chưa có phòng nào đang học' })).toBeVisible()
        expect(screen.getByText('Vào một phòng học và bắt đầu phiên, hoặc học một mình.')).toBeVisible()
    })

    it('offers to create a server or join one by code in no server (no-server)', async () => {
        client.setQueryData(serverKeys.list(), [])
        page()
        expect(screen.getByRole('heading', { name: 'Bạn chưa ở server nào' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Tạo server' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Nhập mã mời' })).toBeVisible()
        await expectNoA11yViolations()
    })

    it('shows two rows of Skeleton while loading, and "Thử lại" when the read failed', async () => {
        const view = page()
        expect(document.querySelectorAll('[aria-busy="true"] .animate-pulse').length).toBe(6)
        view.unmount()
        client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        serversApi.fetchServers.mockReset()
        serversApi.fetchServers.mockRejectedValueOnce(new Error('down')).mockResolvedValue(worldA())
        page()
        await userEvent.click(await screen.findByRole('button', { name: 'Thử lại' }))
        expect(await screen.findByText('Phòng học im lặng')).toBeVisible()
        expect(screen.queryByText('Không tải được danh sách phòng')).toBeNull()
    })

    it('shows no old list offline, only why (offline)', () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
        client.setQueryData(serverKeys.list(), worldA())
        page()
        expect(screen.getByText('Cần kết nối mạng để xem phòng đang học')).toBeVisible()
        expect(screen.queryByRole('list')).toBeNull()
        expect(screen.getByRole('heading', { name: 'Đang học lúc này' })).toBeVisible()
    })
})
