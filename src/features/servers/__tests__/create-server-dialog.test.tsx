import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useRef } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { Toaster } from 'sonner'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { apiError } from '@/test/helpers'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import { AxiosError } from 'axios'
import type { Server } from '../types'

const serversApi = { fetchServers: vi.fn(), createServer: vi.fn(), uploadServerIcon: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
// jsdom draws no images: the cropper reports its area once, the crop is a fixed Blob.
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

const { default: CreateServerDialog } = await import('../components/CreateServerDialog')
const { useCreateServerDialog } = await import('../create-server.store')

const created: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: true,
    permissions: '8388607',
    topRolePosition: 1,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: 'chao-mung',
    categories: [{ id: 'info', name: 'Thông tin', position: 0 }],
    channels: [
        {
            id: 'chao-mung',
            categoryId: 'info',
            type: 'text',
            name: 'chao-mung',
            position: 0,
            isPrivate: false,
            sendMode: 'everyone',
            isStudyRoom: false,
            taskBoardEnabled: false,
            permissions: '8388607',
            viewRoleIds: []
        }
    ]
}

function renderDialog(serverCount = 0) {
    serversApi.fetchServers.mockResolvedValue(
        Array.from({ length: serverCount }, (_, i) => ({ ...created, id: `s${i}` }))
    )
    useCreateServerDialog.getState().show()
    const router = createMemoryRouter(
        [
            { path: '/study', element: <CreateServerDialog /> },
            { path: '/channels/:serverId/:channelId', element: <h1>Channel page</h1> }
        ],
        { initialEntries: ['/study'] }
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

const nameField = () => screen.getByRole('textbox', { name: 'Server name' })
const submit = () => screen.getByRole('button', { name: 'Create server' })
const picture = (type = 'image/png', size = 1024) => new File([new Uint8Array(size)], 'icon', { type })

describe('Create a server (S-SRV-01)', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })

    afterEach(() => useCreateServerDialog.getState().hide())

    it('opens on the name, with Study Server chosen, and has no accessibility problem', async () => {
        renderDialog()
        await screen.findByRole('heading', { name: 'Create a server' })
        await waitFor(() => expect(nameField()).toHaveFocus())
        expect(screen.getByRole('radio', { name: /Study Server/ })).toHaveAttribute('aria-checked', 'true')
        await expectNoA11yViolations()
    })

    it('says what the name needs, and sends nothing, when it is too short', async () => {
        renderDialog()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Server name' }), ' Ô ')
        await userEvent.click(submit())
        expect(screen.getByRole('alert')).toHaveTextContent('A server name needs 2–100 characters')
        expect(nameField()).toHaveFocus()
        expect(serversApi.createServer).not.toHaveBeenCalled()
    })

    it('creates the chosen template with the name trimmed, then opens its first text channel', async () => {
        serversApi.createServer.mockResolvedValue(created)
        const router = renderDialog()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Server name' }), '  Ôn thi Giải tích 2 ')
        expect(screen.getByText('18/100')).toBeInTheDocument()
        // One tab stop for the template; arrows choose.
        screen.getByRole('radio', { name: /Study Server/ }).focus()
        await userEvent.keyboard('{ArrowRight}')
        expect(screen.getByRole('radio', { name: /Plain server/ })).toHaveAttribute('aria-checked', 'true')

        await userEvent.click(submit())
        await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/chao-mung'))
        expect(serversApi.createServer).toHaveBeenCalledWith(
            { name: 'Ôn thi Giải tích 2', template: 'standard' },
            expect.any(String)
        )
        expect(serversApi.uploadServerIcon).not.toHaveBeenCalled()
        expect(useCreateServerDialog.getState().open).toBe(false)
    })

    it('refuses a file that is not JPG, PNG or WEBP, or over 8 MB, before cropping', async () => {
        renderDialog()
        const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type=file]')!)
        await userEvent.upload(input, picture('image/gif'), { applyAccept: false })
        expect(screen.getByRole('alert')).toHaveTextContent('Only JPG, PNG or WEBP images.')
        await userEvent.upload(input, picture('image/png', 8 * 1024 * 1024 + 1))
        expect(screen.getByRole('alert')).toHaveTextContent('larger than 8 MB')
        expect(screen.queryByTestId('cropper')).not.toBeInTheDocument()
    })

    it('crops a picture with a square mask, and uploads it once the server exists', async () => {
        serversApi.createServer.mockResolvedValue(created)
        serversApi.uploadServerIcon.mockResolvedValue('https://cdn.test/ot.webp')
        const router = renderDialog()
        const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type=file]')!)
        await userEvent.upload(input, picture())

        const crop = await screen.findByRole('dialog', { name: 'Crop the server picture' })
        await userEvent.click(within(crop).getByRole('button', { name: 'Use image' }))
        await waitFor(() =>
            expect(screen.queryByRole('dialog', { name: 'Crop the server picture' })).not.toBeInTheDocument()
        )
        expect(screen.getByRole('button', { name: 'Change image' })).toHaveFocus()
        expect(serversApi.uploadServerIcon).not.toHaveBeenCalled()

        await userEvent.type(nameField(), 'Ôn thi')
        await userEvent.click(submit())
        await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/chao-mung'))
        expect(serversApi.uploadServerIcon).toHaveBeenCalledWith('ot', expect.any(Blob), expect.any(String))
    })

    it('still opens the new server when its picture fails, and offers to try again', async () => {
        serversApi.createServer.mockResolvedValue(created)
        serversApi.uploadServerIcon.mockRejectedValueOnce(apiError(500, 'UPLOAD_FAILED')).mockResolvedValue('url')
        const router = renderDialog()
        const input = await waitFor(() => document.querySelector<HTMLInputElement>('input[type=file]')!)
        await userEvent.upload(input, picture())
        await userEvent.click(await screen.findByRole('button', { name: 'Use image' }))
        await userEvent.type(nameField(), 'Ôn thi')
        await userEvent.click(submit())

        await waitFor(() => expect(router.state.location.pathname).toBe('/channels/ot/chao-mung'))
        expect(await screen.findByText('Ôn thi Giải tích 2 was created, but its picture was not saved.')).toBeVisible()
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
        await waitFor(() => expect(serversApi.uploadServerIcon).toHaveBeenCalledTimes(2))
        // The same upload tried again: if the first was stored, the API answers with it.
        const [first, again] = serversApi.uploadServerIcon.mock.calls
        expect(again![2]).toBe(first![2])
    })

    it('says so ahead at 100 servers: the button explains and sends nothing', async () => {
        renderDialog(100)
        expect(
            await screen.findByText(
                'You are in 100 servers, the most you can be in. Leave one to create or join another.'
            )
        ).toBeVisible()
        expect(submit()).toHaveAttribute('aria-disabled', 'true')
        await userEvent.type(nameField(), 'Ôn thi')
        await userEvent.click(submit())
        expect(serversApi.createServer).not.toHaveBeenCalled()
    })

    it('reports the limit reached meanwhile, and a lost connection, above the buttons', async () => {
        renderDialog()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Server name' }), 'Ôn thi')

        serversApi.createServer.mockRejectedValueOnce(apiError(403, 'MAX_SERVERS_REACHED'))
        await userEvent.click(submit())
        expect(await screen.findByText(/You are in 100 servers/)).toBeVisible()

        serversApi.createServer.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'))
        await userEvent.type(nameField(), ' 2')
        await userEvent.click(submit())
        expect(await screen.findByText('You need a connection to create or join a server')).toBeVisible()
    })

    it('takes the name error away as soon as they type, and checks again only on the next click', async () => {
        renderDialog()
        await userEvent.click(await screen.findByRole('button', { name: 'Create server' }))
        expect(screen.getByRole('alert')).toHaveTextContent('A server name needs 2–100 characters')
        await userEvent.type(nameField(), 'Ô')
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        await userEvent.click(submit())
        expect(screen.getByRole('alert')).toHaveTextContent('A server name needs 2–100 characters')
    })

    it('says the name error in the language chosen while it is shown', async () => {
        renderDialog()
        await userEvent.click(await screen.findByRole('button', { name: 'Create server' }))
        expect(screen.getByRole('alert')).toHaveTextContent('A server name needs 2–100 characters')
        await act(() => i18n.changeLanguage('vi'))
        expect(screen.getByRole('alert')).toHaveTextContent('Tên server cần 2–100 ký tự')
    })

    it('stops the name at 100 characters, a paste over it too', async () => {
        renderDialog()
        await userEvent.click(await screen.findByRole('textbox', { name: 'Server name' }))
        await userEvent.paste('ô'.repeat(120))
        expect(nameField()).toHaveValue('ô'.repeat(100))
        expect(screen.getByText('100/100')).toBeVisible()
    })

    it('puts a name the API refuses under the field, with the focus back in it', async () => {
        renderDialog()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Server name' }), 'Ôn thi')
        serversApi.createServer.mockRejectedValueOnce(apiError(400, 'VALIDATION_ERROR'))
        await userEvent.click(submit())
        expect(await screen.findByRole('alert')).toHaveTextContent('A server name needs 2–100 characters')
        expect(nameField()).toHaveFocus()
    })

    it('sends once while the server is being created, Enter in the name included', async () => {
        serversApi.createServer.mockReturnValue(new Promise(() => {}))
        renderDialog()
        await userEvent.type(await screen.findByRole('textbox', { name: 'Server name' }), 'Ôn thi')
        await userEvent.click(submit())
        await waitFor(() => expect(nameField()).toHaveAttribute('readonly'))
        expect(submit()).toBeDisabled()
        await userEvent.type(nameField(), '{Enter}')
        expect(serversApi.createServer).toHaveBeenCalledTimes(1)
    })

    it('at 100 servers, an empty name gets no error either: there is nothing to fix', async () => {
        renderDialog(100)
        await screen.findByText(/You are in 100 servers/)
        await userEvent.click(submit())
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        expect(serversApi.createServer).not.toHaveBeenCalled()
    })
})
