import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { apiError } from '@/test/helpers'
import { roomSessionOf, type FocusSession } from '@/features/study'
import { userKeys } from '@/features/users'
import type { RoomPerson, Server, ServerChannel } from '../types'

const fetchServer = vi.fn<(serverId: string) => Promise<Server>>()
vi.mock('../api/servers.api', () => ({ fetchServer }))

const { emitRealtimeEvent } = await import('@/features/realtime/lib/realtime-events')
const { listenForServers } = await import('../api/liveServers')
const { serverKeys } = await import('../api/keys')

const channel = (id: string): ServerChannel => ({
    id,
    categoryId: null,
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
    permissions: '1024',
    viewRoleIds: null,
    voiceStates: null,
    focusSession: null
})
const server = (id: string, channels: string[], name = id): Server => ({
    id,
    name,
    iconUrl: null,
    isOwner: false,
    memberCount: 3,
    permissions: '1024',
    topRolePosition: 0,
    roleIds: [],
    roles: [],
    timeoutUntil: null,
    welcomeChannelId: null,
    categories: [],
    channels: channels.map(channel)
})

let client: QueryClient
let stop: () => void
const notices = { deleted: vi.fn(), removed: vi.fn() }
const list = () => client.getQueryData<Server[]>(serverKeys.list())
/** The read again waits up to 800 ms after the first event (300, plus up to 500 at random). */
const settle = () => vi.advanceTimersByTimeAsync(800)
const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated ?? false

describe('Keeping the servers live from events (D-178)', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        fetchServer.mockReset()
        notices.deleted.mockReset()
        notices.removed.mockReset()
        client = new QueryClient()
        client.setQueryData(userKeys.profile(), { id: 'an' })
        client.setQueryData(serverKeys.list(), [server('ot', ['chung', 'hoi-dap'], 'Ôn thi'), server('nd', ['chung'])])
        stop = listenForServers(client, notices)
    })
    afterEach(() => {
        stop()
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('reads a server again once for several events close together, and puts it in its place', async () => {
        fetchServer.mockResolvedValue(server('ot', ['chung', 'hoi-dap', 'tai-lieu'], 'Ôn thi'))

        emitRealtimeEvent('channel.created', { serverId: 'ot' })
        emitRealtimeEvent('category.updated', { serverId: 'ot' })
        emitRealtimeEvent('role.updated', { serverId: 'ot' })
        await vi.advanceTimersByTimeAsync(500)
        expect(fetchServer).not.toHaveBeenCalled()
        await settle()

        expect(fetchServer).toHaveBeenCalledTimes(1)
        expect(fetchServer).toHaveBeenCalledWith('ot')
        expect(list()?.map((one) => one.id)).toEqual(['ot', 'nd'])
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung', 'hoi-dap', 'tai-lieu'])
    })

    it('reads again after a read already going, when another event came meanwhile', async () => {
        let answer!: (value: Server) => void
        fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        fetchServer.mockResolvedValueOnce(server('ot', ['chung'], 'Ôn thi'))

        emitRealtimeEvent('channel.updated', { serverId: 'ot' })
        await settle()
        emitRealtimeEvent('channel.deleted', { serverId: 'ot' })
        answer(server('ot', ['chung', 'hoi-dap'], 'Ôn thi'))
        await settle()

        expect(fetchServer).toHaveBeenCalledTimes(2)
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung'])
    })

    it('adds a server one made or joined in another tab', async () => {
        fetchServer.mockResolvedValue(server('mt', ['chung'], 'Mới'))
        emitRealtimeEvent('member.joined', { serverId: 'mt', userId: 'an' })
        await settle()
        expect(list()?.map((one) => one.id)).toEqual(['ot', 'nd', 'mt'])
    })

    it('takes a server off when reading it again says it is not one of theirs any more', async () => {
        fetchServer.mockRejectedValue(apiError(404, 'NOT_FOUND_ERROR'))
        emitRealtimeEvent('role.deleted', { serverId: 'ot' })
        await settle()
        expect(list()?.map((one) => one.id)).toEqual(['nd'])
        expect(notices.removed).not.toHaveBeenCalled()
    })

    it('forgets the histories of channels no longer listed: deleted, or no longer seen', async () => {
        client.setQueryData(['messages', 'channel', 'hoi-dap'], { pages: [], pageParams: [] })
        client.setQueryData(['messages', 'pins', 'hoi-dap'], [])
        client.setQueryData(['messages', 'channel', 'chung'], { pages: [], pageParams: [] })
        fetchServer.mockResolvedValue(server('ot', ['chung'], 'Ôn thi'))

        emitRealtimeEvent('channel.updated', { serverId: 'ot' })
        await settle()

        expect(client.getQueryData(['messages', 'channel', 'hoi-dap'])).toBeUndefined()
        expect(client.getQueryData(['messages', 'pins', 'hoi-dap'])).toBeUndefined()
        expect(client.getQueryData(['messages', 'channel', 'chung'])).toBeDefined()
    })

    it('marks the lists a change touches as old, so the open ones are read again', () => {
        const keys = {
            invites: serverKeys.invites('ot'),
            members: serverKeys.memberPage('ot', { q: '', page: 1, limit: 10 } as never),
            roles: serverKeys.roles('ot'),
            bans: serverKeys.bans('ot'),
            other: serverKeys.invites('nd')
        }
        for (const key of Object.values(keys)) client.setQueryData(key, [])

        emitRealtimeEvent('invite.created', { serverId: 'ot' })
        expect([stale(keys.invites), stale(keys.members), stale(keys.other)]).toEqual([true, false, false])

        emitRealtimeEvent('member.updated', { serverId: 'ot', userId: 'binh' })
        expect([stale(keys.members), stale(keys.roles), stale(keys.bans)]).toEqual([true, true, false])

        emitRealtimeEvent('ban.deleted', { serverId: 'ot' })
        expect(stale(keys.bans)).toBe(true)
    })

    it('marks the invites old when someone joins, so a link used up leaves the page', () => {
        client.setQueryData(serverKeys.invites('ot'), [])
        emitRealtimeEvent('member.joined', { serverId: 'ot', userId: 'binh' })
        expect(stale(serverKeys.invites('ot'))).toBe(true)
    })

    it('takes a deleted server off at once and says so, with the name it had', () => {
        emitRealtimeEvent('server.deleted', { serverId: 'ot' })
        expect(list()?.map((one) => one.id)).toEqual(['nd'])
        expect(notices.deleted).toHaveBeenCalledWith(expect.objectContaining({ id: 'ot', name: 'Ôn thi' }))
        expect(fetchServer).not.toHaveBeenCalled()
    })

    it('takes a server off when one was kicked or banned from it and says so; leaving in another tab says nothing', () => {
        client.setQueryData(['messages', 'channel', 'hoi-dap'], { pages: [], pageParams: [] })
        emitRealtimeEvent('member.left', { serverId: 'ot', userId: 'an', removedBy: 'kick', reason: 'Spam' })
        expect(list()?.map((one) => one.id)).toEqual(['nd'])
        expect(notices.removed).toHaveBeenCalledWith(expect.objectContaining({ id: 'ot' }), 'kick', 'Spam')
        expect(client.getQueryData(['messages', 'channel', 'hoi-dap'])).toBeUndefined()

        emitRealtimeEvent('member.left', { serverId: 'nd', userId: 'an', removedBy: null, reason: null })
        expect(list()).toEqual([])
        expect(notices.removed).toHaveBeenCalledTimes(1)
    })

    it('reads someone else leaving as a change to the server', async () => {
        fetchServer.mockResolvedValue(server('ot', ['chung', 'hoi-dap'], 'Ôn thi'))
        emitRealtimeEvent('member.left', { serverId: 'ot', userId: 'binh' })
        await settle()
        expect(fetchServer).toHaveBeenCalledWith('ot')
        expect(notices.removed).not.toHaveBeenCalled()
    })

    it('drops a read answered after the server went meanwhile: it never comes back to the rail', async () => {
        let answer!: (value: Server) => void
        fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        emitRealtimeEvent('channel.updated', { serverId: 'ot' })
        await settle()

        emitRealtimeEvent('server.deleted', { serverId: 'ot' })
        answer(server('ot', ['chung'], 'Ôn thi'))
        await settle()

        expect(list()?.map((one) => one.id)).toEqual(['nd'])
        expect(fetchServer).toHaveBeenCalledTimes(1)
    })

    it('does not write a read answered after the list changed meanwhile (an own change): it reads again', async () => {
        let answer!: (value: Server) => void
        fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        fetchServer.mockResolvedValueOnce(server('ot', ['chung', 'hoi-dap', 'moi'], 'Ôn thi'))
        emitRealtimeEvent('channel.updated', { serverId: 'ot' })
        await settle()

        // A channel this tab just made, put in the list by its own answer.
        client.setQueryData<Server[]>(serverKeys.list(), (servers) =>
            servers?.map((one) => (one.id === 'ot' ? server('ot', ['chung', 'hoi-dap', 'moi'], 'Ôn thi') : one))
        )
        answer(server('ot', ['chung', 'hoi-dap'], 'Ôn thi'))
        await vi.advanceTimersByTimeAsync(0)
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung', 'hoi-dap', 'moi'])

        await settle()
        expect(fetchServer).toHaveBeenCalledTimes(2)
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung', 'hoi-dap', 'moi'])
    })

    it('never makes a list of servers from an event: none is held (signed out)', async () => {
        client.removeQueries({ queryKey: serverKeys.list() })
        fetchServer.mockResolvedValue(server('ot', ['chung'], 'Ôn thi'))
        emitRealtimeEvent('member.joined', { serverId: 'ot', userId: 'an' })
        await settle()
        expect(list()).toBeUndefined()
    })

    it('says nothing of a server this tab is deleting itself: its dialog says it', () => {
        void client
            .getMutationCache()
            .build(client, { mutationKey: serverKeys.deleting('ot'), mutationFn: () => new Promise(() => undefined) })
            .execute(undefined)

        emitRealtimeEvent('server.deleted', { serverId: 'ot' })

        expect(notices.deleted).not.toHaveBeenCalled()
        expect(list()?.map((one) => one.id)).toEqual(['ot', 'nd'])
    })

    it('reads again a little later when the read failed for a while (no answer, 5xx, too many at once)', async () => {
        fetchServer.mockRejectedValueOnce(apiError(503, 'SERVICE_UNAVAILABLE'))
        fetchServer.mockResolvedValueOnce(server('ot', ['chung'], 'Ôn thi'))
        emitRealtimeEvent('channel.deleted', { serverId: 'ot' })
        await settle()
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung', 'hoi-dap'])

        await vi.advanceTimersByTimeAsync(2000)
        expect(fetchServer).toHaveBeenCalledTimes(2)
        expect(list()?.[0]?.channels.map((one) => one.id)).toEqual(['chung'])
    })

    it('marks the members old when the server changes hands: the owner shows there', () => {
        const members = serverKeys.memberPage('ot', { q: '', page: 1, limit: 10 } as never)
        client.setQueryData(members, [])
        emitRealtimeEvent('server.updated', { serverId: 'ot' })
        expect(stale(members)).toBe(true)
    })

    it('reads everything again once the socket is live again (ARCHITECTURE 3.4), but the member panel, which does so itself', () => {
        client.setQueryData(serverKeys.roles('nd'), [])
        client.setQueryData(serverKeys.memberPanel('nd', 'online'), [])
        emitRealtimeEvent('ready', {})
        expect(stale(serverKeys.list())).toBe(true)
        expect(stale(serverKeys.roles('nd'))).toBe(true)
        expect(stale(serverKeys.memberPanel('nd', 'online'))).toBe(false)
    })

    it('does not read the list twice when the socket is first live while the list is still read', async () => {
        const reads = vi.fn(() => new Promise<Server[]>(() => undefined))
        client.removeQueries({ queryKey: serverKeys.list() })
        // The rail reading it, as the shell does on opening.
        const unsubscribe = new QueryObserver(client, { queryKey: serverKeys.list(), queryFn: reads }).subscribe(
            () => undefined
        )
        emitRealtimeEvent('ready', {})
        await vi.advanceTimersByTimeAsync(0)
        expect(reads).toHaveBeenCalledTimes(1)
        unsubscribe()
    })

    describe('when a timeout ends (02 timed-out: the composer opens again)', () => {
        const timedOut = (id: string, inMs: number): Server => ({
            ...server(id, ['chung']),
            timeoutUntil: new Date(Date.now() + inMs).toISOString()
        })

        it('reads the server again once its timeout is over, for the channels the server gives back', async () => {
            stop()
            client.setQueryData(serverKeys.list(), [timedOut('ot', 60_000), server('nd', ['chung'])])
            stop = listenForServers(client, notices)
            fetchServer.mockResolvedValue(server('ot', ['chung']))

            await vi.advanceTimersByTimeAsync(59_000)
            expect(fetchServer).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(3_000)

            expect(fetchServer).toHaveBeenCalledTimes(1)
            expect(fetchServer).toHaveBeenCalledWith('ot')
            expect(list()?.[0]?.timeoutUntil).toBeNull()
        })

        it('reads once more a little later when the API still counts the timeout at its end (its clock behind)', async () => {
            const until = new Date(Date.now() + 60_000).toISOString()
            stop()
            client.setQueryData(serverKeys.list(), [{ ...server('ot', ['chung']), timeoutUntil: until }])
            stop = listenForServers(client, notices)
            fetchServer.mockResolvedValueOnce({ ...server('ot', ['chung']), timeoutUntil: until })
            fetchServer.mockResolvedValueOnce(server('ot', ['chung']))

            await vi.advanceTimersByTimeAsync(62_000)
            expect(fetchServer).toHaveBeenCalledTimes(1)
            await vi.advanceTimersByTimeAsync(3_000)

            expect(fetchServer).toHaveBeenCalledTimes(2)
            expect(list()?.[0]?.timeoutUntil).toBeNull()
        })

        it('gives up after a few reads that still say timed out, until something else happens', async () => {
            const until = new Date(Date.now() + 60_000).toISOString()
            stop()
            client.setQueryData(serverKeys.list(), [{ ...server('ot', ['chung']), timeoutUntil: until }])
            stop = listenForServers(client, notices)
            fetchServer.mockResolvedValue({ ...server('ot', ['chung']), timeoutUntil: until })

            await vi.advanceTimersByTimeAsync(10 * 60_000)

            expect(fetchServer.mock.calls.length).toBeGreaterThan(1)
            expect(fetchServer.mock.calls.length).toBeLessThanOrEqual(6)
        })

        it('reads again at the end of a timeout given while the page is open', async () => {
            fetchServer.mockResolvedValueOnce(timedOut('ot', 60_000))
            emitRealtimeEvent('member.updated', { serverId: 'ot', userId: 'an' })
            await settle()
            expect(fetchServer).toHaveBeenCalledTimes(1)

            fetchServer.mockResolvedValueOnce(server('ot', ['chung']))
            await vi.advanceTimersByTimeAsync(62_000)
            expect(fetchServer).toHaveBeenCalledTimes(2)
            expect(list()?.[0]?.timeoutUntil).toBeNull()
        })

        it('reads nothing at the old end of a timeout lifted early', async () => {
            fetchServer.mockResolvedValueOnce(timedOut('ot', 60_000))
            emitRealtimeEvent('member.updated', { serverId: 'ot', userId: 'an' })
            await settle()
            expect(fetchServer).toHaveBeenCalledTimes(1)

            // Lifted early: read again by its event, no read left waiting for the old end.
            fetchServer.mockResolvedValueOnce(server('ot', ['chung']))
            emitRealtimeEvent('member.updated', { serverId: 'ot', userId: 'an' })
            await settle()
            expect(fetchServer).toHaveBeenCalledTimes(2)
            await vi.advanceTimersByTimeAsync(120_000)
            expect(fetchServer).toHaveBeenCalledTimes(2)
        })

        it('waits for nothing once stopped (signed out)', async () => {
            stop()
            client.setQueryData(serverKeys.list(), [timedOut('ot', 60_000)])
            stop = listenForServers(client, notices)
            stop()
            await vi.advanceTimersByTimeAsync(120_000)
            expect(fetchServer).not.toHaveBeenCalled()
        })
    })

    describe('who is in each voice room (D-205)', () => {
        const person = (id: string, micOn = false): RoomPerson => ({
            user: { id, username: id, displayName: id, avatarUrl: null },
            roleIds: [],
            isOwner: false,
            joinedAt: '2026-11-18T14:40:00.000Z',
            micOn,
            cameraOn: false,
            screenSharing: false,
            modMuted: false
        })
        const room = (id: string, people: RoomPerson[] = []): ServerChannel => ({
            ...channel(id),
            type: 'voice',
            voiceStates: people
        })
        const withRoom = (people: RoomPerson[] = []): Server => ({
            ...server('ot', ['chung'], 'Ôn thi'),
            channels: [channel('chung'), room('thao-luan', people)]
        })
        const peopleIn = (channelId: string) =>
            list()
                ?.flatMap((one) => one.channels)
                .find((one) => one.id === channelId)
                ?.voiceStates?.map((one) => `${one.user.id}${one.micOn ? '+mic' : ''}`)

        beforeEach(() => {
            client.setQueryData(serverKeys.list(), [withRoom([person('tuan')]), server('nd', ['chung'])])
        })

        it("swaps a room's whole list for the event's: no read of the server", () => {
            emitRealtimeEvent('voice_state.updated', {
                channelId: 'thao-luan',
                voiceStates: [person('tuan', true), person('minh')]
            })
            expect(peopleIn('thao-luan')).toEqual(['tuan+mic', 'minh'])
            expect(fetchServer).not.toHaveBeenCalled()
        })

        it('makes no list from an event: a room not held, or nothing held', () => {
            const before = list()
            emitRealtimeEvent('voice_state.updated', { channelId: 'chung', voiceStates: [person('tuan')] })
            emitRealtimeEvent('voice_state.updated', { channelId: 'elsewhere', voiceStates: [person('tuan')] })
            expect(list()).toBe(before)
            client.removeQueries({ queryKey: serverKeys.list() })
            emitRealtimeEvent('voice_state.updated', { channelId: 'thao-luan', voiceStates: [] })
            expect(list()).toBeUndefined()
        })

        it("does not drop a server's read for a room's list told meanwhile: the read is written once", async () => {
            let answer!: (value: Server) => void
            fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
            emitRealtimeEvent('channel.updated', { serverId: 'ot' })
            await settle()
            emitRealtimeEvent('voice_state.updated', { channelId: 'thao-luan', voiceStates: [] })
            answer({ ...withRoom([person('tuan')]), name: 'Ôn thi 2' })
            await settle()
            expect(fetchServer).toHaveBeenCalledTimes(1)
            expect(list()?.[0]?.name).toBe('Ôn thi 2')
        })

        it('keeps a list told while the server was read: the read is older for that room', async () => {
            let answer!: (value: Server) => void
            fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
            emitRealtimeEvent('channel.updated', { serverId: 'ot' })
            await settle()
            emitRealtimeEvent('voice_state.updated', {
                channelId: 'thao-luan',
                voiceStates: [person('tuan'), person('minh')]
            })
            answer(withRoom([person('tuan')]))
            await settle()
            expect(peopleIn('thao-luan')).toEqual(['tuan', 'minh'])
        })

        it('keeps a list told while everything is read again on ready (L2-e)', async () => {
            let answer!: (value: Server[]) => void
            const unsubscribe = new QueryObserver(client, {
                queryKey: serverKeys.list(),
                queryFn: () => new Promise<Server[]>((resolve) => (answer = resolve))
            }).subscribe(() => undefined)
            emitRealtimeEvent('ready', {})
            await vi.advanceTimersByTimeAsync(0)
            emitRealtimeEvent('voice_state.updated', { channelId: 'thao-luan', voiceStates: [person('minh')] })
            answer([withRoom([person('tuan')]), server('nd', ['chung'])])
            await vi.advanceTimersByTimeAsync(0)
            expect(peopleIn('thao-luan')).toEqual(['minh'])
            unsubscribe()
        })

        it('keeps a list told while the servers are read again for any other reason (a change of this tab)', async () => {
            let answer!: (value: Server[]) => void
            const unsubscribe = new QueryObserver(client, {
                queryKey: serverKeys.list(),
                queryFn: () => new Promise<Server[]>((resolve) => (answer = resolve))
            }).subscribe(() => undefined)
            void client.invalidateQueries({ queryKey: serverKeys.list() })
            await vi.advanceTimersByTimeAsync(0)
            emitRealtimeEvent('voice_state.updated', { channelId: 'thao-luan', voiceStates: [person('minh')] })
            answer([withRoom([person('tuan')]), server('nd', ['chung'])])
            await vi.advanceTimersByTimeAsync(0)
            expect(peopleIn('thao-luan')).toEqual(['minh'])

            // A read begun after the list was told is newer: it is kept.
            void client.invalidateQueries({ queryKey: serverKeys.list() })
            await vi.advanceTimersByTimeAsync(0)
            answer([withRoom([person('nam')]), server('nd', ['chung'])])
            await vi.advanceTimersByTimeAsync(0)
            expect(peopleIn('thao-luan')).toEqual(['nam'])
            unsubscribe()
        })
    })
})

describe("Keeping a study room's session on its room (D-231 L5-b)", () => {
    const at = (version: number, more: Record<string, unknown> = {}) => ({
        id: 's1',
        kind: 'room',
        channelId: 'im-lang',
        hostId: 'an',
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: null,
        longBreakEvery: null,
        status: 'running',
        phase: 'focus',
        phaseIndex: 2,
        phaseStartedAt: '2026-11-22T14:41:00.000Z',
        phaseEndsAt: '2026-11-22T15:06:00.000Z',
        pausedRemainingMs: null,
        waitingUntil: null,
        stretchStartedAt: '2026-11-22T14:41:00.000Z',
        startedAt: '2026-11-22T14:11:00.000Z',
        endedAt: null,
        endedReason: null,
        version,
        serverTime: '2026-11-22T14:47:18.000Z',
        action: 'pause',
        actorId: 'an',
        ...more
    })
    const studyRoom = (): ServerChannel => ({
        ...channel('im-lang'),
        type: 'voice',
        isStudyRoom: true,
        voiceStates: []
    })
    const withStudyRoom = (): Server => ({
        ...server('ot', ['chung'], 'Ôn thi'),
        channels: [channel('chung'), studyRoom()]
    })
    const sessionIn = () =>
        list()
            ?.flatMap((one) => one.channels)
            .find((one) => one.id === 'im-lang')?.focusSession

    beforeEach(() => {
        vi.useFakeTimers()
        fetchServer.mockReset()
        client = new QueryClient()
        client.setQueryData(userKeys.profile(), { id: 'an' })
        client.setQueryData(serverKeys.list(), [withStudyRoom()])
        stop = listenForServers(client, notices)
    })
    afterEach(() => {
        stop()
        vi.useRealTimers()
    })

    it('puts each later state told on the room, as GET /servers has it, and none once it ended', () => {
        emitRealtimeEvent('focus_session.started', at(1, { action: 'start' }))
        expect(sessionIn()).toMatchObject({ id: 's1', version: 1, status: 'running' })
        expect(sessionIn()).not.toHaveProperty('channelId')
        emitRealtimeEvent(
            'focus_session.updated',
            at(3, { status: 'paused', phaseEndsAt: null, pausedRemainingMs: 60_000 })
        )
        // Older than the one held: dropped, whichever way it came.
        emitRealtimeEvent('focus_session.updated', at(2))
        expect(sessionIn()).toMatchObject({ version: 3, status: 'paused' })
        emitRealtimeEvent('focus_session.ended', at(4, { status: 'ended', action: 'stop', summaries: [] }))
        expect(sessionIn()).toBeNull()
        // A late event of the session ended brings nothing back.
        emitRealtimeEvent('focus_session.updated', at(3))
        expect(sessionIn()).toBeNull()
        expect(fetchServer).not.toHaveBeenCalled()
    })

    it('drops a state older than the one a read put on the room', () => {
        const read = withStudyRoom()
        const held = roomSessionOf(at(5, { status: 'paused' }) as unknown as FocusSession)
        read.channels[1] = { ...studyRoom(), focusSession: held }
        client.setQueryData(serverKeys.list(), [read])
        emitRealtimeEvent('focus_session.updated', at(4))
        expect(sessionIn()).toMatchObject({ version: 5, status: 'paused' })
    })

    it('keeps a session told while the server was read: the read saw an older one', async () => {
        emitRealtimeEvent('focus_session.started', at(1, { action: 'start' }))
        let answer!: (value: Server) => void
        fetchServer.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
        emitRealtimeEvent('channel.updated', { serverId: 'ot' })
        await settle()
        emitRealtimeEvent('focus_session.updated', at(2, { status: 'paused', phaseEndsAt: null, pausedRemainingMs: 1 }))
        answer({ ...withStudyRoom(), name: 'Ôn thi 2' })
        await settle()
        expect(list()?.[0]?.name).toBe('Ôn thi 2')
        expect(sessionIn()).toMatchObject({ version: 2, status: 'paused' })
    })
})
