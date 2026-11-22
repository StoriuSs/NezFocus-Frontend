import type { QueryClient } from '@tanstack/react-query'
import { forgetChannels } from '@/features/messaging'
import { onRealtimeEvent } from '@/features/realtime'
import { listenForSessions, type FocusSession } from '@/features/study'
import { userKeys, type UserProfile } from '@/features/users'
import { getApiErrorInfo, getApiErrorType, retryAfterSeconds } from '@/lib/api-error'
import { reportError } from '@/lib/error-tracking'
import { withRoomPeople, withRoomSession } from '../lib/room-people'
import type { RoomPerson, Server } from '../types'
import { serverKeys } from './keys'
import { fetchServer } from './servers.api'
import { forgetServer } from './useServers'

/** Who removed one from a server (`member.left` on their own tabs). */
export type RemovedBy = 'kick' | 'ban'

/** What the person is told: the page and its Toasts are the shell's (useServerGoneWatch). */
export interface ServerNotices {
    /** A server of theirs was deleted, as it was when it went. */
    deleted: (server: Server) => void
    /** They were kicked or banned from it (S-MOD-02, L9b). */
    removed: (server: Server, by: RemovedBy, reason: string | null) => void
}

/** A voice room's whole list (`voice_state.updated`, D-205). */
interface RoomNews {
    channelId: string
    voiceStates: RoomPerson[]
}

interface ServerNews {
    serverId: string
}
interface MemberNews extends ServerNews {
    userId: string
    /** On their own tabs only, when they left (`null`: by themselves). */
    removedBy?: RemovedBy | null
    reason?: string | null
}

/** Events after which one reads the server again: its channels, roles, members, name or owner changed. */
const READ_AGAIN = [
    'server.updated',
    'channel.created',
    'channel.updated',
    'channel.deleted',
    'category.created',
    'category.updated',
    'category.deleted',
    'role.created',
    'role.updated',
    'role.deleted',
    'member.joined',
    'member.updated',
    'member.left'
]

/** Which lists of a server each event makes old: the open ones are read again (data-fetching.md). */
const MAKES_OLD: Record<string, ((serverId: string) => readonly unknown[])[]> = {
    // A new owner shows in the members' table.
    'server.updated': [serverKeys.members],
    'invite.created': [serverKeys.invites],
    'invite.deleted': [serverKeys.invites],
    'ban.deleted': [serverKeys.bans],
    'role.created': [serverKeys.roles],
    'role.updated': [serverKeys.roles, serverKeys.members],
    'role.deleted': [serverKeys.roles, serverKeys.members],
    // A link used up leaves the invites page (04 S-SET-04).
    'member.joined': [serverKeys.members, serverKeys.invites],
    'member.updated': [serverKeys.members, serverKeys.roles],
    'member.left': [serverKeys.members, serverKeys.roles, serverKeys.bans]
}

/** A read again waits this long after the first event, so a burst is one read... */
const GATHER_MS = 300
/** ...and up to this much more, at random, so a server's members do not all ask at once (D-178). */
const SPREAD_MS = 500
/** A read that failed for a while (no answer, 408, 429, 5xx) is tried again this much later, twice at most. */
const RETRY_MS = 2000
const RETRIES = 2
/** A timeout over is read this long after its end, so the API's clock has passed it too. */
const END_MARGIN_MS = 1000
/** Read past its end and still timed out (the API's clock behind this one): read again RETRY_MS later, this many times at most. */
const LATE_READS = 4

const passing = (error: unknown) => {
    const { status } = getApiErrorInfo(error)
    return status === undefined || status === 408 || status === 429 || status >= 500
}

const listening = new WeakSet<QueryClient>()

/**
 * Keeps the servers live from socket events (D-178): each event names only
 * the server, and one reads it again as one may see it (`GET /servers/{id}`),
 * once for events close together, into its place in the list. The lists of
 * that server a change touches (invites, roles, members, bans) are marked
 * old, so the open ones are read again. A server deleted, or one they were
 * removed from, leaves at once, and they are told (`notices`); one they left
 * in another tab leaves without a word. Channels no longer listed take their
 * histories with them (`forgetChannels`). When the socket is live again
 * (`ready`), everything is read again but the member panel, which does so
 * itself: events missed meanwhile are not sent again (ARCHITECTURE 3.4).
 *
 * A read answered after the list changed meanwhile (the server gone, a
 * change this tab made) is not written: it would bring back what went, or
 * undo what was done; the server is read again unless it went. A read is
 * only ever written into a list already held: an event never makes one. A
 * server this tab is deleting itself is left to its dialog.
 *
 * Who is in each voice room comes whole with `voice_state.updated` (D-205):
 * the room's list is swapped at once, no read. It is not a change that makes
 * a read answered meanwhile old, so that read is still written; but its rooms
 * told since it began keep the list told, newer than what the read saw. The
 * same for every read of the whole list, whoever asked for it (`ready`, L2-e;
 * a change this tab made).
 *
 * A voice room's study session the same (D-231 L5-b): each state told (a
 * `focus_session.*` event, the answer to a command this tab sent, heard
 * through the study feature's `listenForSessions`) goes on its room at once
 * when later than the one held (D-225), and is kept over a read begun before
 * it, which saw an older one.
 *
 * A timeout ends with no event: a server whose timeout runs is read again
 * once it is over, for the channels it gives back (the composer opens again,
 * 02 `timed-out`). Given, changed or lifted, the read that tells of it moves
 * that time.
 *
 * Once per query client, for as long as the app runs (as liveMessages);
 * returns the way to stop (the first call only; tests use it).
 */
export function listenForServers(client: QueryClient, notices: ServerNotices): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const me = () => client.getQueryData<UserProfile>(userKeys.profile())?.id
    const listed = (serverId: string) =>
        client.getQueryData<Server[]>(serverKeys.list())?.find((server) => server.id === serverId)
    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const reading = new Set<string>()
    /** Each server whose timeout runs: when it ends, and the read waiting for then. */
    const ends = new Map<string, { until: string; timer: ReturnType<typeof setTimeout> }>()
    /** Reads made past the end of a timeout the server still had. */
    const late = new Map<string, { until: string; reads: number }>()
    const again = new Set<string>()
    const failures = new Map<string, number>()
    let stopped = false
    // Each change to the list, whoever made it: a read answered after one is not written.
    let version = 0
    // A room's list swapped is not such a change (the cache tells its listeners at once, inside the write).
    let swapping = false
    /** Each room's last list told, and when (a count of lists told): put back over a read older than it. */
    const told = new Map<string, { at: number; people: RoomPerson[] }>()
    /** Each room's last session told, and when (the same count). */
    const toldSessions = new Map<string, { at: number; session: FocusSession }>()
    let tellings = 0
    /** The lists told when the list's current read (GET /servers, whoever asked for it) began. */
    let listReadFrom: number | null = null
    const listHash = JSON.stringify(serverKeys.list())
    const stopVersions = client.getQueryCache().subscribe((event) => {
        if (swapping) return
        if (event.type !== 'updated' || event.query.queryHash !== listHash) return
        const { action } = event
        if (action.type === 'fetch') listReadFrom = tellings
        if (action.type === 'error') listReadFrom = null
        if (action.type === 'success' && !action.manual && listReadFrom !== null) {
            const since = listReadFrom
            listReadFrom = null
            // After the cache has told everyone of the read, not inside its telling.
            queueMicrotask(() => {
                if (!stopped) keepToldSince(since)
            })
        }
        if (action.type === 'success') {
            version += 1
            followTimeouts()
        }
    })

    /**
     * A read waiting for the end of each timeout the list holds, and none for
     * one lifted. A server read past its end still timed out (the API's clock
     * behind) is read again a little later, a few times; then the next event
     * or `ready` reads it.
     */
    function followTimeouts(): void {
        const held = new Map<string, string>()
        for (const server of client.getQueryData<Server[]>(serverKeys.list()) ?? []) {
            if (server.timeoutUntil) held.set(server.id, server.timeoutUntil)
        }
        for (const [serverId, end] of ends) {
            if (held.get(serverId) === end.until) continue
            clearTimeout(end.timer)
            ends.delete(serverId)
        }
        for (const [serverId, tries] of late) if (held.get(serverId) !== tries.until) late.delete(serverId)
        for (const [serverId, until] of held) {
            if (ends.has(serverId)) continue
            let wait = Date.parse(until) - Date.now() + END_MARGIN_MS
            if (wait <= END_MARGIN_MS) {
                const reads = late.get(serverId)?.reads ?? 0
                if (reads >= LATE_READS) continue
                late.set(serverId, { until, reads: reads + 1 })
                wait = RETRY_MS
            }
            const timer = setTimeout(() => {
                ends.delete(serverId)
                schedule(serverId)
            }, wait)
            ends.set(serverId, { until, timer })
        }
    }

    function swapPeople(channelId: string, people: RoomPerson[]): void {
        swap((servers) => withRoomPeople(servers, channelId, people))
    }

    function swapSession(session: FocusSession): void {
        swap((servers) => withRoomSession(servers, session))
    }

    /** A room's change written at once, as not a change that makes a read answered meanwhile old. */
    function swap(change: (servers: Server[] | undefined) => Server[] | undefined): void {
        const servers = client.getQueryData<Server[]>(serverKeys.list())
        const next = change(servers)
        if (next === servers) return
        swapping = true
        try {
            client.setQueryData<Server[]>(serverKeys.list(), next)
        } finally {
            swapping = false
        }
    }

    /** The rooms told since `since` keep the list told: a read begun before it saw an older one. */
    function keepToldSince(since: number): void {
        for (const [channelId, { at, people }] of told) if (at > since) swapPeople(channelId, people)
        for (const { at, session } of toldSessions.values()) if (at > since) swapSession(session)
    }

    function gone(serverId: string): Server | undefined {
        const server = listed(serverId)
        clearTimeout(timers.get(serverId))
        timers.delete(serverId)
        again.delete(serverId)
        forgetServer(client, serverId)
        return server
    }

    /** Puts a server read again in its place, its channels no longer listed forgotten. */
    function put(server: Server, before: Server | undefined): void {
        client.setQueryData<Server[]>(serverKeys.list(), (servers) => {
            if (!servers) return servers
            return servers.some((known) => known.id === server.id)
                ? servers.map((known) => (known.id === server.id ? server : known))
                : [...servers, server]
        })
        const kept = new Set(server.channels.map((channel) => channel.id))
        forgetChannels(
            client,
            (before?.channels ?? []).map((channel) => channel.id).filter((id) => !kept.has(id))
        )
    }

    async function read(serverId: string): Promise<void> {
        timers.delete(serverId)
        reading.add(serverId)
        const before = listed(serverId)
        const seen = version
        const toldBefore = tellings
        try {
            const server = await fetchServer(serverId)
            failures.delete(serverId)
            if (stopped || !client.getQueryData(serverKeys.list())) return
            if (version !== seen) {
                // Gone meanwhile: stays gone. Changed meanwhile: read once more, the change made.
                if (!before || listed(serverId)) again.add(serverId)
                return
            }
            put(server, before)
            keepToldSince(toldBefore)
        } catch (error) {
            const type = getApiErrorType(error)
            // Not theirs any more (left, removed, deleted meanwhile): it goes.
            if (type === 'NOT_FOUND_ERROR') return void gone(serverId)
            // Not an answer of the API: a bug of the app, reported, not tried again.
            if (type === undefined) return void reportError(error, { socketEvent: 'server.read' })
            const tries = (failures.get(serverId) ?? 0) + 1
            if (passing(error) && tries <= RETRIES && !stopped) {
                failures.set(serverId, tries)
                timers.set(
                    serverId,
                    setTimeout(() => void read(serverId), (retryAfterSeconds(error) ?? 0) * 1000 || RETRY_MS)
                )
            } else failures.delete(serverId)
        } finally {
            reading.delete(serverId)
            if (again.delete(serverId)) schedule(serverId)
        }
    }

    function schedule(serverId: string): void {
        if (stopped) return
        if (reading.has(serverId)) return void again.add(serverId)
        if (timers.has(serverId)) return
        timers.set(
            serverId,
            setTimeout(() => void read(serverId), GATHER_MS + Math.random() * SPREAD_MS)
        )
    }

    followTimeouts()
    const stops = [
        listenForSessions(client, (session) => {
            if (!session.channelId) return
            tellings += 1
            toldSessions.set(session.channelId, { at: tellings, session })
            swapSession(session)
        }),
        ...READ_AGAIN.map((event) =>
            onRealtimeEvent(event, (data) => {
                const news = data as MemberNews
                if (event === 'member.left' && ('removedBy' in news || news.userId === me())) {
                    const server = gone(news.serverId)
                    if (server && news.removedBy) notices.removed(server, news.removedBy, news.reason ?? null)
                    return
                }
                schedule(news.serverId)
            })
        ),
        ...Object.entries(MAKES_OLD).map(([event, keys]) =>
            onRealtimeEvent(event, (data) => {
                const { serverId } = data as ServerNews
                for (const key of keys) void client.invalidateQueries({ queryKey: key(serverId) })
            })
        ),
        onRealtimeEvent('server.deleted', (data) => {
            const { serverId } = data as ServerNews
            if (client.isMutating({ mutationKey: serverKeys.deleting(serverId) }) > 0) return
            const server = gone(serverId)
            if (server) notices.deleted(server)
        }),
        onRealtimeEvent('voice_state.updated', (data) => {
            const { channelId, voiceStates } = data as RoomNews
            tellings += 1
            told.set(channelId, { at: tellings, people: voiceStates })
            swapPeople(channelId, voiceStates)
        }),
        onRealtimeEvent('ready', () => {
            void client.invalidateQueries({
                queryKey: serverKeys.all,
                // The member panel reads itself again on `ready` (useMemberPanel).
                predicate: (query) => !(query.queryKey[1] === 'members' && query.queryKey[3] === 'panel')
            })
        })
    ]
    return () => {
        stopped = true
        for (const stop of stops) stop()
        stopVersions()
        for (const timer of timers.values()) clearTimeout(timer)
        timers.clear()
        for (const end of ends.values()) clearTimeout(end.timer)
        ends.clear()
        late.clear()
        again.clear()
        told.clear()
        toldSessions.clear()
        listening.delete(client)
    }
}
