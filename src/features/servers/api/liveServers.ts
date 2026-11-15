import type { QueryClient } from '@tanstack/react-query'
import { forgetChannels } from '@/features/messaging'
import { onRealtimeEvent } from '@/features/realtime'
import { userKeys, type UserProfile } from '@/features/users'
import { getApiErrorInfo, getApiErrorType, retryAfterSeconds } from '@/lib/api-error'
import { reportError } from '@/lib/error-tracking'
import type { Server } from '../types'
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
    const again = new Set<string>()
    const failures = new Map<string, number>()
    let stopped = false
    // Each change to the list, whoever made it: a read answered after one is not written.
    let version = 0
    const listHash = JSON.stringify(serverKeys.list())
    const stopVersions = client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success' && event.query.queryHash === listHash)
            version += 1
    })

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

    const stops = [
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
        again.clear()
        listening.delete(client)
    }
}
