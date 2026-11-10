import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import type { Server, ServerChannel } from '../types'

const serversApi = { fetchServers: vi.fn(), createServer: vi.fn(), uploadServerIcon: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const layoutApi = { moveInLayout: vi.fn() }
vi.mock('@/features/servers/api/layout.api', () => layoutApi)

const { ServerChannelColumn } = await import('../components/channel-list/ServerChannelColumn')
const { useChannelDialogs } = await import('../channel-dialogs.store')

const MEMBER = String((1n << 8n) | (1n << 10n) | (1n << 15n))
/** And MANAGE_CHANNELS. */
const MANAGER = String(BigInt(MEMBER) | (1n << 3n))

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
    permissions: MANAGER,
    viewRoleIds: [],
    ...extra
})

const server = (permissions: string, channels?: ServerChannel[]): Server => ({
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    permissions,
    topRolePosition: 1,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: 'chao-mung',
    categories: [
        { id: 'info', name: 'Thông tin', position: 0 },
        { id: 'rooms', name: 'Phòng học', position: 1 }
    ],
    channels: (
        channels ?? [
            channel('chao-mung'),
            channel('tai-lieu', { position: 1 }),
            channel('hoi-dap', { position: 2 }),
            channel('phong', { categoryId: 'rooms', type: 'voice', name: 'Phòng học im lặng' })
        ]
    ).map((c) => ({ ...c, permissions: permissions === MANAGER ? c.permissions : MEMBER }))
})

function renderColumn(data: Server) {
    serversApi.fetchServers.mockResolvedValue([data])
    const router = createMemoryRouter(
        [
            {
                path: '/channels/:serverId/:channelId',
                element: <ServerChannelColumn serverId='ot' />
            }
        ],
        { initialEntries: ['/channels/ot/chao-mung'] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
}

const names = (categoryId: string) =>
    within(document.getElementById(`category-ot-${categoryId}`)!)
        .getAllByRole('link')
        .map((link) => link.textContent)

const refused = (rule: string) =>
    new AxiosError('422', '422', undefined, undefined, {
        status: 422,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { meta: { type: 'VALIDATION_ERROR', code: '422000' }, data: { rule } }
    })

describe('The channel list for whoever manages channels (S-SRV-04, S-SRV-06)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
        localStorage.clear()
    })
    afterEach(() => useChannelDialogs.getState().hide())

    it('opens the server menu from its name, with the rows they may use', async () => {
        renderColumn(server(MANAGER))
        const trigger = await screen.findByRole('button', { name: 'Ôn thi Giải tích 2' })
        await userEvent.click(trigger)
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Create channel', 'Create category'])
        await userEvent.click(within(menu).getByRole('menuitem', { name: 'Create category' }))
        expect(useChannelDialogs.getState().open).toEqual({ kind: 'createCategory', serverId: 'ot' })

        await userEvent.click(trigger)
        await userEvent.click(await screen.findByRole('menuitem', { name: 'Create channel' }))
        expect(useChannelDialogs.getState().open).toEqual({
            kind: 'createChannel',
            serverId: 'ot',
            categoryId: null,
            type: 'text'
        })
    })

    it('opens settings and creating from the buttons on a row and a heading; a category of rooms offers a room', async () => {
        renderColumn(server(MANAGER))
        await userEvent.click((await screen.findAllByRole('button', { name: 'Channel settings' }))[0]!)
        expect(useChannelDialogs.getState().open).toMatchObject({ kind: 'channelSettings', channelId: 'chao-mung' })
        await userEvent.click(screen.getByRole('button', { name: 'Create a channel in Phòng học' }))
        expect(useChannelDialogs.getState().open).toEqual({
            kind: 'createChannel',
            serverId: 'ot',
            categoryId: 'rooms',
            type: 'voice'
        })
        await userEvent.click(screen.getByRole('button', { name: 'Settings of the category Thông tin' }))
        expect(useChannelDialogs.getState().open).toMatchObject({ kind: 'categorySettings', categoryId: 'info' })
        await expectNoA11yViolations()
    })

    it('folds a category, still showing the open channel, and remembers it in this browser', async () => {
        renderColumn(server(MANAGER))
        const heading = await screen.findByRole('button', { name: 'Thông tin' })
        await userEvent.click(heading)
        expect(heading).toHaveAttribute('aria-expanded', 'false')
        expect(names('info')).toEqual(['chao-mung'])
        expect(JSON.parse(localStorage.getItem('nezfocus:folded-categories:ot')!)).toEqual(['info'])
        await userEvent.click(heading)
        expect(names('info')).toEqual(['chao-mung', 'tai-lieu', 'hoi-dap'])
    })

    it('opens a server with the categories folded in this browser before', async () => {
        localStorage.setItem('nezfocus:folded-categories:ot', JSON.stringify(['info']))
        renderColumn(server(MANAGER))
        expect(await screen.findByRole('button', { name: 'Thông tin' })).toHaveAttribute('aria-expanded', 'false')
        expect(names('info')).toEqual(['chao-mung'])
    })

    it('still folds a category when the browser refuses storage', async () => {
        const denied = () => {
            throw new DOMException('Storage is blocked', 'SecurityError')
        }
        const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
        const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
        try {
            renderColumn(server(MANAGER))
            const heading = await screen.findByRole('button', { name: 'Thông tin' })
            await userEvent.click(heading)
            expect(heading).toHaveAttribute('aria-expanded', 'false')
            expect(names('info')).toEqual(['chao-mung'])
        } finally {
            getItem.mockRestore()
            setItem.mockRestore()
        }
    })

    it('moves a channel from the keyboard: Space lifts, arrows move, Space drops; the list changes at once', async () => {
        let resolve!: (value: Server) => void
        layoutApi.moveInLayout.mockReturnValue(new Promise<Server>((r) => (resolve = r)))
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'hoi-dap' })
        row.focus()
        await userEvent.keyboard(' ')
        expect(screen.getByText(/Picked up #hoi-dap/)).toBeInTheDocument()
        await userEvent.keyboard('{ArrowUp}')
        expect(screen.getByText('#hoi-dap: in THÔNG TIN, position 2')).toBeInTheDocument()
        await userEvent.keyboard(' ')

        expect(layoutApi.moveInLayout).toHaveBeenCalledWith('ot', {
            kind: 'channel',
            id: 'hoi-dap',
            categoryId: 'info',
            afterId: 'chao-mung'
        })
        expect(names('info')).toEqual(['chao-mung', 'hoi-dap', 'tai-lieu'])
        resolve(server(MANAGER))
        await waitFor(() => expect(names('info')).toEqual(['chao-mung', 'tai-lieu', 'hoi-dap']))
    })

    it('puts a refused move back and offers to try again', async () => {
        layoutApi.moveInLayout.mockRejectedValue(refused('stale_move'))
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'tai-lieu' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown} ')
        expect(await screen.findByText('The channel order could not be saved')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
        expect(names('info')).toEqual(['chao-mung', 'tai-lieu', 'hoi-dap'])
        // The list changed under them: read again.
        await waitFor(() => expect(serversApi.fetchServers).toHaveBeenCalledTimes(2))
    })

    it('reads the list again when the moved channel was deleted meanwhile', async () => {
        layoutApi.moveInLayout.mockRejectedValue(
            new AxiosError('404', '404', undefined, undefined, {
                status: 404,
                statusText: '',
                headers: {},
                config: { headers: new AxiosHeaders() },
                data: { meta: { type: 'NOT_FOUND_ERROR', code: '404000' }, data: {} }
            })
        )
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'tai-lieu' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown} ')
        expect(await screen.findByText('The channel order could not be saved')).toBeInTheDocument()
        await waitFor(() => expect(serversApi.fetchServers).toHaveBeenCalledTimes(2))
    })

    it('puts the list back when the move cannot reach the server, without reading it again', async () => {
        layoutApi.moveInLayout.mockRejectedValue(new AxiosError('offline', 'ERR_NETWORK'))
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'chao-mung' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown}{ArrowDown} ')
        expect(await screen.findByText('The channel order could not be saved')).toBeInTheDocument()
        expect(names('info')).toEqual(['chao-mung', 'tai-lieu', 'hoi-dap'])
        expect(serversApi.fetchServers).toHaveBeenCalledTimes(1)
    })

    it('tries a refused move again on its own server, after another server was opened', async () => {
        layoutApi.moveInLayout
            .mockRejectedValueOnce(new AxiosError('offline', 'ERR_NETWORK'))
            .mockResolvedValue(server(MANAGER))
        serversApi.fetchServers.mockResolvedValue([server(MANAGER), { ...server(MANAGER), id: 'hk', name: 'Học kỳ 1' }])
        function Column() {
            return <ServerChannelColumn serverId={useParams().serverId} />
        }
        const router = createMemoryRouter([{ path: '/channels/:serverId/:channelId', element: <Column /> }], {
            initialEntries: ['/channels/ot/chao-mung']
        })
        render(
            <TooltipProvider>
                <RouterProvider router={router} />
                <Toaster />
            </TooltipProvider>,
            { wrapper: queryWrapper() }
        )
        const row = await screen.findByRole('link', { name: 'chao-mung' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown} ')
        const again = await screen.findByRole('button', { name: 'Try again' })

        await act(() => router.navigate('/channels/hk/chao-mung'))
        expect(await screen.findByRole('navigation', { name: /Học kỳ 1/ })).toBeInTheDocument()
        await userEvent.click(again)

        await waitFor(() => expect(layoutApi.moveInLayout).toHaveBeenCalledTimes(2))
        const [first, second] = layoutApi.moveInLayout.mock.calls
        expect(second).toEqual(first)
        expect(second?.[0]).toBe('ot')
    })

    it('refuses a drop into a category that has the name, without asking the API (D-84)', async () => {
        const clash = server(MANAGER, [
            channel('chao-mung'),
            channel('hoi-dap', { position: 1 }),
            channel('copy', { categoryId: 'rooms', name: 'Hoi-dap' })
        ])
        renderColumn(clash)
        const row = await screen.findByRole('link', { name: 'hoi-dap' })
        row.focus()
        // Down past the end of THÔNG TIN: first, then after copy, in PHÒNG HỌC.
        await userEvent.keyboard(' {ArrowDown}{ArrowDown} ')
        expect(await screen.findByText('PHÒNG HỌC already has a channel #Hoi-dap')).toBeInTheDocument()
        expect(layoutApi.moveInLayout).not.toHaveBeenCalled()
    })

    it('cancels with Esc, and moves a category from its heading', async () => {
        layoutApi.moveInLayout.mockResolvedValue(server(MANAGER))
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'tai-lieu' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown}{Escape}')
        expect(screen.getByText('Cancelled, #tai-lieu is back where it was')).toBeInTheDocument()
        expect(layoutApi.moveInLayout).not.toHaveBeenCalled()

        screen.getByRole('button', { name: 'Phòng học' }).focus()
        await userEvent.keyboard(' {ArrowUp} ')
        expect(layoutApi.moveInLayout).toHaveBeenCalledWith('ot', { kind: 'category', id: 'rooms', afterId: null })
        // Enter still folds.
        await userEvent.keyboard('{Enter}')
        expect(screen.getByRole('button', { name: 'Phòng học' })).toHaveAttribute('aria-expanded', 'false')
    })
})

describe('The channel list for a member', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })

    it('has a plain title, no buttons on rows, and Space does not lift anything', async () => {
        renderColumn(server(MEMBER))
        expect(await screen.findByRole('heading', { name: 'Ôn thi Giải tích 2' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Ôn thi Giải tích 2' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Channel settings' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Create a channel in/ })).not.toBeInTheDocument()
        screen.getByRole('link', { name: 'hoi-dap' }).focus()
        await userEvent.keyboard(' ')
        expect(screen.queryByText(/Picked up/)).not.toBeInTheDocument()
    })
})
