import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Relationship } from '@/features/social'
import { roomSessionOf } from '@/features/study'
import { noteServerTime } from '@/lib/server-clock'
import { expectNoA11yViolations } from '@/test/a11y'
import { session } from '@/test/study-sessions'
import type { RoomPerson, Server, ServerChannel } from '../types'

vi.mock('@/features/users/api/useProfile', () => ({ useProfile: () => ({ data: { id: 'an' } }) }))
vi.mock('../api/servers.api', () => ({ fetchServers: () => new Promise(() => undefined) }))
const socialApi = vi.hoisted(() => ({ fetchRelationships: vi.fn(() => new Promise<never>(() => undefined)) }))
vi.mock('@/features/social/api/social.api', async (original) => ({ ...(await original<object>()), ...socialApi }))

const { compareRooms, liveRoomsOf, orderOf } = await import('../lib/live-rooms')
const { livePeopleText } = await import('../lib/live-people')
const { friendsStudyingOf, keptFriends } = await import('../lib/friends-studying')
const { serverKeys } = await import('../api/keys')
const { relationshipsQuery } = await import('@/features/social')
const { default: LiveRooms } = await import('../components/live-rooms/LiveRooms')
const { default: FriendsStudying } = await import('../components/live-rooms/FriendsStudying')

const CONNECT = 1n << 15n
const NAMES: Record<string, string> = {
    binh: 'Bình',
    chi: 'Chi',
    minh: 'Minh',
    nam: 'Nam',
    tuan: 'Tuấn',
    hoa: 'Hòa',
    khanh: 'Khánh'
}
const person = (id: string): RoomPerson => ({
    user: { id, username: id, displayName: NAMES[id] ?? null, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-22T14:10:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false
})
const others = (count: number) => Array.from({ length: count }, (_, index) => person(`p${index}`))
const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: null,
    type: 'voice',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: true,
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
const room = (id: string, name: string, inside: RoomPerson[], more: Partial<ServerChannel> = {}) =>
    channel(id, {
        name,
        voiceStates: inside,
        focusSession: roomSessionOf(session({ id: `s-${id}`, channelId: id })),
        ...more
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
const friend = (id: string, more: Partial<Relationship> = {}): Relationship => ({
    type: 'friend',
    since: '2026-10-01T00:00:00.000Z',
    presence: 'online',
    note: null,
    activity: null,
    user: { id, username: id, displayName: NAMES[id] ?? null, avatarUrl: null },
    ...more
})
const studyingAlone = (id: string, more: Partial<Relationship> = {}) =>
    friend(id, {
        activity: { room: null, solo: { status: 'running', phase: 'focus', phaseEndsAt: '2026-11-22T14:59:18.000Z' } },
        ...more
    })

/**
 * 08's world A− at 21:47, with `friends-solo`: Bình and Chi in "Phòng học im lặng" (8 people, An
 * not in it), Tuấn alone in "Góc học khuya"; Minh on a Solo with 12 minutes left; Nam offline
 * on one; Dũng a request sent, not a friend.
 */
const worldA = (imLang = [person('binh'), person('chi'), ...others(6)]) => [
    server('ot', 'Ôn thi Giải tích 2', [
        room('im-lang', 'Phòng học im lặng', imLang),
        channel('thao-luan', { name: 'Phòng thảo luận nhóm', isStudyRoom: false })
    ]),
    server('cg', 'CLB Guitar PTIT', [room('goc-khuya', 'Góc học khuya', [person('tuan')])])
]
const RELATIONSHIPS: Relationship[] = [
    friend('binh'),
    friend('chi'),
    studyingAlone('minh'),
    studyingAlone('nam', { presence: 'offline' }),
    friend('dung', { type: 'outgoing', presence: null })
]
const FRIENDS = new Set(['binh', 'chi', 'minh', 'nam'])

beforeAll(async () => {
    await i18n.changeLanguage('vi')
    notifyManager.setScheduler((callback) => callback())
})
afterAll(async () => {
    await i18n.changeLanguage('en')
    notifyManager.setScheduler((callback) => setTimeout(callback, 0))
})
beforeEach(() => {
    noteServerTime('2026-11-22T14:47:18.000Z')
})

describe("The Study page's rooms put friends first and name them (REQ-STUDY-09, C-44, D-254)", () => {
    it('names the friends in a room in the order they joined, oneself never one of them', () => {
        const [imLang] = liveRoomsOf(worldA([person('an'), person('chi'), person('binh'), ...others(2)]), 'an', FRIENDS)
        expect(imLang?.friends.map((user) => user.id)).toEqual(['chi', 'binh'])
        expect(imLang?.people).toBe(4)
    })

    it('puts the room one is in first, then more friends before more people', () => {
        const rooms = liveRoomsOf(
            [
                server('a', 'A', [
                    room('big', 'Big', others(9)),
                    room('friend', 'Friend', [person('binh'), person('p0')]),
                    room(
                        'friends',
                        'Friends',
                        [person('binh'), person('chi')].map((one) => one)
                    ),
                    room('mine', 'Mine', [person('an')])
                ])
            ],
            'an',
            new Set(['binh', 'chi'])
        )
        expect(orderOf(rooms)).toEqual(['mine', 'friends', 'friend', 'big'])
        expect(
            rooms
                .slice()
                .sort(compareRooms)
                .map((one) => one.channelId)
        ).toEqual(['mine', 'friends', 'friend', 'big'])
    })

    it('says up to two friends and how many others, the names alone with no one else (C-44 › Dòng người)', () => {
        const t = i18n.getFixedT('vi', 'study')
        const text = (inside: RoomPerson[]) =>
            livePeopleText(t, liveRoomsOf([server('a', 'A', [room('r', 'R', inside)])], 'an', FRIENDS)[0]!)
        expect(text([person('binh'), person('chi'), person('minh'), ...others(5)])).toBe('Bình, Chi và 6 người')
        expect(text([person('binh'), ...others(1)])).toBe('Bình và 1 người')
        expect(text([person('binh'), person('chi')])).toBe('Bình, Chi')
        expect(text([person('an'), person('binh')])).toBe('Bình')
        expect(text(others(3))).toBe('3 người')
        expect(text([person('an')])).toBe('Chỉ có bạn')
    })

    it('shows the friends on the row, and works its order out only once the friends are read', () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
        client.setQueryData(serverKeys.list(), [
            server('a', 'Ôn thi Giải tích 2', [
                room('big', 'Phòng thi thử', others(12)),
                room('im-lang', 'Phòng học im lặng', [person('binh'), person('chi'), ...others(6)])
            ])
        ])
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MemoryRouter>
                        <LiveRooms />
                    </MemoryRouter>
                </TooltipProvider>
            </QueryClientProvider>
        )
        expect(screen.queryByRole('link')).toBeNull()
        act(() => {
            client.setQueryData(relationshipsQuery.queryKey, RELATIONSHIPS)
        })
        const rows = within(screen.getByRole('list')).getAllByRole('link')
        expect(rows[0]).toHaveAccessibleName(
            'Phòng học im lặng, Ôn thi Giải tích 2, Tập trung · còn 18 phút, Bình, Chi và 6 người'
        )
        expect(rows[0]).toHaveTextContent('Bình, Chi và 6 người · Ôn thi Giải tích 2')
        expect(rows[1]).toHaveTextContent('12 người · Ôn thi Giải tích 2')
    })
})

describe("The Study page's rooms when the relationships cannot be read", () => {
    it('lists the rooms still, as with no friend (useFriendIds: nobody on an error)', async () => {
        socialApi.fetchRelationships.mockRejectedValueOnce(new Error('offline'))
        const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
        client.setQueryData(serverKeys.list(), worldA())
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MemoryRouter>
                        <LiveRooms />
                    </MemoryRouter>
                </TooltipProvider>
            </QueryClientProvider>
        )
        const rows = await screen.findAllByRole('link')
        expect(rows).toHaveLength(2)
        expect(rows[0]).toHaveTextContent('8 người · Ôn thi Giải tích 2')
    })
})

describe('Who of my friends studies now (08 S-STUDY-02 R2, R7, D-252 4g, D-254)', () => {
    it("lists those in rooms in the Study page's order, by name within a room, then those alone, by name", () => {
        const servers = worldA([person('chi'), person('binh'), ...others(6)])
        servers[1]?.channels.push(room('nho', 'Phòng nhỏ', [person('hoa')]))
        // Tuấn, in a room with a session and on a Solo too as far as the list knows: the room wins.
        const found = friendsStudyingOf(servers, 'an', [
            ...RELATIONSHIPS,
            friend('hoa'),
            studyingAlone('tuan'),
            studyingAlone('khanh')
        ])
        expect(found.map((one) => [one.kind, one.user.id])).toEqual([
            ['room', 'binh'],
            ['room', 'chi'],
            ['room', 'tuan'],
            ['room', 'hoa'],
            ['solo', 'khanh'],
            ['solo', 'minh']
        ])
    })

    it('counts a room one sees but may not join, and a Solo in a voice room with no session', () => {
        const servers = worldA()
        servers[0]!.channels[0] = room('im-lang', 'Phòng học im lặng', [person('binh')], { permissions: '0' })
        servers[0]!.channels[1] = channel('thao-luan', { voiceStates: [person('minh')] })
        const found = friendsStudyingOf(servers, 'an', RELATIONSHIPS)
        expect(found.map((one) => [one.kind, one.user.id])).toEqual([
            ['room', 'binh'],
            ['solo', 'minh']
        ])
    })

    it('leaves out a friend offline, one showing no activity, and anyone not a friend', () => {
        const found = friendsStudyingOf(worldA(others(3)), 'an', [
            studyingAlone('nam', { presence: 'offline' }),
            friend('chi'),
            studyingAlone('dung', { type: 'outgoing', presence: null })
        ])
        expect(found).toEqual([])
    })

    it('keeps the order it opened with: those who stopped gone, newcomers last', () => {
        const before = friendsStudyingOf(worldA(), 'an', RELATIONSHIPS)
        const now = friendsStudyingOf(worldA([person('chi'), person('tuan')]), 'an', [
            ...RELATIONSHIPS,
            studyingAlone('hoa')
        ])
        expect(
            keptFriends(
                before.map((one) => one.user.id),
                now
            ).map((one) => one.user.id)
        ).toEqual(['chi', 'minh', 'hoa'])
    })
})

function Where() {
    return <span data-testid='where'>{useLocation().pathname}</span>
}

describe('"N bạn đang học lúc này" and its popover (08 S-STUDY-02 friends-popover, friends-solo)', () => {
    let client: QueryClient
    const hold = (servers: Server[], relationships = RELATIONSHIPS) =>
        act(() => {
            client.setQueryData(serverKeys.list(), servers)
            client.setQueryData(relationshipsQuery.queryKey, relationships)
        })
    const show = () =>
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MemoryRouter initialEntries={['/study/solo']}>
                        <Where />
                        <Routes>
                            <Route path='*' element={<FriendsStudying />} />
                        </Routes>
                    </MemoryRouter>
                </TooltipProvider>
            </QueryClientProvider>
        )
    beforeEach(() => {
        client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    })

    it('opens above the line: friends in rooms link to the room, a friend alone links nowhere; Esc gives the focus back', async () => {
        const user = userEvent.setup()
        hold(worldA())
        const { container } = show()
        const line = screen.getByRole('button', { name: '3 bạn đang học lúc này' })
        await expectNoA11yViolations(container)

        await user.click(line)
        const popover = await screen.findByRole('dialog', { name: 'Bạn bè đang học' })
        expect(within(popover).getByRole('heading', { name: 'Bạn bè đang học' })).toBeVisible()
        expect(within(popover).getByText('3 bạn')).toBeVisible()
        const links = within(popover).getAllByRole('link')
        expect(links.map((link) => link.getAttribute('aria-label'))).toEqual([
            'Bình, Phòng học im lặng, Ôn thi Giải tích 2, Tập trung · còn 18 phút',
            'Chi, Phòng học im lặng, Ôn thi Giải tích 2, Tập trung · còn 18 phút'
        ])
        const minh = within(popover).getByText('Minh').closest('li')!
        expect(within(minh).getByText('Đang học một mình')).toBeVisible()
        expect(within(minh).getByText('Tập trung')).toBeVisible()
        expect(minh).toHaveTextContent('còn 12 phút')
        expect(within(minh).queryByRole('link')).toBeNull()
        await expectNoA11yViolations(popover)

        await user.keyboard('{Escape}')
        expect(screen.queryByRole('dialog')).toBeNull()
        expect(line).toHaveFocus()

        await user.click(line)
        await user.click(within(await screen.findByRole('dialog')).getAllByRole('link')[0]!)
        expect(screen.getByTestId('where')).toHaveTextContent('/channels/ot/im-lang')
    })

    it('keeps its rows while open: one who stopped goes, a newcomer comes last', async () => {
        const user = userEvent.setup()
        hold(worldA())
        show()
        await user.click(screen.getByRole('button', { name: '3 bạn đang học lúc này' }))
        hold(worldA([person('chi'), person('hoa'), ...others(6)]), [...RELATIONSHIPS, friend('hoa')])
        const popover = await screen.findByRole('dialog')
        const names = ['Chi', 'Minh', 'Hòa', 'Bình']
        expect(
            within(popover)
                .getAllByRole('listitem')
                .map((row) => names.find((name) => within(row).queryByText(name)))
        ).toEqual(['Chi', 'Minh', 'Hòa'])
        expect(within(popover).getByText('3 bạn')).toBeVisible()
    })

    it('is not there when no friend studies, and goes when the last one stops', () => {
        hold(worldA(others(8)), [friend('binh')])
        show()
        expect(screen.queryByRole('button')).toBeNull()
        hold(worldA([person('binh')]), [friend('binh')])
        expect(screen.getByRole('button', { name: '1 bạn đang học lúc này' })).toBeVisible()
        hold(worldA(others(1)), [friend('binh')])
        expect(screen.queryByRole('button')).toBeNull()
    })

    it('shows three avatars at most, no "+N" (many-friends)', () => {
        const many = ['binh', 'chi', 'hoa', 'khanh', 'nam']
        hold(
            worldA(many.map(person)),
            many.map((id) => friend(id))
        )
        show()
        const line = screen.getByRole('button', { name: '5 bạn đang học lúc này' })
        expect(line.querySelectorAll('[aria-hidden="true"] > span > span')).toHaveLength(3)
        expect(line).not.toHaveTextContent('+')
    })
})
