import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import type { Server, ServerChannel } from '../types'

const serversApi = {
    fetchServers: vi.fn(),
    createServer: vi.fn(),
    uploadServerIcon: vi.fn(),
    updateServer: vi.fn(),
    removeServerIcon: vi.fn()
}
vi.mock('@/features/servers/api/servers.api', () => serversApi)
// The cropper reports its area at once (no layout in jsdom).
vi.mock('react-easy-crop', () => ({
    default: function MockCropper({ onCropComplete }: { onCropComplete: (area: object, pixels: object) => void }) {
        const loaded = useRef(false)
        useEffect(() => {
            if (loaded.current) return
            loaded.current = true
            onCropComplete({}, { x: 0, y: 0, width: 280, height: 280 })
        }, [onCropComplete])
        return <div data-testid='cropper' />
    }
}))
vi.mock('@/lib/crop-image', () => ({ default: () => Promise.resolve(new Blob(['jpeg'])) }))

const { default: ServerSettingsPage } = await import('../pages/ServerSettingsPage')
const { settingsSections, welcomeChoices } = await import('../lib/settings-sections')

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
/** VIEW_CHANNEL, SEND_MESSAGES, CONNECT. */
const MEMBER = bits(8, 10, 15)
/** And MANAGE_SERVER. */
const MANAGER = bits(1, 8, 10, 15)

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
    permissions: MEMBER,
    viewRoleIds: null,
    ...extra
})

const server = (permissions: string, extra: Partial<Server> = {}): Server => ({
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions,
    topRolePosition: 1,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: 'chao-mung',
    categories: [
        { id: 'rooms', name: 'Phòng học', position: 1 },
        { id: 'info', name: 'Thông tin', position: 0 }
    ],
    channels: [
        channel('chung', { categoryId: null }),
        channel('hoi-dap', { position: 1 }),
        channel('chao-mung', { position: 0 }),
        channel('bi-mat', { position: 2, isPrivate: true }),
        channel('phong', { categoryId: 'rooms', type: 'voice', name: 'Phòng học im lặng' })
    ],
    ...extra
})

function Where() {
    const location = useLocation()
    return <p data-testid='where'>{location.pathname}</p>
}

function renderSettings(data: Server, path = '/servers/ot/settings') {
    serversApi.fetchServers.mockResolvedValue([data])
    const router = createMemoryRouter(
        [
            {
                element: (
                    <>
                        <Where />
                        <Outlet />
                    </>
                ),
                children: [
                    { path: '/servers/:serverId/settings/:section?', element: <ServerSettingsPage /> },
                    { path: '/channels/:serverId', element: <p>channel page</p> },
                    { path: '/study', element: <p>study page</p> }
                ]
            }
        ],
        { initialEntries: [path] }
    )
    render(
        <TooltipProvider>
            <RouterProvider router={router} />
            <Toaster />
        </TooltipProvider>,
        { wrapper: queryWrapper() }
    )
    return router
}

const refused = (status: number, data: object = {}) =>
    new AxiosError(String(status), String(status), undefined, undefined, {
        status,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { meta: { type: 'VALIDATION_ERROR', code: '422000' }, data }
    })

describe('Who sees which settings page (04 S-SET-01 Q2)', () => {
    it('lists the pages built so far that their bits open', () => {
        // Overview and Invites both need MANAGE_SERVER (04 Q2).
        expect(settingsSections({ permissions: MANAGER })).toEqual(['overview', 'invites'])
        expect(settingsSections({ permissions: MEMBER })).toEqual([])
        // Roles needs MANAGE_ROLES, which also opens Members (L7, L8); in SettingsNav order.
        expect(settingsSections({ permissions: bits(2) })).toEqual(['roles', 'members'])
        expect(settingsSections({ permissions: bits(1, 2) })).toEqual(['overview', 'roles', 'members', 'invites'])
        // Members opens with any one moderation bit; Bans only with BAN_MEMBERS (L8).
        expect(settingsSections({ permissions: bits(4) })).toEqual(['members'])
        expect(settingsSections({ permissions: bits(6) })).toEqual(['members'])
        expect(settingsSections({ permissions: bits(5) })).toEqual(['members', 'bans'])
        expect(settingsSections({ permissions: 'garbage' })).toEqual([])
    })

    it('offers Send none, then the text channels in list order, then a chosen channel they cannot see', () => {
        const ids = (s: Server) => welcomeChoices(s).map((c) => (c.kind === 'none' ? 'none' : `${c.kind}:${c.id}`))
        expect(ids(server(MANAGER))).toEqual([
            'none',
            'channel:chung',
            'channel:chao-mung',
            'channel:hoi-dap',
            'channel:bi-mat'
        ])
        expect(ids(server(MANAGER, { welcomeChannelId: 'secret' })).at(-1)).toBe('hidden:secret')
        const [, chung, chaoMung] = welcomeChoices(server(MANAGER))
        expect(chung).toMatchObject({ categoryName: null })
        expect(chaoMung).toMatchObject({ categoryName: 'Thông tin', isPrivate: false })
    })
})

describe('Server settings › Overview (S-SET-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })

    it('opens the first page they may, and shows the picture, the name and the welcome channel', async () => {
        renderSettings(server(MANAGER))
        expect(await screen.findByRole('heading', { name: 'Overview' })).toBeInTheDocument()
        expect(screen.getByTestId('where')).toHaveTextContent('/servers/ot/settings/overview')
        expect(screen.getByRole('button', { name: 'Upload picture' })).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Remove picture' })).not.toBeInTheDocument()
        expect(screen.getByLabelText('Server name')).toHaveValue('Ôn thi Giải tích 2')
        expect(screen.getByRole('combobox', { name: 'Welcome channel' })).toHaveTextContent('# chao-mung')
        expect(screen.getByText('"X joined the server" is posted in this channel.')).toBeInTheDocument()
        await expectNoA11yViolations(document.body)
    })

    it('ends with the owner group for the owner only, whose buttons open their dialogs (Q15)', async () => {
        const { useMembershipDialogs } = await import('../membership-dialogs.store')
        renderSettings(server(MANAGER, { isOwner: true }), '/servers/ot/settings/overview')
        expect(await screen.findByText('Owner')).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Transfer ownership' }))
        expect(useMembershipDialogs.getState().open).toEqual({ kind: 'transfer', serverId: 'ot' })
        await userEvent.click(screen.getByRole('button', { name: 'Delete server' }))
        expect(useMembershipDialogs.getState().open).toEqual({ kind: 'delete', serverId: 'ot' })
        useMembershipDialogs.getState().hide()
        await expectNoA11yViolations(document.body)
    })

    it('has no owner group for a manager who does not own it', async () => {
        renderSettings(server(MANAGER), '/servers/ot/settings/overview')
        expect(await screen.findByLabelText('Server name')).toBeInTheDocument()
        expect(screen.queryByText('Owner')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete server' })).not.toBeInTheDocument()
    })

    it('sends someone without the page back to the server, saying why', async () => {
        renderSettings(server(MEMBER), '/servers/ot/settings/overview')
        expect(await screen.findByText('channel page')).toBeInTheDocument()
        expect(await screen.findByText('You no longer have access to server settings')).toBeInTheDocument()
    })

    it('moves a page they may not open to one they may, and a server they are not in to Study', async () => {
        const router = renderSettings(server(MANAGER), '/servers/ot/settings/roles')
        expect(await screen.findByText('You no longer have access to this page')).toBeInTheDocument()
        await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/servers/ot/settings/overview'))
        await router.navigate('/servers/other/settings')
        expect(await screen.findByText('study page')).toBeInTheDocument()
    })

    it('saves a new name from the save bar, as stored, and says so', async () => {
        serversApi.updateServer.mockResolvedValue(server(MANAGER, { name: 'Ôn thi K22' }))
        renderSettings(server(MANAGER))
        const field = await screen.findByLabelText('Server name')
        expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument()

        await userEvent.clear(field)
        await userEvent.type(field, '  Ôn thi K22 {Enter}')
        await waitFor(() => expect(serversApi.updateServer).toHaveBeenCalledWith('ot', { name: 'Ôn thi K22' }))
        expect(await screen.findByText('Changes saved')).toBeInTheDocument()
        expect(field).toHaveValue('Ôn thi K22')
        expect(screen.queryByText('You have unsaved changes')).not.toBeInTheDocument()
    })

    it('refuses a name under 2 characters without a request, and Esc puts the saved one back', async () => {
        renderSettings(server(MANAGER))
        const field = await screen.findByLabelText('Server name')
        await userEvent.clear(field)
        await userEvent.type(field, 'Ô')
        await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
        expect(await screen.findByText('A server name needs 2–100 characters')).toBeInTheDocument()
        expect(field).toHaveFocus()
        expect(serversApi.updateServer).not.toHaveBeenCalled()

        await userEvent.keyboard('{Escape}')
        expect(field).toHaveValue('Ôn thi Giải tích 2')
        expect(screen.queryByText('A server name needs 2–100 characters')).not.toBeInTheDocument()
    })

    it('shows the API refusing the name under the field, and any other failure as a toast', async () => {
        serversApi.updateServer.mockRejectedValueOnce(refused(422, { rule: 'name_invalid' }))
        renderSettings(server(MANAGER))
        const field = await screen.findByLabelText('Server name')
        await userEvent.type(field, ' 2{Enter}')
        expect(await screen.findByText('A server name needs 2–100 characters')).toBeInTheDocument()

        serversApi.updateServer.mockRejectedValueOnce(new Error('network'))
        await userEvent.type(field, '3{Enter}')
        expect(await screen.findByText('Could not save the change')).toBeInTheDocument()
        expect(field).toHaveValue('Ôn thi Giải tích 2 23')
    })

    it('asks before leaving with an unsaved name', async () => {
        const router = renderSettings(server(MANAGER))
        await userEvent.type(await screen.findByLabelText('Server name'), ' K22')
        void router.navigate('/study')
        const dialog = await screen.findByRole('dialog', { name: 'Discard changes?' })
        await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }))
        expect(screen.getByTestId('where')).toHaveTextContent('/servers/ot/settings/overview')

        void router.navigate('/study')
        const again = await screen.findByRole('dialog', { name: 'Discard changes?' })
        await userEvent.click(within(again).getByRole('button', { name: 'Discard changes' }))
        expect(await screen.findByText('study page')).toBeInTheDocument()
    })

    it('saves a welcome channel at once, and puts the old one back when refused, offering to try again', async () => {
        let answer!: (saved: Server) => void
        serversApi.updateServer.mockReturnValueOnce(new Promise<Server>((resolve) => (answer = resolve)))
        renderSettings(server(MANAGER))
        const select = await screen.findByRole('combobox', { name: 'Welcome channel' })

        await userEvent.click(select)
        await userEvent.click(await screen.findByRole('option', { name: /hoi-dap/ }))
        expect(serversApi.updateServer).toHaveBeenCalledWith('ot', { welcomeChannelId: 'hoi-dap' })
        // Shown before the answer comes.
        await waitFor(() => expect(select).toHaveTextContent('# hoi-dap'))
        answer(server(MANAGER, { welcomeChannelId: 'hoi-dap' }))

        serversApi.updateServer.mockRejectedValueOnce(new Error('network'))
        await userEvent.click(select)
        await userEvent.click(await screen.findByRole('option', { name: /Send none/ }))
        expect(await screen.findByText('Could not save the change')).toBeInTheDocument()
        await waitFor(() => expect(select).toHaveTextContent('# hoi-dap'))

        serversApi.updateServer.mockResolvedValueOnce(server(MANAGER, { welcomeChannelId: null }))
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(serversApi.updateServer).toHaveBeenLastCalledWith('ot', { welcomeChannelId: null })
        await waitFor(() => expect(select).toHaveTextContent('Send none'))
        expect(screen.getByText('Nothing is posted when someone joins the server.')).toBeInTheDocument()
    })

    it('says who sees the greeting in a private channel, or one they cannot see', async () => {
        renderSettings(server(MANAGER, { welcomeChannelId: 'bi-mat' }))
        expect(
            await screen.findByText('#bi-mat is private: only those who see it see the greeting.')
        ).toBeInTheDocument()
    })

    it('never says Send none for a private welcome channel they cannot see', async () => {
        renderSettings(server(MANAGER, { welcomeChannelId: 'secret' }))
        const select = await screen.findByRole('combobox', { name: 'Welcome channel' })
        expect(select).toHaveTextContent('A private channel you cannot see')
        expect(screen.getByText('Only those who see that channel see the greeting.')).toBeInTheDocument()
    })

    it('removes the picture at once, back to the initials', async () => {
        serversApi.removeServerIcon.mockResolvedValue(undefined)
        renderSettings(server(MANAGER, { iconUrl: 'https://cdn.test/ot.webp' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Remove picture' }))
        expect(serversApi.removeServerIcon).toHaveBeenCalledWith('ot')
        expect(await screen.findByRole('button', { name: 'Upload picture' })).toBeInTheDocument()
    })

    it('keeps the picture when removing it is refused, with Try again (04 › Toast)', async () => {
        serversApi.removeServerIcon.mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined)
        renderSettings(server(MANAGER, { iconUrl: 'https://cdn.test/ot.webp' }))
        await userEvent.click(await screen.findByRole('button', { name: 'Remove picture' }))
        expect(await screen.findByText('Could not save the change')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove picture' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        expect(await screen.findByRole('button', { name: 'Upload picture' })).toBeInTheDocument()
        expect(serversApi.removeServerIcon).toHaveBeenCalledTimes(2)
    })

    it('uploads a cropped picture from the crop dialog, which closes once it is stored', async () => {
        serversApi.uploadServerIcon.mockResolvedValue('https://cdn.test/ot.webp')
        renderSettings(server(MANAGER))
        await screen.findByRole('heading', { name: 'Overview' })
        await userEvent.upload(screen.getByTestId('server-icon-file'), new File(['x'], 'ot.png', { type: 'image/png' }))

        const crop = await screen.findByRole('dialog', { name: 'Crop the server picture' })
        await userEvent.click(within(crop).getByRole('button', { name: 'Use image' }))
        await waitFor(() =>
            expect(serversApi.uploadServerIcon).toHaveBeenCalledWith('ot', expect.any(Blob), expect.any(String))
        )
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Crop the server picture' })).not.toBeInTheDocument()
        )
        expect(screen.getByRole('button', { name: 'Change picture' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Remove picture' })).toBeInTheDocument()
    })

    it('refuses a file that is not a picture before cropping', async () => {
        renderSettings(server(MANAGER))
        await screen.findByRole('heading', { name: 'Overview' })
        const input = screen.getByTestId('server-icon-file')
        await userEvent.upload(input, new File(['x'], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
        expect(await screen.findByRole('alert')).toHaveTextContent('Only JPG, PNG or WEBP images.')
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
})
