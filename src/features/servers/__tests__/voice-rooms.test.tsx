import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { RoomPerson, Server, ServerChannel } from '../types'

vi.mock('@/features/users/api/useProfile', () => ({ useProfile: () => ({ data: { id: 'an' } }) }))

const { withRoomPeople } = await import('../lib/room-people')
const { voiceDirectory, voiceRoomOf } = await import('../lib/voice-room')
const { RoomDock } = await import('../components/RoomDock')
const { serverKeys } = await import('../api/keys')
const { useVoiceStore } = await import('@/features/voice')
const { useToastArea } = await import('@/hooks/useToastArea')

const CONNECT = 1n << 15n
const SPEAK = 1n << 16n
const VIDEO = 1n << 17n
const person = (id: string): RoomPerson => ({
    user: { id, username: id, displayName: null, avatarUrl: null },
    joinedAt: '2026-11-18T14:40:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false
})
const channel = (id: string, extra: Partial<ServerChannel> = {}): ServerChannel => ({
    id,
    categoryId: null,
    type: 'voice',
    name: id,
    position: 0,
    isPrivate: false,
    sendMode: 'everyone',
    isStudyRoom: false,
    taskBoardEnabled: false,
    permissions: String(CONNECT | SPEAK),
    viewRoleIds: null,
    voiceStates: [],
    ...extra
})
const server = (id: string, channels: ServerChannel[], timeoutUntil: string | null = null): Server => ({
    id,
    name: id,
    iconUrl: null,
    isOwner: false,
    memberCount: 3,
    permissions: '0',
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil,
    welcomeChannelId: null,
    categories: [],
    channels
})

describe("a voice room's people in the servers held (D-205)", () => {
    it("swaps one room's list, and only a voice room's; the same list when none holds it", () => {
        const servers = [
            server('ot', [channel('chung', { type: 'text', voiceStates: null }), channel('thao-luan')]),
            server('nd', [channel('phong')])
        ]
        const next = withRoomPeople(servers, 'thao-luan', [person('tuan')])
        expect(next?.[0]?.channels[1]?.voiceStates).toEqual([person('tuan')])
        expect(next?.[1]).toBe(servers[1])
        expect(withRoomPeople(servers, 'chung', [person('tuan')])).toBe(servers)
        expect(withRoomPeople(servers, 'elsewhere', [])).toBe(servers)
        expect(withRoomPeople(undefined, 'thao-luan', [])).toBeUndefined()
    })
})

describe('a voice room as the voice feature takes it', () => {
    it('reads what one may do there from the bits, and the timeout from the server (D-54)', () => {
        const ot = server('ot', [channel('thao-luan', { permissions: String(CONNECT | VIDEO), voiceStates: null })])
        expect(voiceRoomOf(ot, ot.channels[0]!)).toEqual({
            serverId: 'ot',
            channelId: 'thao-luan',
            name: 'thao-luan',
            isStudyRoom: false,
            people: [],
            canConnect: true,
            canSpeak: false,
            canVideo: true,
            timeoutUntil: null
        })
    })

    it('finds a room, and the room someone is in, among every server held', () => {
        const directory = voiceDirectory([
            server('ot', [channel('chung', { type: 'text', voiceStates: null }), channel('thao-luan')]),
            server('nd', [channel('phong', { voiceStates: [person('an')] })])
        ])
        expect(directory.room('thao-luan')?.serverId).toBe('ot')
        expect(directory.room('chung')).toBeUndefined()
        expect(directory.roomOf('an')?.channelId).toBe('phong')
        expect(directory.roomOf('tuan')).toBeUndefined()
    })
})

describe('the dock while in a room (C-09)', () => {
    afterEach(() => {
        useVoiceStore.setState({ call: null })
        vi.mocked(window.matchMedia).mockImplementation(
            (query: string) =>
                ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
        )
    })
    /** A window at least 1024 wide: the list column shows, so the dock is in it. */
    const wide = () =>
        vi
            .mocked(window.matchMedia)
            .mockImplementation(
                (query: string) =>
                    ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as never
            )

    const show = (at: string, shape: 'column' | 'strip' = 'column') => {
        const client = new QueryClient()
        client.setQueryData(serverKeys.list(), [
            server('ot', [
                channel('chung', { type: 'text', voiceStates: null }),
                channel('thao-luan', { voiceStates: [person('an'), person('tuan')] })
            ])
        ])
        const router = createMemoryRouter(
            [{ path: '/channels/:serverId/:channelId?', element: <RoomDock shape={shape} /> }],
            { initialEntries: [at] }
        )
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <RouterProvider router={router} />
                </TooltipProvider>
            </QueryClientProvider>
        )
    }

    it("shows the room and how many are in it away from the room's page", async () => {
        wide()
        useVoiceStore.setState({
            call: { serverId: 'ot', channelId: 'thao-luan', name: 'thao-luan', phase: 'connected' }
        })
        show('/channels/ot/chung')
        expect(await screen.findByRole('link', { name: /thao-luan.*2 people/ })).toHaveAttribute(
            'href',
            '/channels/ot/thao-luan'
        )
    })

    it('counts oneself while the room list has not caught up yet (never "0 people")', async () => {
        wide()
        useVoiceStore.setState({ call: { serverId: 'ot', channelId: 'phong', name: 'phong', phase: 'connected' } })
        const client = new QueryClient()
        client.setQueryData(serverKeys.list(), [
            server('ot', [channel('chung', { type: 'text', voiceStates: null }), channel('phong')])
        ])
        const router = createMemoryRouter(
            [{ path: '/channels/:serverId/:channelId?', element: <RoomDock shape='column' /> }],
            {
                initialEntries: ['/channels/ot/chung']
            }
        )
        render(
            <QueryClientProvider client={client}>
                <TooltipProvider>
                    <RouterProvider router={router} />
                </TooltipProvider>
            </QueryClientProvider>
        )
        expect(await screen.findByRole('link', { name: /1 person/ })).toBeVisible()
    })

    it('is one dock at a time: in the column from 1024 up, a strip across the window below (C-09)', async () => {
        wide()
        useVoiceStore.setState({
            call: { serverId: 'ot', channelId: 'thao-luan', name: 'thao-luan', phase: 'connected' }
        })
        show('/channels/ot/chung', 'strip')
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryByRole('region')).not.toBeInTheDocument()
        // A strip drawn but hidden would hold the toasts' bottom edge at 0: off the screen.
        expect(useToastArea.getState().barTop).toBeNull()
    })

    it("is not on the room's own page, nor while joining, nor out of any room", async () => {
        useVoiceStore.setState({
            call: { serverId: 'ot', channelId: 'thao-luan', name: 'thao-luan', phase: 'connected' }
        })
        show('/channels/ot/thao-luan')
        useVoiceStore.setState({
            call: { serverId: 'ot', channelId: 'thao-luan', name: 'thao-luan', phase: 'joining' }
        })
        await new Promise((resolve) => setTimeout(resolve, 50))
        expect(screen.queryByRole('region')).not.toBeInTheDocument()
    })
})
