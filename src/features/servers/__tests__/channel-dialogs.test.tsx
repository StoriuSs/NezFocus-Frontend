import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    taskBoardEnabled: false,
    permissions: CHI_BITS,
    viewRoleIds: [],
    ...extra
})

/** ÔT as Chi sees it: she holds Trưởng nhóm and Điều phối, and manages channels. */
const OT: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
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

    it('makes a study room, keeping what was typed when the type changes', async () => {
        layoutApi.createChannel.mockResolvedValue({ id: 'room', server: OT })
        useChannelDialogs.getState().show({ kind: 'createChannel', serverId: 'ot', categoryId: 'rooms', type: 'voice' })
        renderDialogs()
        const name = await screen.findByRole('textbox', { name: 'Room name' })
        await userEvent.type(name, 'Phòng ôn chương 3')
        await userEvent.click(screen.getByRole('radio', { name: /Text channel/ }))
        expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Phòng ôn chương 3')
        await userEvent.click(screen.getByRole('radio', { name: /Voice room/ }))
        await userEvent.click(screen.getByRole('switch', { name: 'Make it a study room' }))
        await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
        await waitFor(() => expect(layoutApi.createChannel).toHaveBeenCalled())
        expect(layoutApi.createChannel.mock.calls[0]![1]).toMatchObject({
            type: 'voice',
            name: 'Phòng ôn chương 3',
            categoryId: 'rooms',
            isStudyRoom: true
        })
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
        expect(await screen.findByText('You can no longer change channels in this server')).toBeInTheDocument()
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
