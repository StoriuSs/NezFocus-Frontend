import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { noteServerTime } from '@/lib/server-clock'
import { isLater, sessionCycle } from '../lib/phases'
import { isLaterRead } from '../lib/today'
import { hearLeft, hearNews, hearSoloEnded, type SessionLeft } from '../study.store'
import type { FocusSession, SessionNews, SoloState, StudyToday } from '../types'
import { studyKeys } from './keys'

/** Where a room's session goes once told: the servers feature keeps it on its room (D-231 L5-b). */
export type SessionSink = (session: FocusSession) => void

const SESSION_EVENTS = ['focus_session.started', 'focus_session.updated', 'focus_session.ended']

interface StreakNews {
    current: number
    longest: number
    todaySeconds: number
    countedUntil: string | null
    readAt: string
}

/** A query client listening: its sink, and each room's latest state told to it. */
interface Listener {
    client: QueryClient
    sink: SessionSink
    latest: Map<string, FocusSession>
}

const listeners = new Set<Listener>()
const listening = new WeakSet<QueryClient>()

/** Hands a state to one listener's sink, unless a later one (or this one) was told already (D-225). */
function tellTo(listener: Listener, session: FocusSession): boolean {
    const channelId = session.channelId
    if (!channelId) return false
    const held = listener.latest.get(channelId)
    if (held && !isLater(session, held)) return false
    listener.latest.set(channelId, session)
    listener.sink(session)
    return true
}

/** Each query client's latest state of one's Solo told, and when: an older one coming after changes nothing (D-225). */
const latestSolo = new WeakMap<QueryClient, { session: FocusSession; at: number }>()

/** The latest state of one's Solo told to `client`, and when (`Date.now()`): a read that comes back after it does not undo it. */
export const latestSoloOf = (client: QueryClient): { session: FocusSession; at: number } | undefined =>
    latestSolo.get(client)

/**
 * One's Solo as the server just told it (`solo_session.updated`, the answer
 * to a command), into the query client's GET /me/solo-session, unless a later
 * state was told already (D-225); the next start's cycle is its own (D-103).
 * Ended: none held any more, and its summary to the study store (D-234).
 */
export function tellSolo(client: QueryClient, session: FocusSession): void {
    noteServerTime(session.serverTime)
    const last = latestSolo.get(client)?.session
    if (last && !isLater(session, last)) return
    latestSolo.set(client, { session, at: Date.now() })
    if (session.status === 'ended') {
        hearSoloEnded(session)
        const held = client.getQueryData<SoloState>(studyKeys.solo())
        if (held) client.setQueryData<SoloState>(studyKeys.solo(), { ...held, session: null })
        return
    }
    client.setQueryData<SoloState>(studyKeys.solo(), { session, startCycle: sessionCycle(session) })
}

/**
 * A session as the server just told it (the answer to a command this tab
 * sent): its clock taken, then a room's handed to the sinks, unless a later
 * state of it was told already (ended, it is still handed on: the room no
 * longer has one); a Solo into each query client (`tellSolo`).
 */
export function tellSession(session: FocusSession): boolean {
    noteServerTime(session.serverTime)
    if (session.kind === 'solo') {
        for (const listener of listeners) tellSolo(listener.client, session)
        return listeners.size > 0
    }
    let told = false
    for (const listener of listeners) told = tellTo(listener, session) || told
    return told
}

/**
 * Hears the rooms' sessions (`focus_session.*`, SRS 5.2) and one's own day
 * (`streak.updated`), once per query client (as listenForServers): each
 * later state goes to the sink, and its word (who did what, the end's
 * seconds) to the study store, also when a command's answer brought the
 * same state first (an answer has no word of who did it). `streak.updated`
 * replaces today's numbers held, unless they were read later (`read_at`,
 * D-232: two reads may come in either order); told as a participation
 * opens too, and with `counted_until` null once in no session. `focus_session.left`
 * (one's seconds in a session as one's place closes, D-233) goes to the
 * study store. Returns the way to stop (the first call only).
 */
export function listenForSessions(client: QueryClient, sink: SessionSink): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const listener: Listener = { client, sink, latest: new Map() }
    listeners.add(listener)
    const stops = [
        ...SESSION_EVENTS.map((event) =>
            onRealtimeEvent(event, (data) => {
                const news = data as SessionNews
                noteServerTime(news.serverTime)
                const held = news.channelId ? listener.latest.get(news.channelId) : undefined
                const answered = held?.id === news.id && held.version === news.version
                if (tellTo(listener, news) || answered) hearNews(news)
            })
        ),
        onRealtimeEvent('streak.updated', (data) => {
            const told = data as StreakNews
            client.setQueryData<StudyToday>(studyKeys.today(), (held) =>
                held && isLaterRead(held, told)
                    ? held
                    : {
                          todaySeconds: told.todaySeconds,
                          countedUntil: told.countedUntil,
                          streak: told.current,
                          readAt: told.readAt
                      }
            )
            // A count: the Stats page's numbers and history read again, what was counted from the backend (D-235).
            void client.invalidateQueries({ queryKey: studyKeys.periods() })
            void client.invalidateQueries({ queryKey: studyKeys.histories() })
        }),
        // One's Solo, from its start to its end, in each tab and device (D-222).
        onRealtimeEvent('solo_session.updated', (data) => tellSolo(client, data as FocusSession)),
        // One's place in a room's session closed: one's seconds in it, for the toast of leaving (D-233).
        onRealtimeEvent('focus_session.left', (data) => hearLeft(data as SessionLeft)),
        // Live again: today's numbers may have moved meanwhile (the room's sessions come with GET /servers).
        onRealtimeEvent('ready', () => {
            void client.invalidateQueries({ queryKey: studyKeys.today() })
            void client.invalidateQueries({ queryKey: studyKeys.periods() })
            void client.invalidateQueries({ queryKey: studyKeys.histories() })
            // One's Solo may have moved, or ended, meanwhile.
            void client.invalidateQueries({ queryKey: studyKeys.solo() })
        })
    ]
    return () => {
        for (const stop of stops) stop()
        listeners.delete(listener)
        listening.delete(client)
    }
}
