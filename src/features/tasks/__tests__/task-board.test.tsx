import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation, useSearchParams } from 'react-router-dom'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import type { PanelState } from '@/components/shell/RightPanel'
import { ShellContext } from '@/components/shell/shell-context'
import { TooltipProvider } from '@/components/ui/tooltip'
import { userKeys } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Task, TaskBoardPlace, TaskCandidate, TaskList } from '../types'

const tasksApi = {
    fetchOpenTasks: vi.fn<(channelId: string, q: string) => Promise<TaskList>>(),
    fetchDoneTasks: vi.fn<(channelId: string, q: string, before: string | null) => Promise<TaskList>>(),
    createTask: vi.fn<(channelId: string, body: unknown, key: string) => Promise<Task>>(),
    updateTask: vi.fn<(taskId: string, changes: unknown) => Promise<Task>>(),
    deleteTask: vi.fn<(taskId: string) => Promise<void>>(),
    assignTask: vi.fn<(taskId: string, userIds: string[]) => Promise<Task>>(),
    unassignTask: vi.fn<(taskId: string, userId: string) => Promise<Task>>()
}
vi.mock('../api/tasks.api', () => tasksApi)

const { default: TaskBoard } = await import('../components/TaskBoard')
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
const BINH = person('binh', 'Bình')
const CHI = person('chi', 'Chi')
const DUNG = person('dung', 'Dũng')
const assigned = (who: TaskCandidate, at = '2026-10-12T00:00:00.000Z', viewsChannel = true) => ({
    ...who,
    assignedAt: at,
    viewsChannel
})

/** A day from today in Hồ Chí Minh, at that clock. */
const inDays = (days: number, time: string) => {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date(Date.now() + days * 86_400_000))
    return new Date(`${day}T${time}:00+07:00`).toISOString()
}

let stamp = 0
type TaskMore = Partial<Omit<Task, 'creator'>> & { creator?: TaskCandidate & { leftServer?: boolean } }
const task = (id: string, title: string, { creator = AN, ...more }: TaskMore = {}): Task => ({
    id,
    serverId: 'ot',
    channelId: 'viec-nhom',
    title,
    description: '',
    status: 'todo',
    dueAt: null,
    completedAt: null,
    createdAt: '2026-10-10T00:00:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 9, 10) + stamp++).toISOString(),
    creator: { leftServer: false, ...creator },
    assignees: [],
    ...more
})

/** 05 › world A: #viec-nhom of ÔT, 4 not done, 3 done. */
const GIAI_DE = task('t1', 'Giải đề giữa kỳ 2024', {
    status: 'doing',
    dueAt: inDays(-2, '23:59'),
    creator: DUNG,
    assignees: [assigned(DUNG)]
})
const ON_TAP = task('t2', 'Ôn chương 4 — tích phân bội', {
    dueAt: inDays(0, '23:59'),
    creator: CHI,
    assignees: [assigned(AN), assigned(CHI)]
})
const BAO_CAO = task('t3', 'Nộp báo cáo giữa kỳ', {
    dueAt: inDays(3, '23:59'),
    creator: BINH,
    assignees: [assigned(BINH), assigned(AN, '2026-10-13T00:00:00.000Z')]
})
const SLIDE = task('t4', 'Làm slide thuyết trình')
const BOARD: TaskList = { items: [SLIDE, BAO_CAO, ON_TAP, GIAI_DE], doneCount: 3, hasMore: false }

const PANEL: PanelState = { open: true, docked: true, toggle: vi.fn(), close: vi.fn() }

/** Where the page is: a row opens its task with `?task=` (05 Q6). */
function WhereAmI() {
    const [, setParams] = useSearchParams()
    return (
        <>
            <output data-testid='where'>{useLocation().search}</output>
            {/* What the shell does when a task's detail closes. */}
            <button type='button' onClick={() => setParams({}, { replace: true })}>
                close detail
            </button>
        </>
    )
}

function place(more: Partial<TaskBoardPlace> = {}): TaskBoardPlace {
    return {
        channelId: 'viec-nhom',
        channelName: 'viec-nhom',
        serverName: 'Ôn thi Giải tích 2',
        create: true,
        manage: false,
        manageChannel: false,
        timedOut: false,
        candidates: (query) => ({
            queryKey: ['test', 'candidates', query],
            queryFn: async () => [AN, BINH, CHI, DUNG].filter((one) => one.displayName!.includes(query))
        }),
        openSettings: vi.fn(),
        linkTo: (taskId) => `http://app.test/channels/ot/viec-nhom?task=${taskId}`,
        ...more
    }
}

function renderBoard(where = place(), enabled = true, panel: PanelState = PANEL) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.tran', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const ui = (board: TaskBoardPlace, on: boolean) => (
        <MemoryRouter initialEntries={['/servers/ot/viec-nhom']}>
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <TaskBoard panel={panel} buttonRef={{ current: null }} place={board} enabled={on} />
                    <Toaster />
                    <WhereAmI />
                </TooltipProvider>
            </QueryClientProvider>
        </MemoryRouter>
    )
    const view = render(ui(where, enabled))
    return { ...view, client, rerenderWith: (board: TaskBoardPlace, on: boolean) => view.rerender(ui(board, on)) }
}

const group = (name: RegExp) => screen.getByRole('heading', { name }).closest('section')!
const rowNamed = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) })

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    Object.values(tasksApi).forEach((fn) => fn.mockReset())
    tasksApi.fetchOpenTasks.mockResolvedValue(BOARD)
    tasksApi.fetchDoneTasks.mockResolvedValue({ items: [], doneCount: null, hasMore: false })
})
afterEach(() => {
    act(() => void toast.dismiss())
    useHeldTasks.setState({ holds: new Map() })
})

describe('The Task Board (S-TASK-01)', () => {
    it('groups the tasks not done by status, due first and none last, the done ones folded', async () => {
        const { container } = renderBoard()

        const doing = await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })
        expect(within(doing.closest('section')!).getAllByRole('listitem')).toHaveLength(1)
        const todo = within(group(/CẦN LÀM — 3/)).getAllByRole('listitem')
        expect(todo.map((row) => row.textContent)).toEqual([
            expect.stringContaining('Ôn chương 4 — tích phân bội'),
            expect.stringContaining('Nộp báo cáo giữa kỳ'),
            expect.stringContaining('Làm slide thuyết trình')
        ])
        expect(todo[0]).toHaveTextContent('Hôm nay · 23:59')
        expect(todo[2]).toHaveTextContent('Không hạn')
        expect(todo[2]).toHaveTextContent('Chưa giao')
        expect(within(doing.closest('section')!).getByText(/^Quá hạn · /)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'XONG — 3' })).toHaveAttribute('aria-expanded', 'false')
        expect(tasksApi.fetchDoneTasks).not.toHaveBeenCalled()
        expect(screen.getByRole('button', { name: 'Thêm việc' })).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('opens the done ones 50 at a time, the latest done first', async () => {
        tasksApi.fetchDoneTasks.mockResolvedValue({
            items: [task('d1', 'Đọc tài liệu chương 5', { status: 'done', completedAt: inDays(0, '20:30') })],
            doneCount: null,
            hasMore: true
        })
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'XONG — 3' }))
        expect(await screen.findByText('Đọc tài liệu chương 5')).toBeInTheDocument()
        expect(screen.getByText('Xong · Hôm nay · 20:30')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Xem thêm' }))
        expect(tasksApi.fetchDoneTasks).toHaveBeenLastCalledWith('viec-nhom', '', 'd1')
    })

    it('shows only what the viewer may do: a still box and only "Sao chép link việc" on a task of others (REQ-TASK-02)', async () => {
        renderBoard()
        await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })
        // Dũng's task, An not on it, no MANAGE_TASKS.
        expect(screen.queryByRole('button', { name: 'Đánh dấu xong: Giải đề giữa kỳ 2024' })).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn của việc Giải đề giữa kỳ 2024' }))
        const others = await screen.findByRole('menu')
        expect(
            within(others)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Sao chép link việc'])
        expect(within(others).queryByRole('menuitemradio')).not.toBeInTheDocument()
        await userEvent.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
        // On it: the box and the status in the menu, no edit.
        expect(screen.getByRole('button', { name: 'Đánh dấu xong: Nộp báo cáo giữa kỳ' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn của việc Nộp báo cáo giữa kỳ' }))
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitemradio')
                .map((item) => item.textContent)
        ).toEqual(['Cần làm', 'Đang làm', 'Xong'])
        expect(within(menu).queryByRole('menuitem', { name: 'Sửa' })).not.toBeInTheDocument()
    })

    it('opens a task from its row on this page (`?task=`), and copies its link (05 Q6)', async () => {
        const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        renderBoard()

        await userEvent.click(await screen.findByRole('button', { name: /^Nộp báo cáo giữa kỳ/ }))
        expect(screen.getByTestId('where')).toHaveTextContent('?task=t3')

        await userEvent.click(screen.getByRole('button', { name: 'Tùy chọn của việc Làm slide thuyết trình' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Sao chép link việc' }))
        // The task's own channel, wherever it was copied (D-194 place).
        expect(writeText).toHaveBeenCalledWith('http://app.test/channels/ot/viec-nhom?task=t4')
        expect(await screen.findByText('Đã sao chép link việc')).toBeInTheDocument()
    })

    it('gives the focus to the next row when the task open in the detail is deleted meanwhile (05 Q11)', async () => {
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: /^Nộp báo cáo giữa kỳ/ }))
        expect(screen.getByTestId('where')).toHaveTextContent('?task=t3')

        act(() => emitRealtimeEvent('task.deleted', { taskId: 't3', channelId: 'viec-nhom' }))
        await userEvent.click(screen.getByRole('button', { name: 'close detail' }))

        await waitFor(() => expect(rowNamed('Làm slide thuyết trình')).toHaveFocus())
    })

    it('says when someone on a task no longer views the channel, naming them (C-28, D-194)', async () => {
        tasksApi.fetchOpenTasks.mockResolvedValue({
            ...BOARD,
            items: [SLIDE, { ...BAO_CAO, assignees: [assigned(BINH, undefined, false), assigned(AN)] }, ON_TAP]
        })
        renderBoard()

        const row = await screen.findByRole('button', { name: /^Nộp báo cáo giữa kỳ/ })
        expect(row).toHaveAccessibleName(/mất quyền xem kênh: Bình$/)
        expect(within(row).getByText('Mất quyền xem kênh')).toBeInTheDocument()
        expect(within(rowNamed('Ôn chương 4')).queryByText('Mất quyền xem kênh')).not.toBeInTheDocument()
    })

    it('keeps a row marked done in its group, counts too, while its Toast shows; Hoàn tác sends the status back', async () => {
        const done = {
            ...ON_TAP,
            status: 'done' as const,
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
        tasksApi.updateTask.mockResolvedValueOnce(done)
        renderBoard()

        await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu xong: Ôn chương 4 — tích phân bội' }))
        expect(await screen.findByText('Đã xong “Ôn chương 4 — tích phân…”')).toBeInTheDocument()
        expect(tasksApi.updateTask).toHaveBeenCalledWith('t2', { status: 'done' })
        await waitFor(() => expect(screen.getByRole('button', { name: 'XONG — 3' })).toBeInTheDocument())
        expect(within(group(/CẦN LÀM — 3/)).getByText('Ôn chương 4 — tích phân bội')).toHaveClass('line-through')

        tasksApi.updateTask.mockResolvedValueOnce({ ...ON_TAP, updatedAt: new Date(Date.now() + 1000).toISOString() })
        await userEvent.click(screen.getByRole('button', { name: 'Hoàn tác' }))
        await waitFor(() => expect(tasksApi.updateTask).toHaveBeenLastCalledWith('t2', { status: 'todo' }))
        await waitFor(() =>
            expect(within(group(/CẦN LÀM — 3/)).getByText('Ôn chương 4 — tích phân bội')).not.toHaveClass(
                'line-through'
            )
        )
    })

    it('moves the row once its Toast goes', async () => {
        tasksApi.updateTask.mockResolvedValueOnce({
            ...ON_TAP,
            status: 'done',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu xong: Ôn chương 4 — tích phân bội' }))
        await screen.findByText('Đã xong “Ôn chương 4 — tích phân…”')
        await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalled())
        act(() => void toast.dismiss('task-t2'))
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 2' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'XONG — 4' })).toBeInTheDocument()
    })

    it('puts the box back when reopening finds the channel full (05 › Edge case)', async () => {
        const done = task('d1', 'Đọc tài liệu chương 5', {
            status: 'done',
            completedAt: inDays(0, '20:30'),
            creator: AN
        })
        tasksApi.fetchDoneTasks.mockResolvedValue({ items: [done], doneCount: null, hasMore: false })
        tasksApi.updateTask.mockRejectedValueOnce(apiError(409, 'MAX_OPEN_TASKS_REACHED'))
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'XONG — 3' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Mở lại: Đọc tài liệu chương 5' }))
        expect(
            await screen.findByText('Kênh đã có 500 việc chưa xong. Đánh dấu xong hoặc xóa bớt rồi mở lại.')
        ).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Mở lại: Đọc tài liệu chương 5' })).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument())
    })

    it('takes in what others do, live (task.*)', async () => {
        renderBoard()
        await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })
        act(() => emitRealtimeEvent('task.created', { task: task('t9', 'Viết tài liệu API', { creator: BINH }) }))
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 4' })).toBeInTheDocument()
        act(() =>
            emitRealtimeEvent('task.updated', {
                task: { ...GIAI_DE, status: 'todo', updatedAt: new Date().toISOString() }
            })
        )
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 5' })).toBeInTheDocument()
        act(() => emitRealtimeEvent('task.deleted', { taskId: 't9', channelId: 'viec-nhom' }))
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 4' })).toBeInTheDocument()
        // Another channel's task changes nothing here.
        act(() => emitRealtimeEvent('task.created', { task: task('x', 'Khác', { channelId: 'khac' }) }))
        expect(screen.queryByText('Khác')).not.toBeInTheDocument()
    })

    it('says the board is off, offering the channel settings only to who may change them', async () => {
        const settings = place({ manageChannel: true })
        const { rerenderWith } = renderBoard(place(), false)
        expect(await screen.findByRole('heading', { name: 'Task Board đã tắt' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Mở cài đặt kênh' })).not.toBeInTheDocument()
        expect(tasksApi.fetchOpenTasks).not.toHaveBeenCalled()
        rerenderWith(settings, false)
        await userEvent.click(screen.getByRole('button', { name: 'Mở cài đặt kênh' }))
        expect(settings.openSettings).toHaveBeenCalled()
        // Refused by the API in the meantime: the same.
        tasksApi.fetchOpenTasks.mockRejectedValue(
            apiError(403, 'FORBIDDEN_ERROR', { data: { reason: 'task_board_disabled' } })
        )
        rerenderWith(settings, true)
        expect(await screen.findByRole('heading', { name: 'Task Board đã tắt' })).toBeInTheDocument()
    })

    it('says there are none yet, adding the first only with CREATE_TASKS', async () => {
        tasksApi.fetchOpenTasks.mockResolvedValue({ items: [], doneCount: 0, hasMore: false })
        const { container } = renderBoard()
        expect(await screen.findByRole('heading', { name: 'Chưa có việc nào' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Thêm việc đầu tiên' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Tìm việc' })).not.toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('searches the titles without accents, the done ones open; Esc clears, then closes', async () => {
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Tìm việc' }))
        const field = screen.getByRole('searchbox', { name: 'Tìm việc theo tên' })
        expect(field).toHaveFocus()
        expect(screen.queryByRole('button', { name: 'Thêm việc' })).not.toBeInTheDocument()
        tasksApi.fetchOpenTasks.mockResolvedValue({ items: [ON_TAP], doneCount: 1, hasMore: false })
        await userEvent.type(field, 'Chương')
        await waitFor(() => expect(tasksApi.fetchOpenTasks).toHaveBeenLastCalledWith('viec-nhom', 'chuong'))
        await waitFor(() => expect(tasksApi.fetchDoneTasks).toHaveBeenCalledWith('viec-nhom', 'chuong', null))
        expect(await screen.findByRole('button', { name: 'XONG — 1' })).toHaveAttribute('aria-expanded', 'true')
        await userEvent.keyboard('{Escape}')
        expect(field).toHaveValue('')
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    })

    it('moves between rows with ↑ ↓ and marks one with Space', async () => {
        tasksApi.updateTask.mockResolvedValue({ ...BAO_CAO, status: 'done', completedAt: new Date().toISOString() })
        renderBoard()
        await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })
        rowNamed('Giải đề giữa kỳ 2024').focus()
        await userEvent.keyboard('{ArrowDown}{ArrowDown}')
        expect(rowNamed('Nộp báo cáo giữa kỳ')).toHaveFocus()
        await userEvent.keyboard(' ')
        await waitFor(() => expect(tasksApi.updateTask).toHaveBeenCalledWith('t3', { status: 'done' }))
    })
})

describe('The Task Board, review fixes (L3)', () => {
    it('keeps a sheet open while its dialogs and Toasts are used (below 1280)', async () => {
        const sheet: PanelState = { open: true, docked: false, toggle: vi.fn(), close: vi.fn() }
        renderBoard(place(), true, sheet)
        await userEvent.click(await screen.findByRole('button', { name: 'Thêm việc' }))
        const dialog = await screen.findByRole('dialog', { name: 'Thêm việc' })
        await userEvent.click(within(dialog).getByRole('textbox', { name: /Tiêu đề/ }))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Hủy' }))
        expect(sheet.close).not.toHaveBeenCalled()
    })

    it('leaves out an event older than what was seen, and one about a task deleted (any order)', async () => {
        const done = {
            ...ON_TAP,
            status: 'done' as const,
            completedAt: '2026-11-01T00:00:00.000Z',
            updatedAt: '2026-11-01T00:00:00.000Z'
        }
        tasksApi.updateTask.mockResolvedValueOnce(done)
        renderBoard()
        await userEvent.click(
            await screen.findByRole('button', { name: 'Tùy chọn của việc Ôn chương 4 — tích phân bội' })
        )
        await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Xong' }))
        act(() => void toast.dismiss())
        expect(await screen.findByRole('button', { name: 'XONG — 4' })).toBeInTheDocument()
        // Someone else's change before it, told after it.
        act(() =>
            emitRealtimeEvent('task.updated', {
                task: { ...ON_TAP, status: 'doing', updatedAt: '2026-10-31T00:00:00.000Z' }
            })
        )
        act(() => emitRealtimeEvent('task.deleted', { taskId: 't4', channelId: 'viec-nhom' }))
        act(() =>
            emitRealtimeEvent('task.updated', {
                task: { ...SLIDE, title: 'cũ', updatedAt: '2026-10-31T00:00:00.000Z' }
            })
        )
        await waitFor(() => expect(screen.getByRole('heading', { name: 'CẦN LÀM — 1' })).toBeInTheDocument())
        expect(screen.queryByRole('heading', { name: /ĐANG LÀM — 2/ })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'XONG — 4' })).toBeInTheDocument()
        expect(screen.queryByText('cũ')).not.toBeInTheDocument()
    })

    it('reads the board again when a change comes while it is being read the first time', async () => {
        let answer!: (list: TaskList) => void
        tasksApi.fetchOpenTasks.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        renderBoard()
        await waitFor(() => expect(tasksApi.fetchOpenTasks).toHaveBeenCalledTimes(1))
        act(() => emitRealtimeEvent('task.created', { task: task('t9', 'Viết tài liệu API') }))
        answer(BOARD)
        await waitFor(() => expect(tasksApi.fetchOpenTasks).toHaveBeenCalledTimes(2))
    })

    it('keeps the keyboard focus on a row that moves, and on the next one when it is deleted', async () => {
        tasksApi.updateTask.mockResolvedValueOnce({
            ...BAO_CAO,
            status: 'done',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        })
        renderBoard()
        await screen.findByRole('heading', { name: 'ĐANG LÀM — 1' })
        rowNamed('Ôn chương 4 — tích phân bội').focus()
        act(() =>
            emitRealtimeEvent('task.updated', {
                task: { ...ON_TAP, status: 'doing', updatedAt: new Date().toISOString() }
            })
        )
        expect(await screen.findByRole('heading', { name: 'ĐANG LÀM — 2' })).toBeInTheDocument()
        await waitFor(() => expect(rowNamed('Ôn chương 4 — tích phân bội')).toHaveFocus())
        act(() => emitRealtimeEvent('task.deleted', { taskId: 't2', channelId: 'viec-nhom' }))
        await waitFor(() => expect(rowNamed('Nộp báo cáo giữa kỳ')).toHaveFocus())
    })
})

describe('The Task Board, more review fixes (L3)', () => {
    it('offline, keeps the list and turns off what saves, saying why (05 Q10)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.tran', displayName: 'An', avatarUrl: null })
        render(
            <MemoryRouter>
                <QueryClientProvider client={client}>
                    <ShellContext.Provider
                        value={{ navOpen: false, toggleNav: () => undefined, connection: 'offline' }}
                    >
                        <TooltipProvider>
                            <TaskBoard panel={PANEL} buttonRef={{ current: null }} place={place()} enabled />
                        </TooltipProvider>
                    </ShellContext.Provider>
                </QueryClientProvider>
            </MemoryRouter>
        )
        const add = await screen.findByRole('button', { name: 'Thêm việc' })
        expect(add).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Đánh dấu xong: Nộp báo cáo giữa kỳ' })).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Tùy chọn của việc Nộp báo cáo giữa kỳ' })).toBeDisabled()
        await userEvent.hover(add.parentElement!)
        expect((await screen.findAllByText('Cần kết nối mạng')).length).toBeGreaterThan(0)
    })

    it('starts the done group again after a page whose task is no longer done (CONFLICT_ERROR)', async () => {
        tasksApi.fetchDoneTasks
            .mockResolvedValueOnce({
                items: [task('d1', 'Đọc tài liệu chương 5', { status: 'done', completedAt: inDays(0, '20:30') })],
                doneCount: null,
                hasMore: true
            })
            .mockRejectedValueOnce(apiError(409, 'CONFLICT_ERROR'))
            .mockResolvedValue({ items: [], doneCount: null, hasMore: false })
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'XONG — 3' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm' }))
        await waitFor(() => expect(tasksApi.fetchDoneTasks).toHaveBeenCalledTimes(3))
        expect(tasksApi.fetchDoneTasks).toHaveBeenLastCalledWith('viec-nhom', '', null)
    })

    it('closes the form of a task deleted meanwhile, saying it is no longer there', async () => {
        tasksApi.updateTask.mockRejectedValueOnce(apiError(404, 'NOT_FOUND_ERROR'))
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Tùy chọn của việc Làm slide thuyết trình' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
        const dialog = await screen.findByRole('dialog', { name: 'Sửa việc' })
        await userEvent.type(within(dialog).getByRole('textbox', { name: /Tiêu đề/ }), '!')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))
        expect(await screen.findByText('Việc này không còn khả dụng')).toBeInTheDocument()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })
})

describe('Adding and editing a task (S-TASK-03)', () => {
    it('needs a title, then adds the task with the people picked and says so', async () => {
        tasksApi.createTask.mockImplementation(async (_, body) =>
            task('new', (body as { title: string }).title, { assignees: [assigned(AN), assigned(BINH)] })
        )
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Thêm việc' }))
        const dialog = await screen.findByRole('dialog', { name: 'Thêm việc' })
        expect(within(dialog).getByText('# viec-nhom · Ôn thi Giải tích 2')).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', { name: /Tiêu đề/ })).toHaveFocus()
        await expectNoA11yViolations(dialog)

        await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))
        expect(await within(dialog).findByText('Nhập tiêu đề')).toBeInTheDocument()
        expect(tasksApi.createTask).not.toHaveBeenCalled()

        await userEvent.type(within(dialog).getByRole('textbox', { name: /Tiêu đề/ }), 'Giải đề cuối kỳ 2025')
        await userEvent.click(within(dialog).getByRole('button', { name: /Người được giao/ }))
        const people = await screen.findByRole('listbox', { name: 'Người được giao' })
        const options = await within(people).findAllByRole('option')
        expect(options[0]).toHaveTextContent('Tôi (An)')
        await userEvent.click(options[0]!)
        await userEvent.click(within(people).getByRole('option', { name: /Bình/ }))
        expect(screen.getByText('Đã chọn 2')).toBeInTheDocument()
        await expectNoA11yViolations(people.closest('[role="dialog"]') as HTMLElement)
        await userEvent.keyboard('{Escape}')
        expect(within(dialog).getByRole('button', { name: /Người được giao/ })).toHaveTextContent('An, Bình')

        await userEvent.keyboard('{Control>}{Enter}{/Control}')
        await waitFor(() =>
            expect(tasksApi.createTask).toHaveBeenCalledWith(
                'viec-nhom',
                { title: 'Giải đề cuối kỳ 2025', description: null, dueAt: null, assigneeIds: ['an', 'binh'] },
                expect.any(String)
            )
        )
        expect(await screen.findByText('Đã thêm “Giải đề cuối kỳ 2025”')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 4' })).toBeInTheDocument()
    })

    it('refuses a due date gone by under its field, before any request (D-96)', async () => {
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Thêm việc' }))
        const dialog = await screen.findByRole('dialog', { name: 'Thêm việc' })
        await userEvent.type(within(dialog).getByRole('textbox', { name: /Tiêu đề/ }), 'Cập nhật tiến độ')
        await userEvent.click(within(dialog).getByRole('button', { name: /Hạn/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Hôm nay' }))
        const time = screen.getByRole('textbox', { name: 'Giờ' })
        await userEvent.clear(time)
        await userEvent.type(time, '0000')
        await userEvent.click(screen.getByRole('button', { name: 'Xong' }))
        expect(within(dialog).getByRole('button', { name: /Hạn/ })).toHaveTextContent('Hôm nay · 00:00')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))
        expect(await within(dialog).findByText('Hạn phải sau thời điểm hiện tại')).toBeInTheDocument()
        expect(tasksApi.createTask).not.toHaveBeenCalled()
    })

    it('names who can no longer be given the task, and the full channel, above the buttons', async () => {
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Thêm việc' }))
        const dialog = await screen.findByRole('dialog', { name: 'Thêm việc' })
        await userEvent.type(within(dialog).getByRole('textbox', { name: /Tiêu đề/ }), 'Nộp bài')
        await userEvent.click(within(dialog).getByRole('button', { name: /Người được giao/ }))
        await userEvent.click(await screen.findByRole('option', { name: /Chi/ }))
        await userEvent.keyboard('{Escape}')

        tasksApi.createTask.mockRejectedValueOnce(
            apiError(400, 'INVALID_TASK_ASSIGNEE', { data: { userIds: ['chi'] } })
        )
        await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))
        expect(
            await within(dialog).findByText(
                'Chi không còn xem được kênh này nên không thể giao việc. Bỏ chọn Chi rồi lưu lại.'
            )
        ).toBeInTheDocument()

        tasksApi.createTask.mockRejectedValueOnce(apiError(409, 'MAX_OPEN_TASKS_REACHED'))
        await userEvent.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))
        expect(
            await within(dialog).findByText(
                'Kênh đã có 500 việc chưa xong. Đánh dấu xong hoặc xóa bớt để thêm việc mới.'
            )
        ).toBeInTheDocument()
        expect(within(dialog).getByRole('textbox', { name: /Tiêu đề/ })).toHaveValue('Nộp bài')
    })

    it('edits from the row menu, sending only what changed and the people added or taken off', async () => {
        tasksApi.updateTask.mockResolvedValue({ ...SLIDE, title: 'Làm slide thuyết trình cuối kỳ' })
        tasksApi.assignTask.mockResolvedValue({ ...SLIDE, assignees: [assigned(BINH)] })
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Tùy chọn của việc Làm slide thuyết trình' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
        const dialog = await screen.findByRole('dialog', { name: 'Sửa việc' })
        const title = within(dialog).getByRole('textbox', { name: /Tiêu đề/ })
        expect(title).toHaveValue('Làm slide thuyết trình')
        await userEvent.type(title, ' cuối kỳ')
        await userEvent.click(within(dialog).getByRole('button', { name: /Người được giao/ }))
        await userEvent.click(await screen.findByRole('option', { name: /Bình/ }))
        await userEvent.keyboard('{Escape}')
        await userEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }))
        await waitFor(() =>
            expect(tasksApi.updateTask).toHaveBeenCalledWith('t4', { title: 'Làm slide thuyết trình cuối kỳ' })
        )
        expect(tasksApi.assignTask).toHaveBeenCalledWith('t4', ['binh'])
        expect(tasksApi.unassignTask).not.toHaveBeenCalled()
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    })

    it('deletes from the row menu after asking, focus on Hủy first', async () => {
        tasksApi.deleteTask.mockResolvedValue()
        renderBoard()
        await userEvent.click(await screen.findByRole('button', { name: 'Tùy chọn của việc Làm slide thuyết trình' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Xóa việc' }))
        const dialog = await screen.findByRole('dialog', { name: 'Xóa “Làm slide thuyết trình”?' })
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Hủy' })).toHaveFocus())
        await expectNoA11yViolations(dialog)
        await userEvent.click(within(dialog).getByRole('button', { name: 'Xóa việc' }))
        expect(await screen.findByText('Đã xóa “Làm slide thuyết trình”')).toBeInTheDocument()
        expect(tasksApi.deleteTask).toHaveBeenCalledWith('t4')
        expect(await screen.findByRole('heading', { name: 'CẦN LÀM — 2' })).toBeInTheDocument()
        // Its row gone, the focus on the row before it (the last one left).
        await waitFor(() => expect(rowNamed('Nộp báo cáo giữa kỳ')).toHaveFocus())
    })
})
