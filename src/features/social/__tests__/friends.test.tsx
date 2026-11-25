import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { ShellContext, type ConnectionNotice } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { AxiosError } from 'axios'
import { apiError } from '@/test/helpers'
import type { SeenRoom } from '../lib/room-lookup'
import type { PersonProfile, Presence, Relationship, SendFriendRequest } from '../types'

const socialApi = {
    fetchRelationships: vi.fn<() => Promise<Relationship[]>>(),
    lookUpPerson: vi.fn<(username: string) => Promise<PersonProfile>>(),
    sendFriendRequest: vi.fn<(body: SendFriendRequest, key: string) => Promise<Relationship>>(),
    acceptFriendRequest: vi.fn<(userId: string, key: string) => Promise<Relationship>>(),
    removeRelationship: vi.fn<(userId: string) => Promise<Relationship>>(),
    blockPerson: vi.fn<(userId: string) => Promise<Relationship>>(),
    unblockPerson: vi.fn<(userId: string) => Promise<Relationship>>()
}
vi.mock('../api/social.api', () => socialApi)

const { default: Friends } = await import('../pages/Friends')
const { socialKeys } = await import('../api/keys')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { connectRoomLookup } = await import('../lib/room-lookup')

// Where people are, as the servers feature would answer (D-252): set by a test, nobody by default.
const rooms = new Map<string, SeenRoom>()
connectRoomLookup(() => ({ roomOf: (userId) => rooms.get(userId) ?? null }))

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string | null, username: string | null = `${id}.x`) => ({
    id,
    username,
    displayName,
    avatarUrl: null
})
const friend = (id: string, name: string, presence: Presence): Relationship => ({
    type: 'friend',
    since: '2026-10-01T00:00:00.000Z',
    presence,
    activity: null,
    note: null,
    user: person(id, name)
})
const other = (
    type: Relationship['type'],
    id: string,
    name: string,
    more: Partial<Relationship> = {}
): Relationship => ({
    type,
    since: new Date().toISOString(),
    presence: null,
    activity: null,
    note: null,
    user: person(id, name),
    ...more
})
const none = (id: string, name: string) => other('none', id, name, { since: null })

// 09 › luật 3 and 4: An's friends, Giang asking, An asking Dũng.
const LIST: Relationship[] = [
    friend('binh', 'Bình', 'online'),
    friend('chi', 'Chi', 'online'),
    friend('lan', 'Lan', 'idle'),
    friend('mai', 'Mai', 'dnd'),
    friend('nam', 'Nam', 'offline'),
    other('incoming', 'giang', 'Giang', { note: 'Mình là Giang lớp K22, xin vào nhóm ôn cùng nhé' }),
    other('outgoing', 'dung', 'Dũng')
]

function renderFriends({
    at = '/friends',
    connection = null
}: { at?: string; connection?: ConnectionNotice | null } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), person('an', 'An', 'an.x'))
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const router = createMemoryRouter([{ path: '/friends', element: <Friends /> }], { initialEntries: [at] })
    render(
        <QueryClientProvider client={client}>
            <ShellContext.Provider value={{ navOpen: false, toggleNav: () => undefined, connection }}>
                <TooltipProvider>
                    <RouterProvider router={router} />
                    <Toaster />
                </TooltipProvider>
            </ShellContext.Provider>
        </QueryClientProvider>
    )
    return { client, router }
}

const tab = (name: RegExp | string) => screen.getByRole('tab', { name })
const rowOf = (name: string) => screen.getByText(name, { selector: 'span.truncate' }).closest('li')!
const findRow = async (name: string) => (await screen.findByText(name, { selector: 'span.truncate' })).closest('li')!
const names = () =>
    within(screen.getByRole('tabpanel'))
        .queryAllByRole('listitem')
        .map((item) => item.querySelector('span.truncate.font-semibold')?.textContent)

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    for (const fn of Object.values(socialApi)) fn.mockReset()
    socialApi.fetchRelationships.mockResolvedValue(LIST)
})
afterEach(() => {
    act(() => void toast.dismiss())
})

describe('Trang Bạn bè (S-DM-02)', () => {
    it('opens on Pending when a request waits for me, its Badge said in words, the note and the time on its row', async () => {
        const { router } = renderFriends()

        expect(await screen.findByRole('tab', { name: 'Đang chờ, 1 lời mời đến' })).toHaveAttribute(
            'aria-selected',
            'true'
        )
        expect(router.state.location.search).toBe('?tab=pending')
        expect(screen.getByRole('radio', { name: 'Lời mời đến · 1' })).toHaveAttribute('aria-checked', 'true')
        const giang = rowOf('Giang')
        expect(giang).toHaveTextContent('“Mình là Giang lớp K22, xin vào nhóm ôn cùng nhé”')
        expect(within(giang).getByRole('button', { name: 'Chấp nhận' })).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Bạn bè', level: 1 })).toBeInTheDocument()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('radio', { name: 'Đã gửi · 1' }))
        expect(rowOf('Dũng')).toHaveTextContent('Không có lời nhắn')
        expect(within(rowOf('Dũng')).getByRole('button', { name: 'Hủy lời mời' })).toBeInTheDocument()
    })

    it('lists on Online the friends not offline in order, with their presence in words; All adds the offline ones', async () => {
        renderFriends({ at: '/friends?tab=online' })

        expect(await screen.findByRole('heading', { name: 'Trực tuyến — 4' })).toBeInTheDocument()
        expect(names()).toEqual(['Bình', 'Chi', 'Lan', 'Mai'])
        expect(rowOf('Lan')).toHaveTextContent('Vắng mặt')

        await userEvent.click(tab('Tất cả'))
        expect(screen.getByRole('heading', { name: 'Ngoại tuyến — 1' })).toBeInTheDocument()
        expect(names()).toEqual(['Bình', 'Chi', 'Lan', 'Mai', 'Nam'])
        expect(rowOf('Nam')).toHaveTextContent('Ngoại tuyến')
        await expectNoA11yViolations()
    })

    it('searches the tab shown, keeps the words across tabs, says when no one matches, and Esc clears it', async () => {
        renderFriends({ at: '/friends?tab=all' })
        const search = await screen.findByRole('searchbox', { name: 'Tìm theo tên hoặc username' })

        await userEvent.type(search, 'binh')
        expect(names()).toEqual(['Bình'])
        expect(screen.queryByRole('heading', { name: /Ngoại tuyến/ })).not.toBeInTheDocument()

        await userEvent.click(tab(/Đang chờ/))
        expect(screen.getByText('Không có ai khớp “binh”')).toBeInTheDocument()

        await userEvent.type(search, '{Escape}')
        expect(search).toHaveValue('')
        expect(names()).toEqual(['Giang'])
    })

    it('accepts with no question: the request leaves, the friend joins All, and a Toast says so', async () => {
        socialApi.acceptFriendRequest.mockResolvedValue(friend('giang', 'Giang', 'online'))
        const { client } = renderFriends()

        await userEvent.click(within(await screen.findByRole('listitem')).getByRole('button', { name: 'Chấp nhận' }))

        expect(await screen.findByText('Bạn và Giang đã là bạn bè')).toBeInTheDocument()
        expect(socialApi.acceptFriendRequest).toHaveBeenCalledWith('giang', expect.any(String))
        expect(screen.getByText('Không có lời mời nào đến')).toBeInTheDocument()
        expect(tab('Đang chờ')).toBeInTheDocument()
        expect(
            client.getQueryData<Relationship[]>(socialKeys.relationships())?.find((e) => e.user.id === 'giang')?.type
        ).toBe('friend')
    })

    it('says "no longer valid" for a request gone meanwhile, and the row leaves', async () => {
        socialApi.acceptFriendRequest.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
        renderFriends()

        await userEvent.click(within(await screen.findByRole('listitem')).getByRole('button', { name: 'Chấp nhận' }))

        expect(await screen.findByText('Lời mời không còn hiệu lực')).toBeInTheDocument()
        expect(screen.queryByText('Giang', { selector: 'span' })).not.toBeInTheDocument()
    })

    it('declines, cancels and unblocks with no question, each with its Toast', async () => {
        socialApi.removeRelationship.mockImplementation(async (id) => none(id, id === 'giang' ? 'Giang' : 'Dũng'))
        socialApi.unblockPerson.mockResolvedValue(none('khanh', 'Khánh'))
        socialApi.fetchRelationships.mockResolvedValue([...LIST, other('blocked', 'khanh', 'Khánh')])
        renderFriends()

        await userEvent.click(within(await screen.findByRole('listitem')).getByRole('button', { name: 'Từ chối' }))
        expect(await screen.findByText('Đã từ chối lời mời của Giang')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('radio', { name: 'Đã gửi · 1' }))
        await userEvent.click(screen.getByRole('button', { name: 'Hủy lời mời' }))
        expect(await screen.findByText('Đã hủy lời mời gửi Dũng')).toBeInTheDocument()

        await userEvent.click(tab('Đã chặn'))
        expect(rowOf('Khánh')).toHaveTextContent('Đã chặn')
        await userEvent.click(screen.getByRole('button', { name: 'Bỏ chặn' }))
        expect(await screen.findByText('Đã bỏ chặn Khánh')).toBeInTheDocument()
        expect(screen.getByText('Bạn chưa chặn ai')).toBeInTheDocument()
    })

    it('asks before removing a friend, the focus on "Giữ lại"; done, the row leaves with no Toast', async () => {
        socialApi.removeRelationship.mockResolvedValue(none('lan', 'Lan'))
        renderFriends({ at: '/friends?tab=online' })

        await userEvent.click(within(await findRow('Lan')).getByRole('button', { name: 'Thêm: Lan' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Hủy kết bạn' }))

        const dialog = await screen.findByRole('dialog', { name: 'Hủy kết bạn với Lan?' })
        expect(within(dialog).getByRole('button', { name: 'Giữ lại' })).toHaveFocus()
        expect(dialog).toHaveTextContent('Tin nhắn cũ vẫn còn. Lan không được báo.')
        await expectNoA11yViolations()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy kết bạn' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(socialApi.removeRelationship).toHaveBeenCalledWith('lan')
        expect(names()).toEqual(['Bình', 'Chi', 'Mai'])
    })

    it('asks before blocking; the friend moves to Blocked', async () => {
        socialApi.blockPerson.mockResolvedValue(other('blocked', 'mai', 'Mai'))
        renderFriends({ at: '/friends?tab=online' })

        await userEvent.click(within(await findRow('Mai')).getByRole('button', { name: 'Thêm: Mai' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Chặn' }))
        const dialog = await screen.findByRole('dialog', { name: 'Chặn Mai?' })
        expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Chặn' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        await userEvent.click(tab('Đã chặn'))
        expect(names()).toEqual(['Mai'])
    })

    it('turns the actions off while offline, Add friend too, saying why', async () => {
        renderFriends({ connection: 'offline' })

        const giang = within(await screen.findByRole('listitem'))
        expect(giang.getByRole('button', { name: 'Chấp nhận' })).toBeDisabled()
        expect(giang.getByRole('button', { name: 'Từ chối' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Thêm bạn' })).toBeDisabled()
    })

    it('changes the tab in the address and leaves the rest of it, a task’s detail open over the page', async () => {
        const { router } = renderFriends({ at: '/friends?task=t1' })

        await waitFor(() => expect(router.state.location.search).toBe('?task=t1&tab=pending'))
        await userEvent.click(tab('Tất cả'))

        expect(router.state.location.search).toBe('?task=t1&tab=all')
    })

    it('hears the socket: a new request comes in, a friend’s presence moves them', async () => {
        renderFriends({ at: '/friends?tab=online' })
        expect(await screen.findByRole('heading', { name: 'Trực tuyến — 4' })).toBeInTheDocument()

        act(() => {
            emitRealtimeEvent('relationship.added', { relationship: other('incoming', 'tuan', 'Tuấn') })
            emitRealtimeEvent('presence.updated', { userId: 'nam', status: 'online' })
            emitRealtimeEvent('presence.updated', { userId: 'binh', status: 'offline' })
        })

        expect(await screen.findByRole('tab', { name: 'Đang chờ, 2 lời mời đến' })).toBeInTheDocument()
        expect(names()).toEqual(['Chi', 'Nam', 'Lan', 'Mai'])

        act(() => emitRealtimeEvent('relationship.removed', { userId: 'chi' }))
        await waitFor(() => expect(names()).toEqual(['Nam', 'Lan', 'Mai']))
    })

    it('shows only the empty state with no friend, request or block at all', async () => {
        socialApi.fetchRelationships.mockResolvedValue([])
        renderFriends()

        expect(await screen.findByRole('heading', { name: 'Chưa có bạn bè' })).toBeInTheDocument()
        expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Thêm bạn' })).toHaveLength(1)
        await expectNoA11yViolations()
    })

    it('says "no friends yet" on Online with requests but no friend', async () => {
        socialApi.fetchRelationships.mockResolvedValue([other('outgoing', 'dung', 'Dũng')])
        renderFriends({ at: '/friends?tab=online' })

        expect(await screen.findByText('Chưa có bạn bè')).toBeInTheDocument()
    })
})

describe('Thêm bạn (S-DM-02 add-friend, D-110)', () => {
    const TUAN: PersonProfile = {
        user: person('tuan', 'Tuấn', 'tuan.hoang'),
        bio: 'Lớp K21 · CLB Guitar PTIT',
        presence: null,
        activity: null,
        relationship: 'none',
        mutualServers: [
            { id: 'ot', name: 'Ôn thi Giải tích 2' },
            { id: 'cg', name: 'CLB Guitar PTIT' },
            { id: 'nd', name: 'Nhóm đồ án Mobile' }
        ]
    }

    async function showDialog() {
        await userEvent.click(await screen.findByRole('button', { name: 'Thêm bạn' }))
        const dialog = await screen.findByRole('dialog', { name: 'Thêm bạn' })
        return { dialog, field: within(dialog).getByRole('textbox', { name: 'Username' }) }
    }

    async function openDialog(at = '/friends?tab=online') {
        const view = renderFriends({ at })
        return { ...view, ...(await showDialog()) }
    }

    it('looks up first, shows the card, then sends with the note: the page goes to Pending › Sent with a Toast', async () => {
        socialApi.lookUpPerson.mockResolvedValue(TUAN)
        socialApi.sendFriendRequest.mockResolvedValue(
            other('outgoing', 'tuan', 'Tuấn', { note: 'Mình là An, nhóm ôn Giải tích tối nay nhé' })
        )
        const { dialog, field, router } = await openDialog()

        await userEvent.type(field, ' @Tuan.Hoang {Enter}')
        expect(socialApi.lookUpPerson).toHaveBeenCalledWith('tuan.hoang')
        const card = await within(dialog).findByRole('region', { name: 'Tuấn' })
        expect(card).toHaveTextContent('Lớp K21 · CLB Guitar PTIT')
        expect(card).toHaveTextContent('Cùng ở Ôn thi Giải tích 2, CLB Guitar PTIT và 1 server khác')
        await expectNoA11yViolations()

        await userEvent.type(
            within(dialog).getByRole('textbox', { name: 'Lời nhắn (không bắt buộc)' }),
            'Mình là An, nhóm ôn Giải tích tối nay nhé'
        )
        expect(dialog).toHaveTextContent('41/150')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }))

        expect(socialApi.sendFriendRequest).toHaveBeenCalledWith(
            { username: 'tuan.hoang', note: 'Mình là An, nhóm ôn Giải tích tối nay nhé' },
            expect.any(String)
        )
        expect(await screen.findByText('Đã gửi lời mời kết bạn cho Tuấn')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(router.state.location.search).toBe('?tab=pending')
        expect(await screen.findByRole('radio', { name: 'Đã gửi · 2' })).toHaveAttribute('aria-checked', 'true')
        expect(names()).toEqual(['Tuấn', 'Dũng'])
    })

    it('drops the card when the username changes, the button back to "Tìm"', async () => {
        socialApi.lookUpPerson.mockResolvedValue(TUAN)
        const { dialog, field } = await openDialog()

        await userEvent.type(field, 'tuan.hoang{Enter}')
        await within(dialog).findByRole('region', { name: 'Tuấn' })
        await userEvent.type(field, 'x')

        expect(within(dialog).queryByRole('region')).not.toBeInTheDocument()
        expect(within(dialog).getByRole('button', { name: 'Tìm' })).toBeEnabled()
    })

    it('says each refusal under the field, the words selected: empty, oneself, not found, cannot', async () => {
        const { dialog, field } = await openDialog()
        const find = within(dialog).getByRole('button', { name: 'Tìm' })

        await userEvent.click(find)
        expect(field).toHaveAccessibleDescription('Nhập username')

        await userEvent.type(field, 'AN.X')
        await userEvent.click(find)
        expect(field).toHaveAccessibleDescription('Đây là username của bạn')
        expect(socialApi.lookUpPerson).not.toHaveBeenCalled()

        socialApi.lookUpPerson.mockRejectedValueOnce(apiError(404, 'NOT_FOUND_ERROR'))
        await userEvent.clear(field)
        await userEvent.type(field, 'ha.nguyenn{Enter}')
        await waitFor(() => expect(field).toHaveAccessibleDescription('Không tìm thấy username này'))
        expect(field).toHaveFocus()
        expect((field as HTMLInputElement).selectionStart).toBe(0)
        expect((field as HTMLInputElement).selectionEnd).toBe('ha.nguyenn'.length)

        socialApi.lookUpPerson.mockResolvedValueOnce(TUAN)
        socialApi.sendFriendRequest.mockRejectedValueOnce(apiError(403, 'CANNOT_MESSAGE_USER'))
        await userEvent.clear(field)
        await userEvent.type(field, 'tuan.hoang{Enter}')
        await within(dialog).findByRole('region', { name: 'Tuấn' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }))
        await waitFor(() => expect(field).toHaveAccessibleDescription('Không thể gửi lời mời cho người dùng này'))
    })

    it('waits out the look-up limit with "Tìm" off, and keeps the card with "Gửi lời mời" off at the day’s limit', async () => {
        socialApi.lookUpPerson.mockRejectedValueOnce(
            apiError(429, 'RATE_LIMIT_EXCEEDED', { data: { reason: 'user_lookup' }, headers: { 'retry-after': '42' } })
        )
        const { dialog, field } = await openDialog()

        await userEvent.type(field, 'tuan.hoang{Enter}')
        await waitFor(() => expect(field).toHaveAccessibleDescription('Bạn tra cứu nhanh quá. Thử lại sau 42 giây.'))
        expect(within(dialog).getByRole('button', { name: 'Tìm' })).toBeDisabled()

        await userEvent.type(field, 'x')
        socialApi.lookUpPerson.mockResolvedValueOnce(TUAN)
        socialApi.sendFriendRequest.mockRejectedValueOnce(
            apiError(429, 'RATE_LIMIT_EXCEEDED', { data: { reason: 'friend_requests' } })
        )
        // The countdown still runs: a new look-up waits for it, so the test opens the dialog again.
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        const again = await showDialog()
        await userEvent.type(again.field, 'tuan.hoang{Enter}')
        await within(again.dialog).findByRole('region', { name: 'Tuấn' })
        await userEvent.click(within(again.dialog).getByRole('button', { name: 'Gửi lời mời' }))

        await waitFor(() =>
            expect(again.field).toHaveAccessibleDescription(
                'Bạn đã gửi 50 lời mời hôm nay. Gửi tiếp được từ 00:00 ngày mai. Người cùng server vẫn nhắn tin được mà không cần kết bạn.'
            )
        )
        expect(within(again.dialog).getByRole('region', { name: 'Tuấn' })).toBeInTheDocument()
        expect(within(again.dialog).getByRole('button', { name: 'Gửi lời mời' })).toBeDisabled()
    })

    it('shows where we stand on the card: friends already (no sending), or asked by them (Accept, then All)', async () => {
        socialApi.lookUpPerson.mockResolvedValueOnce({ ...TUAN, relationship: 'friend', mutualServers: [] })
        const { dialog, field, router } = await openDialog()

        await userEvent.type(field, 'tuan.hoang{Enter}')
        const card = await within(dialog).findByRole('region', { name: 'Tuấn' })
        expect(card).toHaveTextContent('Chưa ở chung server nào')
        expect(card).toHaveTextContent('Hai bạn đã là bạn bè')
        expect(within(dialog).getByRole('button', { name: 'Gửi lời mời' })).toBeDisabled()

        const GIANG: PersonProfile = { ...TUAN, user: person('giang', 'Giang', 'giang.vo'), relationship: 'incoming' }
        socialApi.lookUpPerson.mockResolvedValueOnce(GIANG)
        socialApi.acceptFriendRequest.mockResolvedValue(friend('giang', 'Giang', 'online'))
        await userEvent.clear(field)
        await userEvent.type(field, 'giang.vo{Enter}')
        expect(await within(dialog).findByText('Giang đã gửi lời mời cho bạn')).toBeInTheDocument()
        await userEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận' }))

        expect(socialApi.acceptFriendRequest).toHaveBeenCalledWith('giang', expect.any(String))
        expect(await screen.findByText('Bạn và Giang đã là bạn bè')).toBeInTheDocument()
        expect(router.state.location.search).toBe('?tab=all')
    })

    it('sends again after a network error with the same Idempotency-Key: one intent, never two requests', async () => {
        socialApi.lookUpPerson.mockResolvedValue(TUAN)
        socialApi.sendFriendRequest
            .mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
            .mockResolvedValueOnce(other('outgoing', 'tuan', 'Tuấn'))
        const { dialog, field } = await openDialog()

        await userEvent.type(field, 'tuan.hoang{Enter}')
        await within(dialog).findByRole('region', { name: 'Tuấn' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }))
        await waitFor(() => expect(field).toHaveAccessibleDescription('Cần kết nối mạng'))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }))

        await screen.findByText('Đã gửi lời mời kết bạn cho Tuấn')
        const [first, second] = socialApi.sendFriendRequest.mock.calls
        expect(second![1]).toBe(first![1])
    })

    it('says "no longer valid" when the request on the card went meanwhile, and drops the card', async () => {
        socialApi.lookUpPerson.mockResolvedValue({
            ...TUAN,
            user: person('giang', 'Giang', 'giang.vo'),
            relationship: 'incoming'
        })
        socialApi.acceptFriendRequest.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
        const { dialog, field } = await openDialog()

        await userEvent.type(field, 'giang.vo{Enter}')
        await within(dialog).findByRole('region', { name: 'Giang' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Chấp nhận' }))

        expect(await screen.findByText('Lời mời không còn hiệu lực')).toBeInTheDocument()
        expect(within(dialog).queryByRole('region')).not.toBeInTheDocument()
        expect(field).not.toHaveAccessibleDescription('Không tìm thấy username này')
        expect(within(dialog).getByRole('button', { name: 'Tìm' })).toBeEnabled()
    })

    it('says a request already sent when it raced the card', async () => {
        socialApi.lookUpPerson.mockResolvedValue({ ...TUAN, user: person('dung', 'Dũng', 'dung.pham') })
        socialApi.sendFriendRequest.mockRejectedValue(apiError(409, 'FRIEND_REQUEST_PENDING'))
        const { dialog, field } = await openDialog()

        await userEvent.type(field, 'dung.pham{Enter}')
        await within(dialog).findByRole('region', { name: 'Dũng' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Gửi lời mời' }))

        await waitFor(() => expect(field).toHaveAccessibleDescription('Bạn đã gửi lời mời cho dung.pham rồi'))
    })
})

describe('Dòng hoạt động trên FriendRow (C-30, D-252)', () => {
    afterEach(() => rooms.clear())

    it('says what a friend studies in full, the room after the minutes; offline, their presence in words; live from activity.updated', async () => {
        rooms.set('binh', {
            name: 'Phòng học im lặng',
            isStudyRoom: true,
            session: {
                status: 'running',
                phase: 'focus',
                phaseEndsAt: new Date(Date.now() + 18.5 * 60_000).toISOString(),
                pausedRemainingMs: null
            } as SeenRoom['session']
        })
        socialApi.fetchRelationships.mockResolvedValue([
            { ...friend('binh', 'Bình', 'online'), activity: { room: 'study', solo: null } },
            { ...friend('nam', 'Nam', 'offline'), activity: { room: 'study', solo: null } },
            friend('chi', 'Chi', 'online')
        ])
        renderFriends({ at: '/friends?tab=all' })

        expect(await findRow('Bình')).toHaveTextContent('Tập trung · còn 18 phút · Phòng học im lặng')
        expect(rowOf('Nam')).toHaveTextContent('Ngoại tuyến')
        expect(rowOf('Nam')).not.toHaveTextContent('Đang học cùng nhóm')
        expect(rowOf('Chi')).toHaveTextContent('Trực tuyến')

        act(() =>
            emitRealtimeEvent('activity.updated', {
                userId: 'chi',
                activity: { room: null, solo: { status: 'waiting', phase: 'short_break', phaseEndsAt: null } }
            })
        )
        await waitFor(() => expect(rowOf('Chi')).toHaveTextContent('Đang học một mình · Hết giờ nghỉ'))
        await expectNoA11yViolations()
    })
})
