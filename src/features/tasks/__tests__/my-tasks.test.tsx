import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { MyTask, MyTaskList, Task, TaskBoardPlace, TaskCandidate, TaskServer } from '../types'

const tasksApi = {
    fetchMyTasks: vi.fn<(server: string | null, q: string) => Promise<MyTaskList>>(),
    fetchMyDoneTasks: vi.fn<(server: string | null, q: string, before: string | null) => Promise<MyTaskList>>(),
    updateTask: vi.fn<(taskId: string, changes: unknown) => Promise<Task>>()
}
vi.mock('../api/tasks.api', () => tasksApi)

const { default: MyTasks } = await import('../components/MyTasks')
const { default: MyTasksNav } = await import('../components/MyTasksNav')
const { useHeldTasks } = await import('../held-tasks.store')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string): TaskCandidate => ({
    id,
    username: `${id}.tran`,
    displayName,
    avatarUrl: null
})
const AN = person('an', 'An')
const MINH = person('minh', 'Minh')
const on = (who: TaskCandidate) => ({ ...who, assignedAt: '2026-10-12T00:00:00.000Z', viewsChannel: true })

/** A day from today in Hồ Chí Minh, at that clock. */
const inDays = (days: number, time: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(Date.now() + days * 86_400_000))
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}

let stamp = 0
const task = (id: string, title: string, more: Partial<MyTask> = {}): MyTask => ({
    id,
    serverId: 'ot',
    channelId: 'viec-ot',
    title,
    description: '',
    status: 'todo',
    dueAt: null,
    completedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 9, 10) + stamp++).toISOString(),
    creator: { ...AN, leftServer: false },
    assignees: [on(AN)],
    group: 'no_due',
    ...more
})

/** 05 › luật dữ liệu 3: An's tasks in world A. */
const SUA_LOI = task('t1', 'Sửa lỗi đăng nhập', {
    serverId: 'nd',
    channelId: 'viec-nd',
    status: 'doing',
    dueAt: inDays(-1, '23:59'),
    creator: { ...MINH, leftServer: false },
    group: 'overdue'
})
const ON_TAP = task('t2', 'Ôn chương 4 — tích phân bội', { dueAt: inDays(0, '23:59'), group: 'today' })
const TIEN_DO = task('t3', 'Cập nhật tiến độ tuần', {
    serverId: 'nd',
    channelId: 'viec-nd',
    dueAt: inDays(0, '23:59'),
    group: 'today'
})
const BAO_CAO = task('t4', 'Nộp báo cáo giữa kỳ', { dueAt: inDays(3, '23:59'), group: 'next_7_days' })
const DEMO = task('t5', 'Chuẩn bị demo cuối kỳ', {
    serverId: 'nd',
    channelId: 'viec-nd',
    dueAt: inDays(20, '23:59'),
    group: 'later'
})
const SLIDE = task('t6', 'Làm slide thuyết trình', { assignees: [] })
const ALL: MyTaskList = {
    items: [SUA_LOI, ON_TAP, TIEN_DO, BAO_CAO, DEMO, SLIDE],
    doneCount: 3,
    dueCount: 3,
    hasMore: false
}

const SERVERS: TaskServer[] = [
    { id: 'ot', name: 'Ôn thi Giải tích 2', icon: <span>ÔT</span> },
    { id: 'nd', name: 'Nhóm đồ án Mobile', icon: <span>NĐ</span> },
    { id: 'cg', name: 'CLB Guitar', icon: <span>CG</span> }
]

function placeOf(serverId: string, channelId: string): TaskBoardPlace | null {
    const server = SERVERS.find((one) => one.id === serverId)
    if (!server) return null
    return {
        channelId,
        channelName: 'viec-nhom',
        serverName: server.name,
        create: true,
        manage: false,
        manageChannel: false,
        timedOut: false,
        candidates: () => ({ queryKey: ['test'], queryFn: async () => [] }),
        openSettings: vi.fn(),
        linkTo: (taskId) => `http://app.test/channels/${serverId}/${channelId}?task=${taskId}`
    }
}

function WhereAmI() {
    return (
        <>
            <output data-testid='where'>{useLocation().search}</output>
            {/* The rail's "Việc cần làm". */}
            <Link to='/tasks'>rail to-do</Link>
        </>
    )
}

function renderPage(path = '/tasks', loaded: TaskServer[] | 'loading' = SERVERS) {
    const servers = loaded === 'loading' ? undefined : loaded
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.tran', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const view = render(
        <MemoryRouter initialEntries={[path]}>
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <MyTasksNav servers={servers} path='/tasks' />
                    <MyTasks servers={servers} placeOf={placeOf} />
                    <Toaster />
                    <WhereAmI />
                </TooltipProvider>
            </QueryClientProvider>
        </MemoryRouter>
    )
    return { ...view, client }
}

const group = (name: string) => screen.getByRole('heading', { name }).closest('section')!
const titles = (section: HTMLElement) =>
    within(section)
        .getAllByRole('listitem')
        .map((row) => within(row).getAllByRole('button')[0]!.getAttribute('aria-label')!.split(',')[0])
const nav = () => screen.getByRole('navigation', { name: 'Lọc việc theo server' })

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    Object.values(tasksApi).forEach((fn) => fn.mockReset())
    tasksApi.fetchMyTasks.mockImplementation(async (server) =>
        server ? { ...ALL, items: ALL.items.filter((one) => one.serverId === server), doneCount: 1 } : ALL
    )
    tasksApi.fetchMyDoneTasks.mockResolvedValue({ items: [], doneCount: null, dueCount: null, hasMore: false })
})
afterEach(() => {
    act(() => void toast.dismiss())
    useHeldTasks.setState({ holds: new Map() })
})

describe('Việc cần làm (S-TASK-04)', () => {
    it('lists one’s tasks in the groups the server gave them, with where each is, ĐÃ XONG folded', async () => {
        const { container } = renderPage()

        expect(await screen.findByRole('heading', { name: 'QUÁ HẠN — 1' })).toBeInTheDocument()
        expect(titles(group('HÔM NAY — 2'))).toEqual(['Ôn chương 4 — tích phân bội', 'Cập nhật tiến độ tuần'])
        expect(titles(group('7 NGÀY TỚI — 1'))).toEqual(['Nộp báo cáo giữa kỳ'])
        expect(titles(group('SAU ĐÓ — 1'))).toEqual(['Chuẩn bị demo cuối kỳ'])
        expect(titles(group('KHÔNG HẠN — 1'))).toEqual(['Làm slide thuyết trình'])
        expect(within(group('QUÁ HẠN — 1')).getByText(/^Quá hạn · .* · Nhóm đồ án Mobile › #viec-nhom$/)).toBeVisible()
        expect(within(group('KHÔNG HẠN — 1')).getByText('Không hạn · Ôn thi Giải tích 2 › #viec-nhom')).toBeVisible()
        expect(within(group('KHÔNG HẠN — 1')).getByText('Chưa giao')).toBeVisible()
        expect(screen.getByRole('button', { name: 'ĐÃ XONG — 3' })).toHaveAttribute('aria-expanded', 'false')
        expect(tasksApi.fetchMyDoneTasks).not.toHaveBeenCalled()
        // No way to make a task here (TASK-05).
        expect(screen.queryByRole('button', { name: 'Thêm việc' })).not.toBeInTheDocument()
        expect(screen.getByRole('heading', { level: 1, name: 'Việc cần làm' })).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('counts the tasks not done in the column, each server with some in the rail’s order', async () => {
        renderPage()
        expect(await within(nav()).findByRole('link', { name: 'Tất cả việc, 6 việc chưa xong' })).toHaveAttribute(
            'aria-current',
            'page'
        )
        const links = within(nav())
            .getAllByRole('link')
            .map((link) => link.getAttribute('aria-label'))
        expect(links).toEqual([
            'Tất cả việc, 6 việc chưa xong',
            'Ôn thi Giải tích 2, 3 việc chưa xong',
            'Nhóm đồ án Mobile, 3 việc chưa xong'
        ])
        expect(within(nav()).getByRole('heading', { name: 'THEO SERVER' })).toBeInTheDocument()
        // One Tab stop, the row chosen; ↑ ↓ between the rows (S-TASK-04 › Bàn phím).
        const all = within(nav()).getByRole('link', { name: /^Tất cả việc/ })
        expect(within(nav()).getByRole('link', { name: /^Ôn thi/ })).toHaveAttribute('tabindex', '-1')
        all.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(within(nav()).getByRole('link', { name: /^Ôn thi/ })).toHaveFocus()
        await userEvent.tab()
        expect(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })).toHaveFocus()
    })

    it('keeps one server’s tasks, its name in the header and only the channel on each row (`filter-server`)', async () => {
        renderPage()
        await userEvent.click(await within(nav()).findByRole('link', { name: /^Nhóm đồ án Mobile/ }))

        expect(await screen.findByRole('heading', { level: 1, name: 'Việc cần làm · Nhóm đồ án Mobile' })).toBeVisible()
        expect(screen.getByTestId('where')).toHaveTextContent('?server=nd')
        expect(tasksApi.fetchMyTasks).toHaveBeenLastCalledWith('nd', '')
        expect(within(nav()).getByRole('link', { name: /^Nhóm đồ án Mobile/ })).toHaveAttribute('aria-current', 'page')
        // The column still counts every server's.
        expect(within(nav()).getByRole('link', { name: 'Tất cả việc, 6 việc chưa xong' })).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByText(/Ôn chương 4/)).not.toBeInTheDocument())
        expect(within(group('QUÁ HẠN — 1')).getByText(/^Quá hạn · .* · #viec-nhom$/)).toBeVisible()
        expect(screen.getByRole('button', { name: 'ĐÃ XONG — 1' })).toBeInTheDocument()
    })

    it('goes back to every server’s tasks when the one in the address is not one’s own', async () => {
        renderPage('/tasks?server=gone&q=slide')
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?q=slide'))
        expect(screen.getByTestId('where')).not.toHaveTextContent('server')
    })

    it('searches as one stops typing, by status, the done ones open (`search`, D-97)', async () => {
        tasksApi.fetchMyDoneTasks.mockResolvedValue({
            items: [
                task('d1', 'Thiết kế màn hình đăng nhập', {
                    status: 'done',
                    completedAt: inDays(-2, '21:40'),
                    group: null
                })
            ],
            doneCount: null,
            dueCount: null,
            hasMore: false
        })
        renderPage()
        await screen.findByRole('heading', { name: 'QUÁ HẠN — 1' })
        tasksApi.fetchMyTasks.mockResolvedValue({ ...ALL, items: [SUA_LOI], doneCount: 1 })

        await userEvent.type(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' }), 'Đăng nhập')

        expect(await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })).toBeInTheDocument()
        expect(tasksApi.fetchMyTasks).toHaveBeenLastCalledWith(null, 'dang nhap')
        expect(screen.getByTestId('where')).toHaveTextContent('?q=%C4%90%C4%83ng+nh%E1%BA%ADp')
        expect(await screen.findByText('Thiết kế màn hình đăng nhập')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'XONG — 1' })).toHaveAttribute('aria-expanded', 'true')
        expect(screen.queryByRole('heading', { name: /QUÁ HẠN/ })).not.toBeInTheDocument()
    })

    it('says nothing matches, and where it looked when one server is chosen (`search-empty`)', async () => {
        tasksApi.fetchMyTasks.mockResolvedValue({ items: [], doneCount: 0, dueCount: 0, hasMore: false })
        renderPage('/tasks?server=nd&q=vat%20ly')
        expect(await screen.findByRole('heading', { name: 'Không có việc nào khớp “vat ly”' })).toBeVisible()
        expect(
            screen.getByText('Đang tìm trong Nhóm đồ án Mobile. Chọn Tất cả việc để tìm ở mọi server.')
        ).toBeVisible()
    })

    it('says when there is no task yet, without the search field (`empty`)', async () => {
        tasksApi.fetchMyTasks.mockResolvedValue({ items: [], doneCount: 0, dueCount: 0, hasMore: false })
        renderPage()
        expect(await screen.findByRole('heading', { name: 'Chưa có việc nào' })).toBeVisible()
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
        expect(within(nav()).getAllByRole('link')).toHaveLength(1)
    })

    it('says all is done above ĐÃ XONG (`all-done`)', async () => {
        tasksApi.fetchMyTasks.mockResolvedValue({ items: [], doneCount: 9, dueCount: 0, hasMore: false })
        renderPage()
        expect(await screen.findByRole('heading', { name: 'Xong hết rồi' })).toBeVisible()
        expect(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'ĐÃ XONG — 9' })).toBeInTheDocument()
    })

    it('keeps a row marked done in its group while its Toast shows, then lets it go (R5)', async () => {
        tasksApi.updateTask.mockImplementation(async (id, changes) => ({
            ...ON_TAP,
            ...(changes as object),
            id,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }))
        renderPage()
        await screen.findByRole('heading', { name: 'HÔM NAY — 2' })
        // The server, read again after the write, no longer lists it.
        tasksApi.fetchMyTasks.mockResolvedValue({
            ...ALL,
            items: ALL.items.filter((one) => one.id !== 't2'),
            doneCount: 4
        })

        await userEvent.click(screen.getByRole('button', { name: 'Đánh dấu xong: Ôn chương 4 — tích phân bội' }))

        expect(await screen.findByText('Đã xong “Ôn chương 4 — tích phân…”')).toBeInTheDocument()
        await waitFor(() => expect(tasksApi.fetchMyTasks).toHaveBeenCalledTimes(2))
        expect(titles(group('HÔM NAY — 2'))).toEqual(['Ôn chương 4 — tích phân bội', 'Cập nhật tiến độ tuần'])
        expect(screen.getByRole('button', { name: 'ĐÃ XONG — 3' })).toBeInTheDocument()

        act(() => void toast.dismiss())
        expect(await screen.findByRole('heading', { name: 'HÔM NAY — 1' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'ĐÃ XONG — 4' })).toBeInTheDocument()
    })

    it('reads the list again when a task of one’s own changes elsewhere, not for others’ (05 Q4)', async () => {
        renderPage()
        await screen.findByRole('heading', { name: 'QUÁ HẠN — 1' })
        const reads = tasksApi.fetchMyTasks.mock.calls.length

        act(() =>
            emitRealtimeEvent('task.updated', {
                task: task('x1', 'Việc của Minh', { creator: { ...MINH, leftServer: false }, assignees: [on(MINH)] })
            })
        )
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(tasksApi.fetchMyTasks).toHaveBeenCalledTimes(reads)

        act(() => emitRealtimeEvent('task.created', { task: task('x2', 'Việc mới giao cho An') }))
        await waitFor(() => expect(tasksApi.fetchMyTasks.mock.calls.length).toBeGreaterThan(reads))
        // Taken off one of its tasks: it is in the list, so read again too.
        const after = tasksApi.fetchMyTasks.mock.calls.length
        act(() =>
            emitRealtimeEvent('task.updated', {
                task: { ...DEMO, assignees: [on(MINH)], updatedAt: new Date().toISOString() }
            })
        )
        await waitFor(() => expect(tasksApi.fetchMyTasks.mock.calls.length).toBeGreaterThan(after))
    })

    it('opens a task on this page (`?task=`) and moves with ↑ ↓ between the rows', async () => {
        renderPage('/tasks?server=nd')
        const first = await screen.findByRole('button', { name: /^Sửa lỗi đăng nhập/ })
        first.focus()
        await userEvent.keyboard('{ArrowDown}')
        expect(screen.getByRole('button', { name: /^Cập nhật tiến độ tuần/ })).toHaveFocus()
        await userEvent.keyboard('{Enter}')
        expect(screen.getByTestId('where')).toHaveTextContent('?server=nd&task=t3')
    })

    it('reads the count of ĐÃ XONG again when a done task of one’s own goes, its group folded', async () => {
        renderPage()
        await screen.findByRole('button', { name: 'ĐÃ XONG — 3' })
        tasksApi.fetchMyTasks.mockResolvedValue({ ...ALL, doneCount: 2 })
        act(() => emitRealtimeEvent('task.deleted', { taskId: 'gone-done', channelId: 'viec-ot' }))
        expect(await screen.findByRole('button', { name: 'ĐÃ XONG — 2' })).toBeInTheDocument()
    })

    it('follows the words in the address when they change there, as from the rail', async () => {
        renderPage('/tasks?q=slide')
        expect(await screen.findByRole('searchbox', { name: 'Tìm việc theo tên' })).toHaveValue('slide')
        await userEvent.click(screen.getByRole('link', { name: 'rail to-do' }))
        await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })).toHaveValue(''))
        await new Promise((resolve) => setTimeout(resolve, 400))
        expect(screen.getByTestId('where')).toHaveTextContent(/^$/)
    })

    it('clears the words with the x in the field (05 › Tìm việc)', async () => {
        renderPage('/tasks?q=slide')
        await userEvent.click(await screen.findByRole('button', { name: 'Xóa từ khóa' }))
        expect(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })).toHaveValue('')
        expect(screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })).toHaveFocus()
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^$/))
    })

    it('reads only the chosen server’s tasks from a link to it, never every server’s first', async () => {
        // The servers list not read yet.
        renderPage('/tasks?server=nd', 'loading')
        await screen.findByRole('heading', { name: 'QUÁ HẠN — 1' })
        expect(tasksApi.fetchMyTasks).toHaveBeenCalledWith('nd', '')
        expect(screen.queryByText(/Ôn chương 4/)).not.toBeInTheDocument()
    })

    it('reads the list again when who may view a channel changes, not when another member comes to a server of none of its tasks', async () => {
        renderPage()
        await screen.findByRole('heading', { name: 'QUÁ HẠN — 1' })
        const reads = tasksApi.fetchMyTasks.mock.calls.length
        act(() => emitRealtimeEvent('member.joined', { serverId: 'cg', userId: 'minh' }))
        await new Promise((resolve) => setTimeout(resolve, 900))
        expect(tasksApi.fetchMyTasks).toHaveBeenCalledTimes(reads)
        act(() => emitRealtimeEvent('channel.updated', { serverId: 'cg', channelId: 'viec-cg' }))
        await waitFor(() => expect(tasksApi.fetchMyTasks.mock.calls.length).toBeGreaterThan(reads), { timeout: 2000 })
    })

    it('opens ĐÃ XONG 50 at a time, and starts it again after a task reopened meanwhile', async () => {
        const done = (id: string) =>
            task(id, `Xong ${id}`, { status: 'done', completedAt: inDays(-1, '20:00'), group: null })
        tasksApi.fetchMyDoneTasks.mockResolvedValueOnce({
            items: [done('d1')],
            doneCount: null,
            dueCount: null,
            hasMore: true
        })
        renderPage()
        await userEvent.click(await screen.findByRole('button', { name: 'ĐÃ XONG — 3' }))
        expect(await screen.findByText('Xong d1')).toBeInTheDocument()
        tasksApi.fetchMyDoneTasks.mockRejectedValueOnce(apiError(409, 'CONFLICT_ERROR'))
        tasksApi.fetchMyDoneTasks.mockResolvedValueOnce({
            items: [done('d2')],
            doneCount: null,
            dueCount: null,
            hasMore: false
        })
        await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }))
        expect(tasksApi.fetchMyDoneTasks).toHaveBeenCalledWith(null, '', 'd1')
        expect(await screen.findByText('Xong d2')).toBeInTheDocument()
        expect(tasksApi.fetchMyDoneTasks).toHaveBeenLastCalledWith(null, '', null)
    })
})
