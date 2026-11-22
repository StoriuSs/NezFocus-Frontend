import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useParams } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AxiosError, AxiosHeaders } from 'axios'
import i18n from '@/i18n'
import { forgetPlaces } from '@/lib/gone-places'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { expectNoA11yViolations } from '@/test/a11y'
import { queryWrapper } from '@/test/helpers'
import { serverKeys } from '../api/keys'
import type { RoomPerson, Server, ServerChannel } from '../types'
import { session as studySession } from '@/test/study-sessions'
import { noteServerTime } from '@/lib/server-clock'

const serversApi = { fetchServers: vi.fn(), createServer: vi.fn(), uploadServerIcon: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const layoutApi = { moveInLayout: vi.fn() }
vi.mock('@/features/servers/api/layout.api', () => layoutApi)
vi.mock('@/features/users/api/useProfile', () => ({ useProfile: () => ({ data: { id: 'an' } }) }))
const voiceApi = vi.hoisted(() => ({
    muteParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined),
    unmuteParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined),
    disconnectParticipant: vi.fn(async (_channelId: string, _userId: string) => undefined)
}))
vi.mock('@/features/voice/api/voice.api', () => voiceApi)

const { ServerChannelColumn } = await import('../components/channel-list/ServerChannelColumn')
const { useChannelDialogs } = await import('../channel-dialogs.store')
const { useVoiceStore } = await import('@/features/voice')
const { roomSessionOf } = await import('@/features/study')

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
    studyStarter: 'anyone',
    studyFocusMinutes: 25,
    studyShortBreakMinutes: 5,
    studyLongBreakMinutes: null,
    studyLongBreakEvery: null,
    taskBoardEnabled: false,
    permissions: MANAGER,
    viewRoleIds: [],
    voiceStates: null,
    focusSession: null,
    ...extra
})

const server = (permissions: string, channels?: ServerChannel[]): Server => ({
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

function renderColumn(data: Server, client?: QueryClient, at = '/channels/ot/chao-mung') {
    serversApi.fetchServers.mockResolvedValue([data])
    const router = createMemoryRouter(
        [
            {
                path: '/channels/:serverId/:channelId',
                element: <ServerChannelColumn serverId='ot' />
            },
            {
                path: '/channels/:serverId/:channelId/:messageId',
                element: <ServerChannelColumn serverId='ot' />
            }
        ],
        { initialEntries: [at] }
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
        ).toEqual(['Create channel', 'Create category', 'Leave server'])
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

    it('says nothing of a move refused once the server was let go of (11 S-MOD-02 E9)', async () => {
        layoutApi.moveInLayout.mockImplementation(async () => {
            // Removed from ÔT while the move is on its way.
            forgetPlaces(['ot'])
            throw new AxiosError('404', '404', { url: '/servers/ot/layout', headers: new AxiosHeaders() }, null, {
                status: 404,
                statusText: '',
                headers: {},
                config: { headers: new AxiosHeaders() },
                data: { meta: { type: 'NOT_FOUND_ERROR', code: '404000' }, data: {} }
            })
        })
        renderColumn(server(MANAGER))
        const row = await screen.findByRole('link', { name: 'tai-lieu' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown} ')

        await waitFor(() => expect(layoutApi.moveInLayout).toHaveBeenCalled())
        await waitFor(() => expect(names('info')).toEqual(['chao-mung', 'tai-lieu', 'hoi-dap']))
        expect(screen.queryByText('The channel order could not be saved')).toBeNull()
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

    it('lets go of a channel being moved when it leaves the list, saying so (S-SRV-06 › Luật bằng chữ)', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderColumn(server(MANAGER), client)
        const row = await screen.findByRole('link', { name: 'hoi-dap' })
        row.focus()
        await userEvent.keyboard(' ')
        expect(screen.getByText(/Picked up #hoi-dap/)).toBeInTheDocument()

        const now = server(MANAGER)
        act(
            () =>
                void client.setQueryData<Server[]>(serverKeys.list(), [
                    { ...now, channels: now.channels.filter((one) => one.id !== 'hoi-dap') }
                ])
        )

        expect(await screen.findByText('This channel is no longer available')).toBeInTheDocument()
        expect(screen.queryByRole('link', { name: 'hoi-dap' })).toBeNull()
        // A screen reader hears it too, and the focus stays in the list rather than falling to the page.
        expect(screen.getByText('#hoi-dap is no longer there, nothing was moved')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'chao-mung' })).toHaveFocus()
        // Nothing is lifted any more: another row can be picked up.
        screen.getByRole('link', { name: 'tai-lieu' }).focus()
        await userEvent.keyboard(' ')
        expect(screen.getByText(/Picked up #tai-lieu/)).toBeInTheDocument()
        await userEvent.keyboard('{Escape}')
        expect(layoutApi.moveInLayout).not.toHaveBeenCalled()
    })

    it('drops nothing into a category deleted while a channel is held over it', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderColumn(server(MANAGER), client)
        const row = await screen.findByRole('link', { name: 'hoi-dap' })
        row.focus()
        await userEvent.keyboard(' {ArrowDown}')
        expect(screen.getByText(/#hoi-dap: in PHÒNG HỌC/)).toBeInTheDocument()

        const now = server(MANAGER)
        act(
            () =>
                void client.setQueryData<Server[]>(serverKeys.list(), [
                    {
                        ...now,
                        categories: now.categories.filter((one) => one.id !== 'rooms'),
                        channels: now.channels.map((one) =>
                            one.categoryId === 'rooms' ? { ...one, categoryId: null } : one
                        )
                    }
                ])
        )
        await userEvent.keyboard(' ')

        expect(layoutApi.moveInLayout).not.toHaveBeenCalled()
        expect(screen.getByText('Cancelled, #hoi-dap is back where it was')).toBeInTheDocument()
    })

    it('lets go of a category being moved when it is deleted, quietly', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        renderColumn(server(MANAGER), client)
        ;(await screen.findByRole('button', { name: 'Phòng học' })).focus()
        await userEvent.keyboard(' ')

        const now = server(MANAGER)
        act(
            () =>
                void client.setQueryData<Server[]>(serverKeys.list(), [
                    {
                        ...now,
                        categories: now.categories.filter((one) => one.id !== 'rooms'),
                        channels: now.channels.map((one) =>
                            one.categoryId === 'rooms' ? { ...one, categoryId: null } : one
                        )
                    }
                ])
        )

        await waitFor(() => expect(screen.queryByRole('button', { name: 'Phòng học' })).toBeNull())
        expect(screen.queryByText('This channel is no longer available')).toBeNull()
        expect(screen.getByText('PHÒNG HỌC is no longer there, nothing was moved')).toBeInTheDocument()
        // Nothing is lifted any more: another row can be picked up.
        screen.getByRole('link', { name: 'tai-lieu' }).focus()
        await userEvent.keyboard(' ')
        expect(screen.getByText(/Picked up #tai-lieu/)).toBeInTheDocument()
        await userEvent.keyboard('{Escape}')
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

    it('fades a lifted category with its channels, the whole group, as S-SRV-06 drag-category draws it', async () => {
        renderColumn(server(MANAGER))
        ;(await screen.findByRole('button', { name: 'Phòng học' })).focus()
        await userEvent.keyboard(' ')
        const rows = within(document.getElementById('category-ot-rooms')!).getAllByRole('link')
        for (const row of rows) expect(row).toHaveClass('opacity-40')
        for (const row of within(document.getElementById('category-ot-info')!).getAllByRole('link'))
            expect(row).not.toHaveClass('opacity-40')
        await userEvent.keyboard('{Escape}')
    })
})

describe('The channel list for a member', () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        vi.clearAllMocks()
    })

    it('marks the open channel the same way when it opened at a message (a link, the inbox)', async () => {
        renderColumn(server(MEMBER), undefined, '/channels/ot/tai-lieu/m1')
        const open = await screen.findByRole('link', { name: 'tai-lieu' })
        expect(open).toHaveAttribute('aria-current', 'page')
        expect(open).toHaveClass('bg-surface-3', 'font-semibold')
        expect(screen.getByRole('link', { name: 'hoi-dap' })).not.toHaveClass('bg-surface-3')
    })

    it('dims a room they may not join and locks it, keeping the row a row (its Tooltip wraps the link)', async () => {
        const noConnect = String(BigInt(MEMBER) & ~(1n << 15n))
        const data = server(MEMBER)
        renderColumn({
            ...data,
            channels: data.channels.map((c) => (c.type === 'voice' ? { ...c, permissions: noConnect } : c))
        })
        const room = await screen.findByRole('link', { name: /Phòng học im lặng/ })
        expect(room).toHaveClass('flex', 'h-8', 'text-text-tertiary')
        expect(room).not.toHaveClass('text-text-primary')
        expect(room.className).not.toContain('=>')
        expect(within(room).getByRole('img', { name: 'You may not join this room' })).toBeInTheDocument()
    })

    it("shows a room's session under its row, to anyone, in the room or not (C-06 focus-running)", async () => {
        noteServerTime(studySession().serverTime)
        const data = server(MEMBER)
        renderColumn({
            ...data,
            channels: data.channels.map((c) =>
                c.type === 'voice' ? { ...c, isStudyRoom: true, focusSession: roomSessionOf(studySession()) } : c
            )
        })
        const line = (await screen.findByText('Focus')).parentElement!
        expect(line).toHaveTextContent('Focus · 18 min left')
        expect(line.parentElement).toHaveClass('text-phase-focus')
        expect(line.closest('li')).toContainElement(screen.getByRole('link', { name: /Phòng học im lặng/ }))
    })

    it('has a menu with Leave only, no buttons on rows, and Space does not lift anything', async () => {
        renderColumn(server(MEMBER))
        expect(await screen.findByRole('heading', { name: 'Ôn thi Giải tích 2' })).toBeInTheDocument()
        await userEvent.click(screen.getByRole('button', { name: 'Ôn thi Giải tích 2' }))
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Leave server'])
        await userEvent.keyboard('{Escape}')
        expect(screen.queryByRole('button', { name: 'Channel settings' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /Create a channel in/ })).not.toBeInTheDocument()
        screen.getByRole('link', { name: 'hoi-dap' }).focus()
        await userEvent.keyboard(' ')
        expect(screen.queryByText(/Picked up/)).not.toBeInTheDocument()
    })

    it('shows ⚙ on a room to someone who manages study rooms, who still cannot move it (S-SET-06, D-210)', async () => {
        const studyRooms = String(BigInt(MEMBER) | (1n << 20n))
        const data = server(MEMBER)
        renderColumn({ ...data, channels: data.channels.map((c) => ({ ...c, permissions: studyRooms })) })
        await userEvent.click(await screen.findByRole('button', { name: 'Room settings' }))
        expect(useChannelDialogs.getState().open).toMatchObject({ kind: 'channelSettings', channelId: 'phong' })
        // A text channel has no study part: no ⚙ there.
        expect(screen.queryByRole('button', { name: 'Channel settings' })).not.toBeInTheDocument()
        screen.getByRole('link', { name: 'Phòng học im lặng' }).focus()
        await userEvent.keyboard(' ')
        expect(screen.queryByText(/Picked up/)).not.toBeInTheDocument()
    })

    describe('who is in each voice room (C-06 occupied, D-205)', () => {
        const person = (id: string, on: Partial<RoomPerson> = {}): RoomPerson => ({
            user: { id, username: id, displayName: id.toUpperCase(), avatarUrl: null },
            roleIds: [],
            isOwner: false,
            joinedAt: '2026-11-18T14:40:00.000Z',
            micOn: false,
            cameraOn: false,
            screenSharing: false,
            modMuted: false,
            ...on
        })
        const withPeople = (people: RoomPerson[]) => {
            const data = server(MEMBER)
            return {
                ...data,
                channels: data.channels.map((c) => (c.type === 'voice' ? { ...c, voiceStates: people } : c))
            }
        }
        afterEach(() => useVoiceStore.setState({ call: null }))

        it('lists them under the room, oneself first, then mic or camera on, with what they have on', async () => {
            renderColumn(
                withPeople([
                    person('nam'),
                    person('tuan', { micOn: true }),
                    person('an'),
                    person('minh', { cameraOn: true, screenSharing: true })
                ])
            )
            await screen.findByRole('link', { name: /Phòng học im lặng/ })
            const people = screen.getAllByRole('listitem').filter((item) => item.hasAttribute('aria-label'))
            expect(people.map((item) => item.getAttribute('aria-label'))).toEqual([
                'AN',
                'TUAN, mic on',
                'MINH, sharing their screen, camera on',
                'NAM'
            ])
            await expectNoA11yViolations()
        })

        it('shows 10, then "+N more" opening the room (not unfolded in place)', async () => {
            renderColumn(withPeople(Array.from({ length: 13 }, (_, i) => person(`p${i}`))))
            const more = await screen.findByRole('link', { name: '+3 more' })
            expect(more).toHaveAttribute('href', '/channels/ot/phong')
            expect(screen.getAllByRole('listitem').filter((item) => item.hasAttribute('aria-label'))).toHaveLength(10)
        })

        it('offers a moderator Mute and Disconnect on people ranked below, Unmute on someone muted (D-208, mod-menu-row)', async () => {
            const MODERATOR = String(BigInt(MEMBER) | (1n << 18n) | (1n << 19n))
            const data = withPeople([
                person('an'),
                person('tuan', { micOn: true }),
                person('nam', { modMuted: true }),
                person('chu', { isOwner: true })
            ])
            renderColumn({
                ...data,
                channels: data.channels.map((c) => (c.type === 'voice' ? { ...c, permissions: MODERATOR } : c))
            })
            await screen.findByRole('link', { name: /Phòng học im lặng/ })
            const rows = screen.getAllByRole('listitem').filter((item) => item.hasAttribute('aria-label'))
            expect(rows.map((item) => item.getAttribute('aria-label'))).toEqual([
                'AN',
                'TUAN, mic on',
                'NAM, muted by a moderator',
                'CHU'
            ])
            expect(screen.queryByRole('button', { name: 'Manage AN' })).toBeNull()
            expect(screen.queryByRole('button', { name: 'Manage CHU' })).toBeNull()

            await userEvent.click(screen.getByRole('button', { name: 'Manage TUAN' }))
            const menu = await screen.findByRole('menu')
            expect(
                within(menu)
                    .getAllByRole('menuitem')
                    .map((item) => item.textContent)
            ).toEqual(['Mute', 'Disconnect from room'])
            await expectNoA11yViolations()
            await userEvent.click(within(menu).getByRole('menuitem', { name: 'Mute' }))
            await waitFor(() => expect(voiceApi.muteParticipant).toHaveBeenCalledWith('phong', 'tuan'))

            fireEvent.contextMenu(rows[2]!, { clientX: 40, clientY: 10 })
            await userEvent.click(await screen.findByRole('menuitem', { name: 'Unmute' }))
            await waitFor(() => expect(voiceApi.unmuteParticipant).toHaveBeenCalledWith('phong', 'nam'))
        })

        it('has no menu on people for someone without MUTE_MEMBERS or MOVE_MEMBERS', async () => {
            renderColumn(withPeople([person('an'), person('tuan')]))
            await screen.findByRole('link', { name: /Phòng học im lặng/ })
            expect(screen.queryByRole('button', { name: /^Manage/ })).toBeNull()
            const tuan = screen.getAllByRole('listitem').find((item) => item.getAttribute('aria-label') === 'TUAN')
            // Not prevented: the browser's own menu still opens.
            expect(fireEvent.contextMenu(tuan!)).toBe(true)
            expect(screen.queryByRole('menu')).toBeNull()
        })

        it('marks the room this tab is in as connected', async () => {
            useVoiceStore.setState({
                call: { serverId: 'ot', channelId: 'phong', name: 'Phòng học im lặng', phase: 'connected' }
            })
            renderColumn(withPeople([person('an')]))
            const room = await screen.findByRole('link', { name: /Phòng học im lặng/ })
            expect(room).toHaveClass('font-semibold', 'text-text-primary')
        })
    })
})
