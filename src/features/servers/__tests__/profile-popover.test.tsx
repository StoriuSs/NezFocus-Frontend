import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, AxiosHeaders } from 'axios'
import { Toaster } from 'sonner'
import '@/i18n'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAuthStore } from '@/features/auth'
import { expectNoA11yViolations } from '@/test/a11y'
import type { PersonProfile, Relationship } from '@/features/social'
import type { Dm } from '@/features/social/types'
import { handOffDialog } from '@/features/users/lib/profile-popover'
import type { Server, ServerMember } from '../types'

const serversApi = { fetchServers: vi.fn() }
vi.mock('@/features/servers/api/servers.api', () => serversApi)
const rolesApi = { fetchMember: vi.fn<(serverId: string, userId: string) => Promise<ServerMember>>() }
vi.mock('@/features/servers/api/roles.api', () => rolesApi)
const moderationApi = { kickMember: vi.fn(), timeoutMember: vi.fn(), banMember: vi.fn() }
vi.mock('@/features/servers/api/moderation.api', () => moderationApi)
const socialApi = {
    fetchPersonProfile: vi.fn<(userId: string) => Promise<PersonProfile>>(),
    requestFriend: vi.fn<(userId: string) => Promise<Relationship>>(),
    acceptFriendRequest: vi.fn<(userId: string, key: string) => Promise<Relationship>>(),
    removeRelationship: vi.fn<(userId: string) => Promise<Relationship>>(),
    blockPerson: vi.fn<(userId: string) => Promise<Relationship>>()
}
vi.mock('@/features/social/api/social.api', async (original) => ({ ...(await original<object>()), ...socialApi }))
const dmsApi = {
    fetchDms: vi.fn(async () => [] as Dm[]),
    openDm: vi.fn<(userId: string, key: string) => Promise<Dm>>()
}
vi.mock('@/features/social/api/dms.api', async (original) => ({ ...(await original<object>()), ...dmsApi }))

const { default: ProfilePopover } = await import('../components/profile/ProfilePopover')
const { ProfileDialogs, ProfileTrigger, connectProfilePopover } = await import('@/features/users')
const { connectRoomLookup, relationshipsQuery } = await import('@/features/social')

connectProfilePopover((props) => <ProfilePopover {...props} />)
connectRoomLookup(() => ({ roomOf: () => null }))

const bits = (...positions: number[]) => String(positions.reduce((all, bit) => all | (1n << BigInt(bit)), 0n))
const KICK = 4
const MODERATE = 6
const VIEW = 8

/** Ôn thi Giải tích 2: Trưởng nhóm above Nhóm tài liệu. */
const server: Server = {
    id: 'ot',
    name: 'Ôn thi Giải tích 2',
    iconUrl: null,
    isOwner: false,
    memberCount: 13,
    permissions: bits(VIEW),
    topRolePosition: 0,
    roleIds: [],
    roles: [
        { id: 'docs', name: 'Nhóm tài liệu', position: 1, administrator: false },
        { id: 'lead', name: 'Trưởng nhóm', position: 2, administrator: false }
    ],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: []
}
/** Bình, Trưởng nhóm: may kick and time out those below. */
const moderating: Server = { ...server, permissions: bits(KICK, MODERATE, VIEW), topRolePosition: 2, roleIds: ['lead'] }

const phong = { id: 'phong', username: 'phong.vu', displayName: 'Phong', avatarUrl: null }
const profileOf = (extra: Partial<PersonProfile> = {}): PersonProfile => ({
    user: phong,
    presence: 'online',
    activity: null,
    relationship: 'none',
    bio: 'Lớp K23 · mới học Giải tích 2',
    mutualServers: [],
    ...extra
})
const memberOf = (extra: Partial<ServerMember> = {}): ServerMember => ({
    userId: 'phong',
    username: 'phong.vu',
    displayName: 'Phong',
    avatarUrl: null,
    isOwner: false,
    roleIds: ['docs', 'lead'],
    joinedAt: '2026-10-05T03:00:00Z',
    timeoutUntil: null,
    timeoutReason: null,
    activity: null,
    status: 'online',
    ...extra
})
const notFound = () =>
    new AxiosError('refused', '404', undefined, undefined, {
        status: 404,
        statusText: '',
        headers: {},
        config: { headers: new AxiosHeaders() },
        data: { meta: { type: 'NOT_FOUND_ERROR', code: '404' }, data: null }
    })

/** Opens Phong's popover from a name, in the server `ot` or (null) outside one. */
async function openProfile(
    serverId: string | null,
    { me = 'an', viewer = server, relationships = [] as unknown[] } = {}
) {
    useAuthStore.setState({ user: { id: me } as never })
    serversApi.fetchServers.mockResolvedValue([viewer])
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(relationshipsQuery.queryKey, relationships as never)
    const router = createMemoryRouter(
        [
            {
                path: '/',
                element: (
                    <>
                        <ProfileTrigger userId='phong' serverId={serverId} name='Phong' avatarUrl={null}>
                            Phong
                        </ProfileTrigger>
                        <button type='button'>elsewhere</button>
                    </>
                )
            },
            // A page without the opener: Phong's messages folded away, a DM opened…
            { path: '*', element: <p>another page</p> }
        ],
        { initialEntries: ['/'] }
    )
    render(
        <QueryClientProvider client={client}>
            <TooltipProvider>
                <RouterProvider router={router} />
                <ProfileDialogs />
                <Toaster />
            </TooltipProvider>
        </QueryClientProvider>
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Phong' }))
    const popover = await screen.findByRole('dialog', { name: 'Phong' })
    return { user, popover, router, client }
}

describe('The profile popover (02 S-CHAT-05, D-252, D-253)', () => {
    // A dialog handed off is the AppShell's, not the test's: none left for the next one.
    afterEach(() => act(() => handOffDialog(null)))

    beforeEach(() => {
        rolesApi.fetchMember.mockReset()
        rolesApi.fetchMember.mockResolvedValue(memberOf())
        Object.values(socialApi).forEach((fn) => fn.mockReset())
        dmsApi.openDm.mockReset()
        moderationApi.timeoutMember.mockReset()
        socialApi.fetchPersonProfile.mockResolvedValue(
            profileOf({ mutualServers: [{ id: 'ot', name: 'Ôn thi Giải tích 2' }] })
        )
    })

    it('in a server: name, username, bio, roles highest first, the day they joined; Message, Add friend, ⋯', async () => {
        const { popover } = await openProfile('ot')

        expect(await within(popover).findByText('Member since 10/05/2026')).toBeInTheDocument()
        expect(within(popover).getByRole('heading', { name: 'Phong' })).toBeInTheDocument()
        expect(within(popover).getByText('phong.vu')).toBeInTheDocument()
        expect(within(popover).getByText('Lớp K23 · mới học Giải tích 2')).toBeInTheDocument()
        const roles = within(popover).getByRole('list', { name: 'Roles' })
        expect(
            within(roles)
                .getAllByRole('listitem')
                .map((tag) => tag.textContent)
        ).toEqual(['Trưởng nhóm', 'Nhóm tài liệu'])
        expect(within(popover).queryByText(/Mutual server/)).not.toBeInTheDocument()
        expect(within(popover).getByRole('button', { name: 'Message' })).toBeInTheDocument()
        expect(within(popover).getByRole('button', { name: 'Add friend' })).toBeInTheDocument()
        expect(within(popover).getByRole('button', { name: 'More: Phong' })).toBeInTheDocument()
        expect(rolesApi.fetchMember).toHaveBeenCalledWith('ot', 'phong')
        await expectNoA11yViolations()
    })

    it('marks the owner first, with a crown', async () => {
        rolesApi.fetchMember.mockResolvedValue(memberOf({ isOwner: true, roleIds: ['lead'] }))
        const { popover } = await openProfile('ot')

        const roles = await within(popover).findByRole('list', { name: 'Roles' })
        expect(
            within(roles)
                .getAllByRole('listitem')
                .map((tag) => tag.textContent)
        ).toEqual(['Server owner', 'Trưởng nhóm'])
    })

    it('shows someone no longer in the server as outside it: the servers we share, no roles (D-252)', async () => {
        rolesApi.fetchMember.mockRejectedValue(notFound())
        socialApi.fetchPersonProfile.mockResolvedValue(
            profileOf({
                mutualServers: ['Một', 'Hai', 'Ba', 'Bốn'].map((name, index) => ({ id: `s${index}`, name }))
            })
        )
        const { popover } = await openProfile('ot')

        expect(await within(popover).findByRole('heading', { name: 'Mutual servers — 4' })).toBeInTheDocument()
        expect(
            within(popover)
                .getAllByRole('link')
                .map((link) => link.textContent)
        ).toEqual(['MMột', 'HHai', 'BBa'])
        expect(within(popover).getByText('+1 more server')).toBeInTheDocument()
        expect(within(popover).queryByText(/Member since/)).not.toBeInTheDocument()
    })

    it('outside a server reads no member, and says when we share none', async () => {
        socialApi.fetchPersonProfile.mockResolvedValue(profileOf())
        const { popover } = await openProfile(null)

        expect(await within(popover).findByText('No servers in common')).toBeInTheDocument()
        expect(rolesApi.fetchMember).not.toHaveBeenCalled()
    })

    it('shows their study activity, as the DM panel does', async () => {
        const solo = { room: null, solo: { status: 'paused' as const, phase: 'focus' as const, phaseEndsAt: null } }
        socialApi.fetchPersonProfile.mockResolvedValue(profileOf({ activity: solo }))
        const { popover } = await openProfile(null)
        expect(await within(popover).findAllByText(/Studying solo/)).not.toHaveLength(0)
    })

    it('on someone I blocked: the Blocked tag and ⋯, no Message, no activity', async () => {
        const solo = { room: null, solo: { status: 'paused' as const, phase: 'focus' as const, phaseEndsAt: null } }
        socialApi.fetchPersonProfile.mockResolvedValue(profileOf({ activity: solo }))
        const { popover } = await openProfile(null, { relationships: [{ type: 'blocked', user: phong }] })

        expect(await within(popover).findByText('Blocked')).toBeInTheDocument()
        expect(within(popover).queryByRole('button', { name: 'Message' })).not.toBeInTheDocument()
        expect(within(popover).queryByText(/Studying solo/)).not.toBeInTheDocument()
    })

    it('on oneself: Edit profile, no Message nor activity', async () => {
        const solo = { room: null, solo: { status: 'paused' as const, phase: 'focus' as const, phaseEndsAt: null } }
        socialApi.fetchPersonProfile.mockResolvedValue(profileOf({ activity: solo }))
        const { popover } = await openProfile('ot', { me: 'phong' })

        expect(await within(popover).findByRole('link', { name: 'Edit profile' })).toHaveAttribute(
            'href',
            '/settings/profile'
        )
        expect(within(popover).queryByRole('button', { name: 'Message' })).not.toBeInTheDocument()
        expect(within(popover).queryByText(/Studying solo/)).not.toBeInTheDocument()
    })

    it('a deleted account: its avatar and "Deleted account", nothing else', async () => {
        socialApi.fetchPersonProfile.mockRejectedValue(notFound())
        const { popover } = await openProfile(null)

        expect(await within(popover).findByText('Deleted account')).toBeInTheDocument()
        expect(within(popover).queryByRole('button')).not.toBeInTheDocument()
    })

    it("a moderator's ⋯: the Members row's items they may use, never Transfer; Kick asks in the popover's place", async () => {
        rolesApi.fetchMember.mockResolvedValue(memberOf({ roleIds: ['docs'] }))
        const { user, popover } = await openProfile('ot', { me: 'binh', viewer: moderating })

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        const menu = await screen.findByRole('menu')
        expect(
            within(menu)
                .getAllByRole('menuitem')
                .map((item) => item.textContent)
        ).toEqual(['Copy username', 'Time out', 'Kick from server', 'Block'])

        await user.click(within(menu).getByRole('menuitem', { name: 'Kick from server' }))
        const ask = await screen.findByRole('dialog', { name: 'Kick Phong from the server?' })
        expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument()

        await user.keyboard('{Escape}')
        await waitFor(() => expect(ask).not.toBeInTheDocument())
        await waitFor(() => expect(screen.getByRole('button', { name: 'Phong' })).toHaveFocus())
    })

    it('offers no moderation on someone ranked level or above', async () => {
        const { user, popover } = await openProfile('ot', { me: 'binh', viewer: moderating })

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        const menu = await screen.findByRole('menu')
        expect(within(menu).queryByRole('menuitem', { name: 'Kick from server' })).not.toBeInTheDocument()
    })

    it('closes with Esc, the keyboard back on the name; a click on the name opens and closes it (C-15)', async () => {
        const { user, popover } = await openProfile('ot')
        const name = screen.getByRole('button', { name: 'Phong' })
        expect(name).toHaveAttribute('aria-expanded', 'true')
        await within(popover).findByRole('button', { name: 'Message' })

        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument())
        await waitFor(() => expect(name).toHaveFocus())

        await user.click(name)
        expect(await screen.findByRole('dialog', { name: 'Phong' })).toBeInTheDocument()
        await user.click(name)
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument())
        expect(name).toHaveAttribute('aria-expanded', 'false')
    })

    it('Message closes the popover and opens the DM', async () => {
        dmsApi.openDm.mockResolvedValue({ id: 'dm-phong' } as Dm)
        const { user, popover, router } = await openProfile('ot')

        await user.click(await within(popover).findByRole('button', { name: 'Message' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument())
        await waitFor(() => expect(router.state.location.pathname).toBe('/dm/dm-phong'))
    })

    it('closes on a click outside, the focus left where one clicked', async () => {
        const { user } = await openProfile('ot')

        await user.click(screen.getByRole('button', { name: 'elsewhere' }))
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument())
        expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus()
    })

    it("Block asks in the popover's place, then the keyboard is back on the name", async () => {
        socialApi.blockPerson.mockResolvedValue({ type: 'blocked', user: phong } as Relationship)
        const { user, popover } = await openProfile('ot')

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Block' }))
        const ask = await screen.findByRole('dialog', { name: 'Block Phong?' })
        expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument()

        await user.click(within(ask).getByRole('button', { name: 'Block' }))
        await waitFor(() => expect(ask).not.toBeInTheDocument())
        expect(socialApi.blockPerson).toHaveBeenCalledWith('phong')
        await waitFor(() => expect(screen.getByRole('button', { name: 'Phong' })).toHaveFocus())
    })

    it('keeps a question open when its opener goes away meanwhile (the messages of someone blocked fold)', async () => {
        const { user, popover, router } = await openProfile('ot')

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Block' }))
        await screen.findByRole('dialog', { name: 'Block Phong?' })

        await router.navigate('/away')
        expect(await screen.findByText('another page')).toBeInTheDocument()
        const ask = screen.getByRole('dialog', { name: 'Block Phong?' })

        await user.click(within(ask).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(ask).not.toBeInTheDocument())
    })

    it('Add friend turns into the Request sent Tag, its Toast shown even once the popover closed', async () => {
        let answer: (entry: Relationship) => void = () => undefined
        socialApi.requestFriend.mockReturnValue(new Promise((resolve) => (answer = resolve)))
        const { user, popover, client } = await openProfile('ot')

        await user.click(await within(popover).findByRole('button', { name: 'Add friend' }))
        await user.keyboard('{Escape}')
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Phong' })).not.toBeInTheDocument())
        answer({ type: 'outgoing', user: phong } as Relationship)
        expect(await screen.findByText('Friend request sent to Phong')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Phong' }))
        const again = await screen.findByRole('dialog', { name: 'Phong' })
        expect(await within(again).findByText('Request sent')).toBeInTheDocument()
        expect(client.getQueryData<Relationship[]>(['social', 'relationships'])?.[0]?.type).toBe('outgoing')
    })

    it('Accept a request: their Toast, and Friends', async () => {
        socialApi.acceptFriendRequest.mockResolvedValue({ type: 'friend', user: phong } as Relationship)
        const { user, popover } = await openProfile('ot', { relationships: [{ type: 'incoming', user: phong }] })

        await user.click(await within(popover).findByRole('button', { name: 'Accept' }))
        expect(await screen.findByText('You and Phong are now friends')).toBeInTheDocument()
        expect(await within(popover).findByText('Friends')).toBeInTheDocument()
    })

    it('a moderation dialog follows the member as last read: outranked meanwhile, it says so (04 target-outranked)', async () => {
        rolesApi.fetchMember.mockResolvedValue(memberOf({ roleIds: ['docs'] }))
        const { user, popover, client } = await openProfile('ot', { me: 'binh', viewer: moderating })

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Kick from server' }))
        const ask = await screen.findByRole('dialog', { name: 'Kick Phong from the server?' })
        expect(within(ask).queryByText(/equal to or above yours/)).not.toBeInTheDocument()

        client.setQueryData(['servers', 'members', 'ot', 'one', 'phong'], memberOf({ roleIds: ['lead'] }))
        expect(await within(ask).findByText(/equal to or above yours/)).toBeInTheDocument()
    })

    it('Remove timeout from ⋯, at once', async () => {
        moderationApi.timeoutMember.mockResolvedValue(undefined)
        rolesApi.fetchMember.mockResolvedValue(memberOf({ roleIds: [], timeoutUntil: '2999-01-01T00:00:00Z' }))
        const { user, popover } = await openProfile('ot', { me: 'binh', viewer: moderating })

        await user.click(await within(popover).findByRole('button', { name: 'More: Phong' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Remove timeout' }))
        await waitFor(() => expect(moderationApi.timeoutMember).toHaveBeenCalledWith('ot', 'phong', null, null))
    })

    it('a member read that fails (not NOT_FOUND) says so with Try again, never "outside the server"', async () => {
        rolesApi.fetchMember.mockRejectedValue(new Error('offline'))
        const { popover } = await openProfile('ot')

        expect(await within(popover).findByText("Couldn't load the profile")).toBeInTheDocument()
        expect(within(popover).queryByText(/Mutual server/)).not.toBeInTheDocument()
    })

    it('shows no dot for someone I blocked, as their DM does', async () => {
        const { popover } = await openProfile('ot', { relationships: [{ type: 'blocked', user: phong }] })

        await within(popover).findByText('Blocked')
        expect(popover.querySelector('[data-presence]')).toBeNull()
    })
})
