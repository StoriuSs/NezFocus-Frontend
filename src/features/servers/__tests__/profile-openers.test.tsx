import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { MemoryRouter } from 'react-router-dom'
import i18n from '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/features/auth'
import { connectProfilePopover, userKeys, type ProfilePopoverProps } from '@/features/users'
import type { RoomPerson, VoiceRoom } from '@/features/voice'
import { expectNoA11yViolations } from '@/test/a11y'
import type { MemberPage, Server, ServerMember } from '../types'

const rolesApi = { fetchMembers: vi.fn<() => Promise<MemberPage>>() }
vi.mock('@/features/servers/api/roles.api', () => rolesApi)

const { RoomPeople } = await import('../components/channel-list/RoomPeople')
const { MembersSettings } = await import('../components/settings/members/MembersSettings')

/** The popover as the AppShell would connect it, drawn in a portal as Radix draws it: here, only whom and where. */
connectProfilePopover(({ userId, serverId, name }: ProfilePopoverProps) =>
    createPortal(<p>{`profile of ${name} (${userId}) in ${serverId ?? 'no server'}`}</p>, document.body)
)

const person = (id: string, name: string, on: Partial<RoomPerson> = {}): RoomPerson => ({
    user: { id, username: id, displayName: name, avatarUrl: null },
    roleIds: [],
    isOwner: false,
    joinedAt: '2026-11-18T14:40:00.000Z',
    micOn: false,
    cameraOn: false,
    screenSharing: false,
    modMuted: false,
    ...on
})
/** Phòng học im lặng of ÔT, An moderating there: Mute and Disconnect on Tuấn. */
const room: VoiceRoom = {
    serverId: 'ot',
    channelId: 'phong',
    name: 'Phòng học im lặng',
    isStudyRoom: true,
    session: null,
    cycle: { focus: 25, shortBreak: 5, longBreak: null, longBreakEvery: null },
    canStartSession: false,
    canManageStudy: false,
    people: [person('an', 'An'), person('tuan', 'Tuấn', { micOn: true })],
    canConnect: true,
    canSpeak: true,
    canVideo: true,
    timeoutUntil: null,
    canMute: true,
    canMove: true,
    outranked: new Set(['tuan'])
}

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const server: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 2,
    permissions: bits(8),
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: []
}
const member = (userId: string, displayName: string): ServerMember => ({
    userId,
    username: displayName.toLowerCase(),
    displayName,
    avatarUrl: null,
    isOwner: false,
    roleIds: [],
    joinedAt: '2026-10-02T03:00:00Z',
    timeoutUntil: null,
    timeoutReason: null,
    activity: null,
    status: 'online'
})

function renderWith(children: ReactNode) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(userKeys.profile(), { id: 'an', username: 'an', displayName: 'An', avatarUrl: null })
    return render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <MemoryRouter>{children}</MemoryRouter>
            </TooltipProvider>
        </QueryClientProvider>
    )
}

describe("A server's people open their profile in it (D-253, L8b2)", () => {
    beforeEach(async () => {
        await i18n.changeLanguage('en')
        useAuthStore.setState({ user: { id: 'an' } as never })
    })

    it("someone under a room in the channel list (L8b2-b): what shows of them is the button, the moderator's ⋯ beside it", async () => {
        const user = userEvent.setup()
        const { container } = renderWith(<RoomPeople room={room} to='/channels/ot/phong' />)
        const tuan = screen.getAllByRole('listitem')[1]!

        expect(within(tuan).getByRole('button', { name: 'Manage Tuấn' })).toBeInTheDocument()
        await user.click(within(tuan).getByRole('button', { name: 'Tuấn, mic on' }))
        const card = await screen.findByText('profile of Tuấn (tuan) in ot')
        await expectNoA11yViolations(container)

        // A right click in the popover is the browser's, not the row's menu.
        expect(fireEvent.contextMenu(card)).toBe(true)
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('a member of Settings › Members (04 S-SET-03): their avatar and name open it', async () => {
        rolesApi.fetchMembers.mockResolvedValue({
            items: [member('an', 'An'), member('binh', 'Bình')],
            meta: {
                currentPage: 1,
                itemsPerPage: 50,
                totalItems: 2,
                totalPages: 1,
                hasNextPage: false,
                hasPreviousPage: false
            }
        })
        const user = userEvent.setup()
        renderWith(<MembersSettings server={server} />)

        await user.click(await screen.findByRole('button', { name: /Bình/ }))
        expect(await screen.findByText('profile of Bình (binh) in ot')).toBeInTheDocument()
    })
})
