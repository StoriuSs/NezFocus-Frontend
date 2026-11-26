import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { toast, Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { connectProfilePopover, userKeys, type ProfilePopoverProps } from '@/features/users'
import { expectNoA11yViolations } from '@/test/a11y'
import { apiError } from '@/test/helpers'
import type { Task, TaskBoardPlace, TaskCandidate, TaskEvent, TaskHistory, TaskList } from '../types'

const tasksApi = {
    fetchOpenTasks: vi.fn<(channelId: string, q: string) => Promise<TaskList>>(),
    fetchDoneTasks: vi.fn<(channelId: string, q: string, before: string | null) => Promise<TaskList>>(),
    fetchTask: vi.fn<(taskId: string) => Promise<Task>>(),
    fetchTaskHistory: vi.fn<(taskId: string) => Promise<TaskHistory>>(),
    createTask: vi.fn<(channelId: string, body: unknown, key: string) => Promise<Task>>(),
    updateTask: vi.fn<(taskId: string, changes: unknown) => Promise<Task>>(),
    deleteTask: vi.fn<(taskId: string) => Promise<void>>(),
    assignTask: vi.fn<(taskId: string, userIds: string[]) => Promise<Task>>(),
    unassignTask: vi.fn<(taskId: string, userId: string) => Promise<Task>>()
}
vi.mock('../api/tasks.api', () => tasksApi)

const { TaskDetail } = await import('../components/TaskDetail')
const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { taskKeys } = await import('../api/keys')

const ZONE = 'Asia/Ho_Chi_Minh'
const person = (id: string, displayName: string): TaskCandidate => ({
    id,
    username: `${id}.vu`,
    displayName,
    avatarUrl: null
})
const AN = person('an', 'An')
const MINH = person('minh', 'Minh')
const LAN = person('lan', 'Lan')
const NAM = person('nam', 'Nam')
const on = (who: TaskCandidate, viewsChannel = true) => ({
    ...who,
    assignedAt: '2026-10-12T13:40:00.000Z',
    viewsChannel
})

let stamp = 0
/** 05 S-TASK-02 `assignee`: "Sửa lỗi đăng nhập", Minh's, An and Lan on it, doing. */
const task = (more: Partial<Task> = {}): Task => ({
    id: 't1',
    serverId: 'nd',
    channelId: 'viec-nhom',
    title: 'Sửa lỗi đăng nhập',
    description: 'Đăng nhập bằng OTP báo sai mã dù nhập đúng.',
    status: 'doing',
    dueAt: '2026-10-16T16:59:00.000Z',
    completedAt: null,
    createdAt: '2026-10-12T13:38:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 9, 12) + stamp++).toISOString(),
    creator: { ...MINH, leftServer: false },
    assignees: [on(LAN), on(AN)],
    ...more
})
const line = (id: string, kind: TaskEvent['kind'], more: Partial<TaskEvent> = {}): TaskEvent => ({
    id,
    kind,
    actor: MINH,
    subject: null,
    from: null,
    to: null,
    createdAt: '2026-10-12T13:40:00.000Z',
    ...more
})
const HISTORY: TaskHistory = {
    items: [
        line('h5', 'status_changed', { actor: AN, from: 'todo', to: 'doing' }),
        line('h4', 'assignee_added', { subject: LAN }),
        line('h3', 'assignee_added', { subject: AN }),
        line('h2', 'due_changed', { to: '2026-10-16T16:59:00.000Z' }),
        line('h1', 'created')
    ],
    total: 5
}

function place(more: Partial<TaskBoardPlace> = {}): TaskBoardPlace {
    return {
        channelId: 'viec-nhom',
        channelName: 'viec-nhom',
        serverName: 'Nhóm đồ án Mobile',
        create: true,
        manage: false,
        manageChannel: false,
        timedOut: false,
        candidates: (query) => ({
            queryKey: ['test', 'candidates', query],
            queryFn: async () => [AN, MINH, LAN, NAM].filter((one) => one.displayName!.includes(query))
        }),
        openSettings: vi.fn(),
        linkTo: (taskId) => `http://app.test/channels/nd/viec-nhom?task=${taskId}`,
        ...more
    }
}

function renderDetail(where: TaskBoardPlace | null = place(), seed?: (client: QueryClient) => void) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    seed?.(client)
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an.vu', displayName: 'An', avatarUrl: null })
    client.setQueryData(userKeys.settings(), { timezone: ZONE })
    const onClose = vi.fn()
    const onOpenChannel = vi.fn()
    const view = render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <TaskDetail taskId='t1' placeOf={() => where} onClose={onClose} onOpenChannel={onOpenChannel} />
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    return { ...view, client, onClose, onOpenChannel }
}

const dialog = () => screen.findByRole('dialog', { name: 'Sửa lỗi đăng nhập' })

beforeEach(async () => {
    await i18n.changeLanguage('vi')
    Object.values(tasksApi).forEach((fn) => fn.mockReset())
    tasksApi.fetchTask.mockResolvedValue(task())
    tasksApi.fetchTaskHistory.mockResolvedValue(HISTORY)
})
afterEach(() => {
    act(() => void toast.dismiss())
})

describe('The task detail (S-TASK-02)', () => {
    it('shows an assignee the task, its people, the newest history and what they may do', async () => {
        const { container } = renderDetail()
        const shown = await dialog()

        expect(within(shown).getByRole('button', { name: '# viec-nhom · Nhóm đồ án Mobile' })).toBeInTheDocument()
        expect(within(shown).getByRole('radio', { name: 'Đang làm' })).toHaveAttribute('aria-checked', 'true')
        // The status control has the focus (05 Q12).
        await waitFor(() => expect(within(shown).getByRole('radio', { name: 'Đang làm' })).toHaveFocus())
        expect(within(shown).getByText('NGƯỜI ĐƯỢC GIAO — 2')).toBeInTheDocument()
        const people = within(shown)
            .getAllByRole('listitem')
            .filter((item) => item.closest('ul'))
        expect(people[0]).toHaveTextContent('An (bạn)')
        expect(within(shown).getByRole('button', { name: 'Rút khỏi việc này' })).toBeInTheDocument()
        // Not its creator, not MANAGE_TASKS: no ⋯, no x on Lan's row, no "Tôi làm".
        expect(within(shown).queryByRole('button', { name: 'Tùy chọn của việc' })).not.toBeInTheDocument()
        expect(within(shown).queryByRole('button', { name: 'Gỡ Lan khỏi việc' })).not.toBeInTheDocument()
        expect(within(shown).queryByRole('button', { name: 'Tôi làm' })).not.toBeInTheDocument()

        expect(await within(shown).findByText('Bạn đã đổi trạng thái Cần làm → Đang làm')).toBeInTheDocument()
        expect(within(shown).getByText('Minh đã thêm Lan')).toBeInTheDocument()
        expect(within(shown).getByText('Minh đã thêm bạn')).toBeInTheDocument()
        expect(within(shown).queryByText('Minh đã tạo việc')).not.toBeInTheDocument()
        await userEvent.click(within(shown).getByRole('button', { name: 'Xem toàn bộ lịch sử (5)' }))
        expect(within(shown).getByText('Minh đã đặt hạn 16/10 · 23:59')).toBeInTheDocument()
        expect(within(shown).getByText('Minh đã tạo việc')).toBeInTheDocument()
        expect(within(shown).getByRole('button', { name: 'Thu gọn' })).toBeInTheDocument()
        await expectNoA11yViolations(container)
    })

    it('opens at once with the copy a board holds, reading it again behind (S-TASK-02 › loading)', async () => {
        tasksApi.fetchTask.mockReturnValue(new Promise(() => undefined))
        renderDetail(place(), (client) =>
            client.setQueryData(taskKeys.open('viec-nhom', ''), { items: [task()], doneCount: 0, hasMore: false })
        )

        expect(await dialog()).toBeInTheDocument()
        expect(tasksApi.fetchTask).toHaveBeenCalledWith('t1')
    })

    it('shows a Skeleton while a task opened from a link is read', async () => {
        tasksApi.fetchTask.mockReturnValue(new Promise(() => undefined))
        renderDetail()

        expect(await screen.findByRole('dialog', { name: 'Đang tải việc' })).toBeInTheDocument()
    })

    it('lets a viewer take it on ("Tôi làm"), then shows them on it', async () => {
        tasksApi.fetchTask.mockResolvedValue(task({ status: 'todo', assignees: [on(LAN)] }))
        tasksApi.assignTask.mockResolvedValue(task({ status: 'todo', assignees: [on(LAN), on(AN)] }))
        renderDetail()
        const shown = await dialog()

        // Not on it and not its creator: the status in words, no control.
        expect(within(shown).queryByRole('radiogroup')).not.toBeInTheDocument()
        expect(within(shown).getByText('Trạng thái')).toBeInTheDocument()
        await userEvent.click(within(shown).getByRole('button', { name: 'Tôi làm' }))

        expect(tasksApi.assignTask).toHaveBeenCalledWith('t1', ['an'])
        expect(await within(shown).findByRole('button', { name: 'Rút khỏi việc này' })).toBeInTheDocument()
        expect(within(shown).queryByRole('button', { name: 'Tôi làm' })).not.toBeInTheDocument()
        expect(within(shown).getByRole('radiogroup')).toBeInTheDocument()
    })

    it('adds people from "Thêm người" when the list closes; an assignee cannot take others off', async () => {
        tasksApi.assignTask.mockResolvedValue(task({ assignees: [on(LAN), on(AN), on(NAM)] }))
        renderDetail()
        const shown = await dialog()

        await userEvent.click(within(shown).getByRole('button', { name: 'Thêm người' }))
        const list = await screen.findByRole('listbox')
        const lan = await within(list).findByRole('option', { name: /Lan/ })
        expect(lan).toHaveAttribute('aria-disabled', 'true')
        await userEvent.click(lan)
        expect(lan).toHaveAttribute('aria-selected', 'true')
        await userEvent.click(within(list).getByRole('option', { name: /Nam/ }))
        await userEvent.keyboard('{Escape}')

        await waitFor(() => expect(tasksApi.assignTask).toHaveBeenCalledWith('t1', ['nam']))
        expect(tasksApi.unassignTask).not.toHaveBeenCalled()
        expect(await within(shown).findByText('NGƯỜI ĐƯỢC GIAO — 3')).toBeInTheDocument()
    })

    it('marks one who no longer views the channel, and a creator who left the server (D-194)', async () => {
        tasksApi.fetchTask.mockResolvedValue(
            task({ creator: { ...MINH, leftServer: true }, assignees: [on(LAN), on(NAM, false)] })
        )
        renderDetail()
        const shown = await dialog()

        expect(within(shown).getByText('Minh (đã rời server)')).toBeInTheDocument()
        const nam = within(shown).getByText('Nam').closest('li')!
        expect(within(nam).getByText('Mất quyền xem kênh')).toBeInTheDocument()
        const lan = within(shown).getByText('Lan').closest('li')!
        expect(within(lan).queryByText('Mất quyền xem kênh')).not.toBeInTheDocument()
    })

    it('saves a status at once, and puts it back with a Toast when refused', async () => {
        tasksApi.updateTask.mockResolvedValueOnce(task({ status: 'done', completedAt: '2026-10-15T14:12:00.000Z' }))
        renderDetail()
        const shown = await dialog()

        await userEvent.click(within(shown).getByRole('radio', { name: 'Xong' }))
        expect(tasksApi.updateTask).toHaveBeenCalledWith('t1', { status: 'done' })
        await waitFor(() =>
            expect(within(shown).getByRole('radio', { name: 'Xong' })).toHaveAttribute('aria-checked', 'true')
        )
        // No "Hoàn tác" here: the control itself changes it back (S-TASK-02 › Tương tác).
        expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument()

        tasksApi.updateTask.mockRejectedValueOnce(apiError(409, 'MAX_OPEN_TASKS_REACHED'))
        await userEvent.click(within(shown).getByRole('radio', { name: 'Cần làm' }))
        expect(
            await screen.findByText('Kênh đã có 500 việc chưa xong. Đánh dấu xong hoặc xóa bớt rồi mở lại.')
        ).toBeInTheDocument()
        expect(within(shown).getByRole('radio', { name: 'Xong' })).toHaveAttribute('aria-checked', 'true')
    })

    it('closes with "Việc này không còn khả dụng" when the task is gone or out of view (05 Q6)', async () => {
        tasksApi.fetchTask.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
        const { onClose } = renderDetail()

        expect(await screen.findByText('Việc này không còn khả dụng')).toBeInTheDocument()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('reads the task again when who may view the server changes, closing if it is out of view (D-194)', async () => {
        const { onClose } = renderDetail()
        await dialog()
        tasksApi.fetchTask.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))

        // Another server's change reads nothing.
        act(() => emitRealtimeEvent('channel.updated', { serverId: 'other' }))
        act(() => emitRealtimeEvent('channel.updated', { serverId: 'nd' }))

        expect(await screen.findByText('Việc này không còn khả dụng', {}, { timeout: 2000 })).toBeInTheDocument()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('reads the task again when someone joins the server: its creator may be back (D-194)', async () => {
        tasksApi.fetchTask.mockResolvedValue(task({ creator: { ...MINH, leftServer: true } }))
        renderDetail()
        const shown = await dialog()
        expect(within(shown).getByText('Minh (đã rời server)')).toBeInTheDocument()
        tasksApi.fetchTask.mockResolvedValue(task())

        act(() => emitRealtimeEvent('member.joined', { serverId: 'nd', userId: 'minh' }))

        expect(await within(shown).findByText('Minh', {}, { timeout: 2000 })).toBeInTheDocument()
    })

    it('closes the same way when one is no longer in its server (no place)', async () => {
        const { onClose } = renderDetail(null)

        expect(await screen.findByText('Việc này không còn khả dụng')).toBeInTheDocument()
        expect(onClose).toHaveBeenCalled()
    })

    it('closes with "Việc này vừa bị xóa" when someone deletes it meanwhile (05 › Edge case)', async () => {
        const { onClose } = renderDetail()
        await dialog()

        act(() => emitRealtimeEvent('task.deleted', { taskId: 't1', channelId: 'viec-nhom' }))

        expect(await screen.findByText('Việc này vừa bị xóa')).toBeInTheDocument()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("becomes a viewer's, saying who took one off, when someone else does (05 Q11)", async () => {
        renderDetail()
        const shown = await dialog()
        await within(shown).findByText('Minh đã thêm bạn')

        tasksApi.fetchTaskHistory.mockResolvedValue({
            items: [line('h6', 'assignee_removed', { subject: AN }), ...HISTORY.items],
            total: 6
        })
        act(() => emitRealtimeEvent('task.updated', { task: task({ assignees: [on(LAN)] }) }))

        expect(await screen.findByText('Minh đã gỡ bạn khỏi việc này')).toBeInTheDocument()
        expect(within(shown).getByRole('button', { name: 'Tôi làm' })).toBeInTheDocument()
        expect(within(shown).queryByRole('button', { name: 'Rút khỏi việc này' })).not.toBeInTheDocument()
    })

    it('says nothing when one takes oneself off', async () => {
        tasksApi.unassignTask.mockResolvedValue(task({ assignees: [on(LAN)] }))
        tasksApi.fetchTaskHistory.mockResolvedValue(HISTORY)
        renderDetail()
        const shown = await dialog()
        await within(shown).findByText('Minh đã thêm bạn')

        tasksApi.fetchTaskHistory.mockResolvedValue({
            items: [line('h6', 'assignee_removed', { actor: AN, subject: AN }), ...HISTORY.items],
            total: 6
        })
        await userEvent.click(within(shown).getByRole('button', { name: 'Rút khỏi việc này' }))

        expect(tasksApi.unassignTask).toHaveBeenCalledWith('t1', 'an')
        expect(await within(shown).findByText('Bạn đã rút khỏi việc')).toBeInTheDocument()
        expect(screen.queryByText(/đã gỡ bạn khỏi việc này/)).not.toBeInTheDocument()
    })

    it('gives its creator ⋯ with "Sửa", in place of the detail and back, and "Xóa việc"', async () => {
        tasksApi.fetchTask.mockResolvedValue(task({ creator: { ...AN, leftServer: false } }))
        tasksApi.deleteTask.mockResolvedValue(undefined)
        const { onClose } = renderDetail()
        let shown = await dialog()

        expect(within(shown).getByRole('button', { name: 'Gỡ Lan khỏi việc' })).toBeInTheDocument()
        await userEvent.click(within(shown).getByRole('button', { name: 'Tùy chọn của việc' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Sửa' }))
        const form = await screen.findByRole('dialog', { name: 'Sửa việc' })
        expect(within(form).getByRole('textbox', { name: /Tiêu đề/ })).toHaveValue('Sửa lỗi đăng nhập')
        await userEvent.click(within(form).getByRole('button', { name: 'Hủy' }))
        shown = await dialog()

        await userEvent.click(within(shown).getByRole('button', { name: 'Tùy chọn của việc' }))
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Xóa việc' }))
        const confirm = await screen.findByRole('dialog', { name: 'Xóa “Sửa lỗi đăng nhập”?' })
        await userEvent.click(within(confirm).getByRole('button', { name: 'Xóa việc' }))

        expect(await screen.findByText('Đã xóa “Sửa lỗi đăng nhập”')).toBeInTheDocument()
        await waitFor(() => expect(onClose).toHaveBeenCalled())
        expect(screen.queryByText('Việc này vừa bị xóa')).not.toBeInTheDocument()
    })

    it('goes to the channel from its line', async () => {
        const { onOpenChannel } = renderDetail()
        const shown = await dialog()

        await userEvent.click(within(shown).getByRole('button', { name: '# viec-nhom · Nhóm đồ án Mobile' }))

        expect(onOpenChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 't1', channelId: 'viec-nhom' }))
    })
})

// Last in the file: from here the profile popover is connected (a stand-in: whom and where).
describe("A task's people open their profile (05 S-TASK-02 › Đi tới, D-253)", () => {
    it("in the task's server, the creator and each assignee", async () => {
        connectProfilePopover(({ userId, serverId }: ProfilePopoverProps) => (
            <p>{`hồ sơ ${userId} trong ${serverId}`}</p>
        ))
        const user = userEvent.setup()
        renderDetail()
        const detail = await dialog()

        await user.click(within(detail).getByRole('button', { name: /^MMinh/ }))
        expect(await screen.findByText('hồ sơ minh trong nd')).toBeInTheDocument()
        await user.keyboard('{Escape}')
        await user.click(within(detail).getByRole('button', { name: /^LLan/ }))
        expect(await screen.findByText('hồ sơ lan trong nd')).toBeInTheDocument()
    })
})
