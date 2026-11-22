import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import { serverKeys } from '../api/keys'
import type { Server, ServerChannel } from '../types'

const serversApi = { fetchServers: vi.fn(), createServer: vi.fn(), uploadServerIcon: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const layoutApi = {
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    moveInLayout: vi.fn()
}
vi.mock('@/features/servers/api/layout.api', () => layoutApi)
const tasksApi = { fetchOpenTasks: vi.fn() }
vi.mock('@/features/tasks/api/tasks.api', () => tasksApi)

const { default: ChannelDialogs } = await import('../components/dialogs/ChannelDialogs')
const { useChannelDialogs } = await import('../channel-dialogs.store')

/** VIEW_CHANNEL, SEND_MESSAGES, MANAGE_CHANNELS: Chi, Điều phối phòng học. */
const CHI_BITS = String((1n << 8n) | (1n << 10n) | (1n << 3n))

const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: 'info',
    type: 'text',
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
    permissions: CHI_BITS,
    viewRoleIds: [],
    voiceStates: null,
    focusSession: null,
    ...extra
})

/** ÔT as Chi sees it: she holds Trưởng nhóm and Điều phối, and manages channels. */
const OT: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: CHI_BITS,
    topRolePosition: 2,
    roleIds: ['coord', 'lead'],
    roles: [
        { id: 'admin', name: 'Quản trị', position: 3, administrator: true },
        { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false },
        { id: 'coord', name: 'Điều phối phòng học', position: 1, administrator: false }
    ],
    timeoutUntil: null,
    welcomeChannelId: 'chao-mung',
    categories: [
        { id: 'info', name: 'Thông tin', position: 0 },
        { id: 'rooms', name: 'Phòng học', position: 1 }
    ],
    channels: [
        channel('chao-mung'),
        channel('tai-lieu', { position: 1 }),
        channel('hoi-dap', { position: 2 }),
        channel('phong', { categoryId: 'rooms', type: 'voice', name: 'Phòng học im lặng', isStudyRoom: true })
    ]
}

function renderDialogs(server: Server = OT, client?: QueryClient) {
    serversApi.fetchServers.mockResolvedValue([server])
    const router = createMemoryRouter(
        [
            { path: '/channels/:serverId/:channelId', element: <ChannelDialogs /> },
            { path: '*', element: <h1>Elsewhere</h1> }
        ],
        { initialEntries: ['/channels/ot/hoi-dap'] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        {
            wrapper: client
                ? ({ children }: { children: ReactNode }) => (
                      <QueryClientProvider client={client}>{children}</QueryClientProvider>
                  )
                : queryWrapper()
        }
    )
    return router
}

/** "Close" in the row of buttons, not the corner ✕ that shares its name. */
const footerClose = (dialog: HTMLElement) =>
    within(dialog)
        .getAllByRole('button', { name: 'Close' })
        .find((button) => button.textContent === 'Close')!

const refused = (status: number, type: string, data: object = {}) =>
    new AxiosError(String(status), String(status), undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { meta: { type, code: '0' }, data }
    })

describe('Create a channel (S-SRV-05)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    it('shows what a text channel will be saved as, creates it in the category it came from and opens it', async () => {
        layoutApi.createChannel.mockResolvedValue({ id: 'new', server: OT })
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        const router = renderDialogs()

        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await waitFor(() => expect(name).toHaveFocus())
        await userEvent.type(name, 'Tài liệu chương 5')
        expect(screen.getByText('Will be saved as #tài-liệu-chương-5')).toBeInTheDocument()
        expect(screen.getByText('17/100')).toBeInTheDocument()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/new'))
        expect(layoutApi.createChannel).toHaveBeenCalledWith(
            'ot',
            {
                type: 'text',
                name: 'tài-liệu-chương-5',
                categoryId: 'info',
                isStudyRoom: false,
                isPrivate: false,
                viewRoleIds: []
            },
            expect.any(String)
        )
    })

    it('names a clash in the category before any request (D-84), and one the API finds after', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.type(name, 'Tai lieu')
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        expect(screen.getByRole('alert')).toHaveTextContent('THÔNG TIN already has a channel #tai-lieu')
        expect(layoutApi.createChannel).not.toHaveBeenCalled()

        // One they cannot see (private) clashes too: the API says so.
        layoutApi.createChannel.mockRejectedValue(refused(422, 'VALIDATION_ERROR', { rule: 'name_taken' }))
        await userEvent.clear(name)
        await userEvent.type(name, 'bi mat')
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('THÔNG TIN already has a channel #bi-mat')
        expect(name).toHaveFocus()
    })

    it('says what a name with nothing left needs', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Channel name' }), '__')
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        expect(screen.getByRole('alert')).toHaveTextContent('A channel name needs at least one letter or digit')
    })

    it('makes a study room, keeping what was typed when the type changes, and opens its preview page', async () => {
        layoutApi.createChannel.mockResolvedValue({ id: 'room', server: OT })
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'rooms', type: 'voice' })
        const router = renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Room name' })
        await userEvent.type(name, 'Phòng ôn chương 3')
        await userEvent.click(screen.getByRole('radio', { name: /Text channel/ }))
        expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Phòng ôn chương 3')
        await userEvent.click(screen.getByRole('radio', { name: /Voice room/ }))
        const field = screen.getByRole('textbox', { name: 'Room name' }).parentElement!
        expect(field.querySelector('.lucide-volume-2')).not.toBeNull()
        await userEvent.click(screen.getByRole('switch', { name: 'Make it a study room' }))
        // The icon follows the switch, as in the room settings (S-SET-06).
        expect(field.querySelector('.lucide-lamp-desk')).not.toBeNull()
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(layoutApi.createChannel).toHaveBeenCalled())
        expect(layoutApi.createChannel.mock.calls[0]![1]).toMatchObject({
            type: 'voice',
            name: 'Phòng ôn chương 3',
            categoryId: 'rooms',
            isStudyRoom: true
        })
        // The room's own page: its preview, not a call (L7, 07 S-ROOM-01).
        await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/room'))
    })

    it('locks the switches while the room is being created', async () => {
        layoutApi.createChannel.mockReturnValue(new Promise(() => {}))
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'rooms', type: 'voice' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Room name' }), 'Phòng ôn chương 3')
        expect(screen.getByRole('switch', { name: 'Make it a study room' })).toBeEnabled()
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Make it a study room' })).toBeDisabled())
        expect(screen.getByRole('switch', { name: 'Private channel' })).toBeDisabled()
    })

    it('ticks their highest role for a private channel, locks the all-powerful one, and warns when they would lose it', async () => {
        layoutApi.createChannel.mockResolvedValue({ id: 'new', server: OT })
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Channel name' }), 'ban can su')
        await userEvent.click(screen.getByRole('switch', { name: 'Private channel' }))

        expect(screen.getByText('Roles that can see it · 1 chosen')).toBeInTheDocument()
        const admin = screen.getByRole('checkbox', { name: /Quản trị · Administrator/ })
        expect(admin).toBeChecked()
        expect(admin).toHaveAttribute('aria-disabled', 'true')
        expect(screen.getByRole('checkbox', { name: /Trưởng nhóm/ })).toBeChecked()
        expect(screen.getAllByText('Your role')).toHaveLength(2)
        expect(screen.queryByText('You will not see this channel once it is created')).not.toBeInTheDocument()

        await userEvent.click(admin)
        expect(admin).toBeChecked()
        await userEvent.click(screen.getByRole('checkbox', { name: /Trưởng nhóm/ }))
        expect(screen.getByText('You will not see this channel once it is created')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('checkbox', { name: /Điều phối/ }))
        expect(screen.queryByText('You will not see this channel once it is created')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(layoutApi.createChannel).toHaveBeenCalled())
        expect(layoutApi.createChannel.mock.calls[0]![1]).toMatchObject({ isPrivate: true, viewRoleIds: ['coord'] })
    })

    it('searches the roles of a private channel without case or accents, from ten roles', async () => {
        const roles = [
            ...OT.roles,
            ...Array.from({ length: 7 }, (_, i) => ({
                id: `r${i}`,
                name: `Nhóm ${i}`,
                position: 0,
                administrator: false
            }))
        ]
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        renderDialogs({ ...OT, roles })
        await userEvent.click(await screen.findByRole('switch', { name: 'Private channel' }))
        const search = screen.getByRole('searchbox', { name: 'Search roles' })

        await userEvent.type(search, 'dieu phoi')
        expect(screen.getAllByRole('checkbox')).toHaveLength(1)
        expect(screen.getByRole('checkbox', { name: /Điều phối phòng học/ })).toBeInTheDocument()

        await userEvent.clear(search)
        await userEvent.type(search, 'TRƯỞNG')
        expect(screen.getAllByRole('checkbox')).toHaveLength(1)
        expect(screen.getByRole('checkbox', { name: /Trưởng nhóm/ })).toBeInTheDocument()
    })

    it('stops at 500 channels and categories, saying why', async () => {
        const full = {
            ...OT,
            channels: Array.from({ length: 498 }, (_, i) => channel(`c${i}`, { position: i }))
        }
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs(full)
        await screen.findByRole('textbox', { name: 'Channel name' })
        expect(screen.getAllByText(/500 channels and categories/)[0]).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create channel' })).toHaveAttribute('aria-disabled', 'true')
    })

    it('says when it cannot reach the server, and when the right to do it is gone', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Channel name' }), 'x')
        layoutApi.createChannel.mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        expect(await screen.findByText('You need a connection to create a channel')).toBeInTheDocument()
        layoutApi.createChannel.mockRejectedValueOnce(refused(403, 'FORBIDDEN_ERROR'))
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        // MANAGE_CHANNELS lost while open (03 SRV-EDGE): nothing left to do but close.
        expect(await screen.findByText('You can no longer create channels in this server')).toBeInTheDocument()
        const dialog = screen.getByRole('dialog', { name: 'Create a channel' })
        expect(within(dialog).queryByRole('button', { name: 'Create channel' })).toBeNull()
        expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
        // Enter in the name sends nothing more: there is nothing left to try.
        await userEvent.type(screen.getByRole('textbox', { name: 'Channel name' }), '{Enter}')
        expect(layoutApi.createChannel).toHaveBeenCalledTimes(2)
        await userEvent.click(footerClose(dialog))
        expect(useChannelDialogs.getState().open).toBeNull()
    })

    it('puts the channel at the top when its category is deleted meanwhile, saying so, sending nothing by itself (03 SRV-EDGE)', async () => {
        layoutApi.createChannel.mockResolvedValue({ id: 'new', server: OT })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        renderDialogs(OT, client)
        await userEvent.type(await screen.findByRole('textbox', { name: 'Channel name' }), 'de-cuong')

        // Someone deletes THÔNG TIN: its channels go to the top (the server read again, D-178).
        act(
            () =>
                void client.setQueryData<Server[]>(serverKeys.list(), [
                    {
                        ...OT,
                        categories: OT.categories.filter((one) => one.id !== 'info'),
                        channels: OT.channels.map((one) =>
                            one.categoryId === 'info' ? { ...one, categoryId: null } : one
                        )
                    }
                ])
        )

        expect(
            await screen.findByText('Category THÔNG TIN was just deleted · the channel will be at the top of the list')
        ).toBeInTheDocument()
        expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('No category')
        expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('de-cuong')
        expect(layoutApi.createChannel).not.toHaveBeenCalled()
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() =>
            expect(layoutApi.createChannel).toHaveBeenCalledWith(
                'ot',
                expect.objectContaining({ name: 'de-cuong', categoryId: null }),
                expect.any(String)
            )
        )
    })

    it('tries again with the same Idempotency-Key after a lost answer, so one channel is made', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Channel name' }), 'x')
        layoutApi.createChannel
            .mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
            .mockResolvedValueOnce({ id: 'new', server: OT })
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await screen.findByText('You need a connection to create a channel')
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(layoutApi.createChannel).toHaveBeenCalledTimes(2))
        const [first, again] = layoutApi.createChannel.mock.calls
        expect(again![2]).toBe(first![2])
    })
})

describe('Channel settings (S-SET-05)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    it('sends only what changed, and closes without a request when nothing did', async () => {
        layoutApi.updateChannel.mockResolvedValue(OT)
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs()
        expect(await screen.findByText('#hoi-dap · THÔNG TIN')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(layoutApi.updateChannel).not.toHaveBeenCalled()

        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        await userEvent.click(await screen.findByRole('radio', { name: /Only message managers/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(layoutApi.updateChannel).toHaveBeenCalledWith('ot', 'hoi-dap', { sendMode: 'managers' })
        )
    })

    it('locks the private switch while the settings are being saved', async () => {
        layoutApi.updateChannel.mockReturnValue(new Promise(() => {}))
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('radio', { name: /Only message managers/ }))
        expect(screen.getByRole('switch', { name: 'Private channel' })).toBeEnabled()
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(screen.getByRole('switch', { name: 'Private channel' })).toBeDisabled())
    })

    it('turns the Task Board on for a text channel, none for a room (S-SET-05, D-88)', async () => {
        layoutApi.updateChannel.mockResolvedValue(OT)
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('switch', { name: 'Task Board' }))
        expect(screen.queryByRole('status')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(layoutApi.updateChannel).toHaveBeenCalledWith('ot', 'hoi-dap', { taskBoardEnabled: true })
        )
        expect(tasksApi.fetchOpenTasks).not.toHaveBeenCalled()

        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'phong' })
        await screen.findByRole('dialog')
        expect(screen.queryByRole('switch', { name: 'Task Board' })).not.toBeInTheDocument()
    })

    it('says what turning the board off hides, under the switch, without a dialog (`taskboard-off`)', async () => {
        const board = {
            ...OT,
            channels: OT.channels.map((one) => (one.id === 'hoi-dap' ? { ...one, taskBoardEnabled: true } : one))
        }
        tasksApi.fetchOpenTasks.mockResolvedValue({ items: [{ id: 't1' }, { id: 't2' }], doneCount: 5, hasMore: false })
        layoutApi.updateChannel.mockResolvedValue(board)
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(board)
        const toggle = await screen.findByRole('switch', { name: 'Task Board' })
        expect(toggle).toBeChecked()
        await userEvent.click(toggle)
        expect(
            await screen.findByText(
                "2 open tasks will be hidden from the channel and from everyone's tasks, with no more reminders. Turn it on again to bring them back as they were."
            )
        ).toBeInTheDocument()
        expect(tasksApi.fetchOpenTasks).toHaveBeenCalledWith('hoi-dap', '')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(layoutApi.updateChannel).toHaveBeenCalledWith('ot', 'hoi-dap', { taskBoardEnabled: false })
        )
    })

    it('marks the welcome channel, and refuses a rename onto another channel of the category', async () => {
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'chao-mung' })
        renderDialogs()
        expect(await screen.findByText('The server’s welcome channel.')).toBeInTheDocument()
        const name = screen.getByRole('textbox', { name: 'Channel name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Hoi dap')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(screen.getByRole('alert')).toHaveTextContent('THÔNG TIN already has a channel #hoi-dap')
    })

    it('deletes only once the name is typed, in any case and without accents, then says so', async () => {
        layoutApi.deleteChannel.mockResolvedValue({ ...OT, channels: OT.channels.filter((c) => c.id !== 'hoi-dap') })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        const router = renderDialogs()
        await userEvent.click(await screen.findByRole('button', { name: 'Delete channel' }))
        const confirm = await screen.findByRole('dialog', { name: 'Delete #hoi-dap?' })
        const button = () => screen.getAllByRole('button', { name: 'Delete channel' }).at(-1)!
        expect(button()).toBeDisabled()
        await userEvent.type(screen.getByRole('textbox', { name: 'Type hoi-dap to confirm' }), 'Hôi-Dap')
        expect(button()).toBeEnabled()
        await userEvent.click(button())
        expect(await screen.findByText('Deleted #hoi-dap')).toBeInTheDocument()
        expect(confirm).not.toBeInTheDocument()
        expect(router.state.location.pathname).toBe('/channels/ot/chao-mung')
        // Deleted here: not said as gone from someone else.
        expect(screen.queryByText('#hoi-dap is no longer available')).toBeNull()
    })

    // A list read again after an event (D-178), as liveServers writes it.
    const listNow = (client: QueryClient, server: Server) =>
        act(() => void client.setQueryData<Server[]>(serverKeys.list(), [server]))

    it('closes when its channel leaves the list, saying so, without claiming it was deleted (04 SET-EDGE)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(OT, client)
        expect(await screen.findByText('#hoi-dap · THÔNG TIN')).toBeInTheDocument()

        listNow(client, { ...OT, channels: OT.channels.filter((one) => one.id !== 'hoi-dap') })

        expect(await screen.findByText('#hoi-dap is no longer available')).toBeInTheDocument()
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
        expect(useChannelDialogs.getState().open).toBeNull()
    })

    it('names a room without #', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'phong' })
        renderDialogs(OT, client)
        await screen.findByRole('dialog')

        listNow(client, { ...OT, channels: OT.channels.filter((one) => one.id !== 'phong') })

        expect(await screen.findByText('Phòng học im lặng is no longer available')).toBeInTheDocument()
    })

    it('says nothing of it when the whole server went: what took it says so (11 S-MOD-02)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(OT, client)
        await screen.findByRole('dialog')

        act(() => void client.setQueryData<Server[]>(serverKeys.list(), []))

        await waitFor(() => expect(useChannelDialogs.getState().open).toBeNull())
        expect(screen.queryByText(/no longer available/)).toBeNull()
    })

    it('takes what someone else saved into the fields left alone, keeping what was typed (04 SET-EDGE)', async () => {
        layoutApi.updateChannel.mockResolvedValue(OT)
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(OT, client)
        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'hoi-dap-ky-2')

        listNow(client, {
            ...OT,
            channels: OT.channels.map((one) => (one.id === 'hoi-dap' ? { ...one, sendMode: 'managers' } : one))
        })

        await waitFor(() => expect(screen.getByRole('radio', { name: /Only message managers/ })).toBeChecked())
        expect(name).toHaveValue('hoi-dap-ky-2')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(layoutApi.updateChannel).toHaveBeenCalledWith('ot', 'hoi-dap', { name: 'hoi-dap-ky-2' })
        )
    })

    it('leaves the channel open here before it leaves the list: not taken for one someone else deleted (02 channel-removed)', async () => {
        layoutApi.deleteChannel.mockResolvedValue({ ...OT, channels: OT.channels.filter((c) => c.id !== 'hoi-dap') })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const whereWhenGone: string[] = []
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        const router = renderDialogs(OT, client)
        client.getQueryCache().subscribe((event) => {
            const servers = event.query.state.data as Server[] | undefined
            if (
                event.type === 'updated' &&
                event.query.queryKey[1] === 'list' &&
                servers?.[0]?.channels.every((c) => c.id !== 'hoi-dap')
            ) {
                whereWhenGone.push(router.state.location.pathname)
            }
        })
        await userEvent.click(await screen.findByRole('button', { name: 'Delete channel' }))
        await userEvent.type(await screen.findByRole('textbox', { name: 'Type hoi-dap to confirm' }), 'hoi-dap')
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete channel' }).at(-1)!)
        expect(await screen.findByText('Deleted #hoi-dap')).toBeInTheDocument()
        expect(whereWhenGone[0]).toBe('/channels/ot/chao-mung')
    })
})

describe('Room settings (S-SET-06, D-210)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
        layoutApi.updateChannel.mockResolvedValue(OT)
    })
    afterEach(() => useChannelDialogs.getState().hide())

    const withRoom = (extra: Partial<ServerChannel>, server: Partial<Server> = {}): Server => ({
        ...OT,
        ...server,
        channels: OT.channels.map((one) => (one.id === 'phong' ? { ...one, ...extra } : one))
    })
    const openRoom = async (server: Server = OT) => {
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'phong' })
        renderDialogs(server)
        return screen.findByRole('dialog', { name: 'Room settings' })
    }
    const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const sent = async () => {
        await waitFor(() => expect(layoutApi.updateChannel).toHaveBeenCalled())
        return layoutApi.updateChannel.mock.calls[0]![2] as object
    }

    it('shows who may start and the cycle of a study room, and saves only what changed (`study-room`)', async () => {
        await openRoom()
        expect(screen.getByRole('switch', { name: 'Study room' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('radio', { name: 'Everyone in the room' })).toBeChecked()
        expect(screen.getByRole('radio', { name: '25/5' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByText('Filled in when a study session starts. Long break: off.')).toBeInTheDocument()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('radio', { name: /Only study room managers/ }))
        await userEvent.click(screen.getByRole('radio', { name: '50/10' }))
        await save()
        expect(await sent()).toEqual({ studyStarter: 'managers', studyFocusMinutes: 50, studyShortBreakMinutes: 10 })
    })

    it('hides the study part while the switch is off, and makes a plain room a study room (`voice`)', async () => {
        await openRoom(withRoom({ isStudyRoom: false }))
        expect(screen.getByRole('switch', { name: 'Study room' })).toHaveAttribute('aria-checked', 'false')
        expect(screen.queryByRole('radiogroup', { name: 'Default cycle' })).not.toBeInTheDocument()
        expect(screen.queryByText('Who can start a study session')).not.toBeInTheDocument()

        await userEvent.click(screen.getByRole('switch', { name: 'Study room' }))
        expect(screen.getByRole('radiogroup', { name: 'Default cycle' })).toBeInTheDocument()
        await save()
        expect(await sent()).toEqual({ isStudyRoom: true })
    })

    it('turning the study room off sends that alone, not what was changed under it before', async () => {
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: /Only study room managers/ }))
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        // Hidden once the switch is off: not checked either.
        await userEvent.clear(screen.getByRole('textbox', { name: 'Focus (5–120)' }))
        await userEvent.click(screen.getByRole('switch', { name: 'Study room' }))
        await save()
        expect(await sent()).toEqual({ isStudyRoom: false })
    })

    it('opens Custom on the saved lengths, sums it up, and saves a long break (`cycle-custom`)', async () => {
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        const focus = screen.getByRole('textbox', { name: 'Focus (5–120)' })
        const shortBreak = screen.getByRole('textbox', { name: 'Short break (1–30)' })
        expect(focus).toHaveValue('25')
        expect(shortBreak).toHaveValue('5')
        await userEvent.clear(focus)
        await userEvent.type(focus, '4x5')
        expect(focus).toHaveValue('45')
        await userEvent.clear(shortBreak)
        await userEvent.type(shortBreak, '10')
        expect(screen.getByText('45 min focus · 10 min break · no long break')).toBeInTheDocument()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('switch', { name: 'Long break' }))
        expect(screen.getByRole('textbox', { name: 'Long break (5–60)' })).toHaveValue('15')
        expect(screen.getByRole('textbox', { name: 'After every (2–8) rounds' })).toHaveValue('4')
        expect(screen.getByText('45 min focus · 10 min break · 15 min long break every 4 rounds')).toBeInTheDocument()
        await save()
        expect(await sent()).toEqual({
            studyFocusMinutes: 45,
            studyShortBreakMinutes: 10,
            studyLongBreakMinutes: 15,
            studyLongBreakEvery: 4
        })
    })

    it('opens a saved long break on Custom, and turning it off sends both halves empty', async () => {
        await openRoom(withRoom({ studyLongBreakMinutes: 20, studyLongBreakEvery: 3 }))
        expect(screen.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('switch', { name: 'Long break' })).toHaveAttribute('aria-checked', 'true')
        expect(screen.getByRole('textbox', { name: 'Long break (5–60)' })).toHaveValue('20')
        await userEvent.click(screen.getByRole('switch', { name: 'Long break' }))
        await save()
        expect(await sent()).toEqual({ studyLongBreakMinutes: null, studyLongBreakEvery: null })
    })

    it('steps a number with ↑ ↓ inside its range (C-22)', async () => {
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        const shortBreak = screen.getByRole('textbox', { name: 'Short break (1–30)' })
        await userEvent.click(shortBreak)
        await userEvent.keyboard('{ArrowUp}{ArrowUp}')
        expect(shortBreak).toHaveValue('7')
        await userEvent.clear(shortBreak)
        await userEvent.type(shortBreak, '30{ArrowUp}')
        expect(shortBreak).toHaveValue('30')
    })

    it('checks the numbers when Save is pressed, under each field, and sends nothing (`cycle-invalid`)', async () => {
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        const focus = screen.getByRole('textbox', { name: 'Focus (5–120)' })
        await userEvent.clear(focus)
        await userEvent.type(focus, '150')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(screen.queryByText(/min focus/)).not.toBeInTheDocument()
        await save()
        expect(await screen.findByText('Focus must be from 5 to 120 minutes')).toBeInTheDocument()
        expect(focus).toHaveAttribute('aria-invalid', 'true')
        expect(focus).toHaveFocus()
        expect(layoutApi.updateChannel).not.toHaveBeenCalled()

        await userEvent.type(focus, '{Backspace}')
        expect(screen.queryByText('Focus must be from 5 to 120 minutes')).not.toBeInTheDocument()
    })

    it('takes a number error away when the cycle or the switch changes: checked again on the next Save only', async () => {
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        await userEvent.clear(screen.getByRole('textbox', { name: 'Focus (5–120)' }))
        await save()
        expect(await screen.findByText('Focus must be from 5 to 120 minutes')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('radio', { name: '50/10' }))
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        expect(screen.queryByText('Focus must be from 5 to 120 minutes')).not.toBeInTheDocument()

        await save()
        expect(await screen.findByText('Focus must be from 5 to 120 minutes')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('switch', { name: 'Study room' }))
        await userEvent.click(screen.getByRole('switch', { name: 'Study room' }))
        expect(screen.queryByText('Focus must be from 5 to 120 minutes')).not.toBeInTheDocument()
    })

    it('still sends a rename made before the right to manage channels went: the API refuses it, and they are told', async () => {
        layoutApi.updateChannel.mockRejectedValue(refused(403, 'FORBIDDEN_ERROR'))
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'phong' })
        renderDialogs(OT, client)
        const name = await screen.findByRole('textbox', { name: 'Room name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Phòng ôn thi')
        // A role taken away meanwhile: the list read again has no MANAGE_CHANNELS, only the study room right.
        const studyOnly = String((1n << 8n) | (1n << 10n) | (1n << 15n) | (1n << 20n))
        act(() => void client.setQueryData<Server[]>(serverKeys.list(), [withRoom({ permissions: studyOnly })]))
        await save()
        expect(await sent()).toEqual({ name: 'Phòng ôn thi' })
        expect(await screen.findByText('You can no longer change channels in this server')).toBeInTheDocument()
    })

    it('puts a cycle the API refuses under the field it names, or above the buttons when it is hidden (`study_cycle`)', async () => {
        layoutApi.updateChannel.mockRejectedValue(
            refused(422, 'VALIDATION_ERROR', { rule: 'study_cycle', problem: 'short_break_minutes' })
        )
        await openRoom()
        await userEvent.click(screen.getByRole('radio', { name: 'Custom' }))
        await userEvent.clear(screen.getByRole('textbox', { name: 'Focus (5–120)' }))
        await userEvent.type(screen.getByRole('textbox', { name: 'Focus (5–120)' }), '45')
        await save()
        expect(await screen.findByText('Short break must be from 1 to 30 minutes')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Short break (1–30)' })).toHaveFocus()

        layoutApi.updateChannel.mockRejectedValue(
            refused(422, 'VALIDATION_ERROR', { rule: 'study_cycle', problem: 'long_break_pair' })
        )
        await userEvent.click(screen.getByRole('radio', { name: '50/10' }))
        await save()
        expect(await screen.findByText('The changes could not be saved. Try again.')).toBeInTheDocument()
    })

    it('lets someone with only the study room right change the study part alone (`study-only`)', async () => {
        // VIEW_CHANNEL, SEND_MESSAGES, CONNECT, MANAGE_STUDY_ROOMS: Bình, without MANAGE_CHANNELS.
        const bits = String((1n << 8n) | (1n << 10n) | (1n << 15n) | (1n << 20n))
        // A private room: its roles are not sent to someone who does not manage channels.
        await openRoom(withRoom({ permissions: bits, isPrivate: true, viewRoleIds: null }, { permissions: bits }))
        expect(screen.getByText('Your role can only change the study room part.')).toBeInTheDocument()
        expect(screen.getByRole('textbox', { name: 'Room name' })).toHaveAttribute('readonly')
        expect(screen.getByRole('switch', { name: 'Private channel' })).toBeDisabled()
        expect(screen.queryByText(/Roles that can see it/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete room' })).not.toBeInTheDocument()
        await expectNoA11yViolations()

        await userEvent.click(screen.getByRole('radio', { name: /Only study room managers/ }))
        await save()
        expect(await sent()).toEqual({ studyStarter: 'managers' })
    })

    it('shows the room icon of what the switch says, in the name field', async () => {
        await openRoom(withRoom({ isStudyRoom: false }))
        const field = screen.getByRole('textbox', { name: 'Room name' }).parentElement!
        expect(field.querySelector('.lucide-volume-2')).not.toBeNull()
        await userEvent.click(screen.getByRole('switch', { name: 'Study room' }))
        expect(field.querySelector('.lucide-lamp-desk')).not.toBeNull()
    })
})

describe('Categories (S-SRV-05 `category`, S-SET-05 `category-edit`)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    it('creates one, refusing a name the server has in any case', async () => {
        layoutApi.createCategory.mockResolvedValue({ id: 'new', server: OT })
        useChannelDialogs.getState().show({ kind: 'createCategory', serverId: 'ot' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Category name' })
        await userEvent.type(name, 'THÔNG TIN')
        await userEvent.click(screen.getByRole('button', { name: 'Create category' }))
        expect(screen.getByRole('alert')).toHaveTextContent('The server already has a category THÔNG TIN')
        await userEvent.clear(name)
        await userEvent.type(name, 'Ôn tập cuối kỳ')
        await userEvent.click(screen.getByRole('button', { name: 'Create category' }))
        await waitFor(() =>
            expect(layoutApi.createCategory).toHaveBeenCalledWith('ot', 'Ôn tập cuối kỳ', expect.any(String))
        )
    })

    it('tries again with the same Idempotency-Key after a lost answer, so one category is made', async () => {
        layoutApi.createCategory
            .mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
            .mockResolvedValueOnce({ id: 'new', server: OT })
        useChannelDialogs.getState().show({ kind: 'createCategory', serverId: 'ot' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Category name' }), 'Ôn tập')
        await userEvent.click(screen.getByRole('button', { name: 'Create category' }))
        await waitFor(() => expect(layoutApi.createCategory).toHaveBeenCalledTimes(1))
        await waitFor(() => expect(screen.getByRole('button', { name: 'Create category' })).toBeEnabled())
        await userEvent.click(screen.getByRole('button', { name: 'Create category' }))
        await waitFor(() => expect(layoutApi.createCategory).toHaveBeenCalledTimes(2))
        const [first, again] = layoutApi.createCategory.mock.calls
        expect(again![2]).toBe(first![2])
    })

    it('renames, and deletes one whose channels move to the top', async () => {
        layoutApi.renameCategory.mockResolvedValue(OT)
        layoutApi.deleteCategory.mockResolvedValue(OT)
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Category name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Tin tức')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(layoutApi.renameCategory).toHaveBeenCalledWith('ot', 'info', 'Tin tức'))

        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        await userEvent.click(await screen.findByRole('button', { name: 'Delete category' }))
        expect(
            await screen.findByText('Its 3 channels move to the top of the list. They are not deleted.')
        ).toBeInTheDocument()
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete category' }).at(-1)!)
        expect(await screen.findByText('Deleted the category THÔNG TIN')).toBeInTheDocument()
        expect(screen.queryByText(/was just deleted/)).toBeNull()
    })

    it('closes when someone else deletes it, saying so by name (04 SET-EDGE)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs(OT, client)
        await screen.findByRole('textbox', { name: 'Category name' })

        act(
            () =>
                void client.setQueryData<Server[]>(serverKeys.list(), [
                    { ...OT, categories: OT.categories.filter((one) => one.id !== 'info') }
                ])
        )

        expect(await screen.findByText('Category THÔNG TIN was just deleted')).toBeInTheDocument()
        expect(useChannelDialogs.getState().open).toBeNull()
    })

    it('says when the right to create one is gone, leaving only Close (03 SRV-EDGE)', async () => {
        layoutApi.createCategory.mockRejectedValue(refused(403, 'FORBIDDEN_ERROR'))
        useChannelDialogs.getState().show({ kind: 'createCategory', serverId: 'ot' })
        renderDialogs()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Category name' }), 'Ôn tập')
        await userEvent.click(screen.getByRole('button', { name: 'Create category' }))

        expect(await screen.findByText('You can no longer create categories in this server')).toBeInTheDocument()
        const dialog = screen.getByRole('dialog')
        expect(within(dialog).queryByRole('button', { name: 'Create category' })).toBeNull()
        expect(within(dialog).queryByRole('button', { name: 'Cancel' })).toBeNull()
        expect(footerClose(dialog)).toBeInTheDocument()
        await userEvent.type(screen.getByRole('textbox', { name: 'Category name' }), '{Enter}')
        expect(layoutApi.createCategory).toHaveBeenCalledTimes(1)
    })

    it('will not delete one whose channel would clash at the top, naming it', async () => {
        const clash = { ...OT, channels: [...OT.channels, channel('top', { categoryId: null, name: 'tai-lieu' })] }
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs(clash)
        await userEvent.click(await screen.findByRole('button', { name: 'Delete category' }))
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'There is already a channel #tai-lieu outside any category'
        )
        expect(screen.getAllByRole('button', { name: 'Delete category' }).at(-1)).toBeDisabled()
    })

    it('closes when what it is about is gone', async () => {
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'gone' })
        renderDialogs()
        await waitFor(() => expect(useChannelDialogs.getState().open).toBeNull())
    })
})

describe('A saved change reaches the rail and the channel list (the server list in the cache)', () => {
    const client = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const cached = (queries: QueryClient) => queries.getQueryData<Server[]>(serverKeys.list())?.[0]

    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    it('after a category is renamed', async () => {
        const renamed = {
            ...OT,
            categories: OT.categories.map((c) => (c.id === 'info' ? { ...c, name: 'Tin tức' } : c))
        }
        layoutApi.renameCategory.mockResolvedValue(renamed)
        const queries = client()
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs(OT, queries)
        const name = await screen.findByRole('textbox', { name: 'Category name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Tin tức')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(cached(queries)?.categories[0]?.name).toBe('Tin tức'))
    })

    it('after a category is deleted', async () => {
        const without = { ...OT, categories: OT.categories.filter((c) => c.id !== 'info') }
        layoutApi.deleteCategory.mockResolvedValue(without)
        const queries = client()
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs(OT, queries)
        await userEvent.click(await screen.findByRole('button', { name: 'Delete category' }))
        await userEvent.click((await screen.findAllByRole('button', { name: 'Delete category' })).at(-1)!)
        await waitFor(() => expect(cached(queries)?.categories.map((c) => c.id)).toEqual(['rooms']))
    })

    it('after a channel’s settings are saved', async () => {
        const managers = {
            ...OT,
            channels: OT.channels.map((c) => (c.id === 'hoi-dap' ? { ...c, sendMode: 'managers' as const } : c))
        }
        layoutApi.updateChannel.mockResolvedValue(managers)
        const queries = client()
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(OT, queries)
        await userEvent.click(await screen.findByRole('radio', { name: /Only message managers/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() =>
            expect(cached(queries)?.channels.find((c) => c.id === 'hoi-dap')?.sendMode).toBe('managers')
        )
    })

    it('after a channel is deleted', async () => {
        layoutApi.deleteChannel.mockResolvedValue({ ...OT, channels: OT.channels.filter((c) => c.id !== 'hoi-dap') })
        const queries = client()
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs(OT, queries)
        await userEvent.click(await screen.findByRole('button', { name: 'Delete channel' }))
        await userEvent.type(await screen.findByRole('textbox', { name: 'Type hoi-dap to confirm' }), 'hoi-dap')
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete channel' }).at(-1)!)
        await waitFor(() => expect(cached(queries)?.channels.some((c) => c.id === 'hoi-dap')).toBe(false))
    })
})

describe('A change to something deleted meanwhile reads the server list again (NOT_FOUND_ERROR)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    const renameCategory = async () => {
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Category name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Tin tức')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    }
    const deleteCategory = async () => {
        useChannelDialogs.getState().show({ kind: 'categorySettings', serverId: 'ot', categoryId: 'info' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('button', { name: 'Delete category' }))
        await userEvent.click((await screen.findAllByRole('button', { name: 'Delete category' })).at(-1)!)
    }
    const updateChannel = async () => {
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('radio', { name: /Only message managers/ }))
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    }
    const deleteChannel = async () => {
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('button', { name: 'Delete channel' }))
        await userEvent.type(await screen.findByRole('textbox', { name: 'Type hoi-dap to confirm' }), 'hoi-dap')
        await userEvent.click(screen.getAllByRole('button', { name: 'Delete channel' }).at(-1)!)
    }

    it.each([
        ['renaming a category', 'renameCategory', renameCategory],
        ['deleting a category', 'deleteCategory', deleteCategory],
        ['saving a channel', 'updateChannel', updateChannel],
        ['deleting a channel', 'deleteChannel', deleteChannel]
    ] as const)('%s', async (_, call, run) => {
        layoutApi[call].mockRejectedValue(refused(404, 'NOT_FOUND_ERROR'))
        await run()
        expect(await screen.findByText('This channel or category was just deleted')).toBeInTheDocument()
        await waitFor(() => expect(serversApi.fetchServers).toHaveBeenCalledTimes(2))
    })
})

describe('The error under a channel name', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    const create = () => screen.getByRole('button', { name: 'Create channel' })

    it('goes as they type, change the type or the category, and is checked again on the next click only', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'info', type: 'text' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.type(name, 'Tai lieu')
        await userEvent.click(create())
        expect(screen.getByRole('alert')).toHaveTextContent('THÔNG TIN already has a channel #tai-lieu')
        expect(name).toHaveFocus()

        // Back to the clashing name: no error until the next click.
        await userEvent.type(name, 'x{backspace}')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        await userEvent.click(create())
        expect(screen.getByRole('alert')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('radio', { name: /Voice room/ }))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        await userEvent.click(screen.getByRole('radio', { name: /Text channel/ }))
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        await userEvent.click(create())
        expect(screen.getByRole('alert')).toBeInTheDocument()

        fireEvent.change(document.querySelector('select')!, { target: { value: 'rooms' } })
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(layoutApi.createChannel).not.toHaveBeenCalled()
    })

    it('in the channel settings, goes as they type and puts the focus in the name', async () => {
        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'chao-mung' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.clear(name)
        await userEvent.type(name, 'Hoi dap')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        expect(screen.getByRole('alert')).toHaveTextContent('THÔNG TIN already has a channel #hoi-dap')
        expect(name).toHaveFocus()
        await userEvent.type(name, 'x{backspace}')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(layoutApi.updateChannel).not.toHaveBeenCalled()
    })

    it('sends once while it is out, Enter in the name included', async () => {
        layoutApi.createChannel.mockReturnValue(new Promise(() => {}))
        layoutApi.updateChannel.mockReturnValue(new Promise(() => {}))
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.type(name, 'moi')
        await userEvent.click(create())
        await waitFor(() => expect(name).toHaveAttribute('readonly'))
        expect(create()).toBeDisabled()
        await userEvent.type(name, '{Enter}')
        expect(layoutApi.createChannel).toHaveBeenCalledTimes(1)

        useChannelDialogs.getState().show({ kind: 'channelSettings', serverId: 'ot', channelId: 'hoi-dap' })
        const settingsName = await screen.findByRole('textbox', { name: 'Channel name' })
        await userEvent.type(settingsName, '-2')
        await userEvent.click(screen.getByRole('button', { name: 'Save' }))
        await waitFor(() => expect(settingsName).toHaveAttribute('readonly'))
        await userEvent.type(settingsName, '{Enter}')
        expect(layoutApi.updateChannel).toHaveBeenCalledTimes(1)
    })

    it('stops the name at 100 characters', async () => {
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: null, type: 'text' })
        renderDialogs()
        await userEvent.click(await screen.findByRole('textbox', { name: 'Channel name' }))
        await userEvent.paste('a'.repeat(120))
        expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('a'.repeat(100))
    })
})
