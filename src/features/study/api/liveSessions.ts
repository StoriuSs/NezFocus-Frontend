import type { QueryClient } from '@tanstack/react-query'
import { onRealtimeEvent } from '@/features/realtime'
import { noteServerTime } from '@/lib/server-clock'
import { isLater } from '../lib/phases'
import { hearNews } from '../study.store'
import type { FocusSession, SessionNews, StudyToday } from '../types'
import { studyKeys } from './keys'

/** Where a room's session goes once told: the servers feature keeps it on its room (D-231 L5-b). */
export type SessionSink = (session: FocusSession) => void

const SESSION_EVENTS = ['focus_session.started', 'focus_session.updated', 'focus_session.ended']

interface StreakNews {
    current: number
    longest: number
    todaySeconds: number
    countedUntil: string | null
}

/** A query client listening: its sink, and each room's latest state told to it. */
interface Listener {
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

/**
 * A room's session as the server just told it (the answer to a command
 * this tab sent): its clock taken, then handed to the sinks, unless a later
 * state of it was told already. Ended, it is still handed on: the room no
 * longer has one.
 */
export function tellSession(session: FocusSession): boolean {
    noteServerTime(session.serverTime)
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
 * replaces today's numbers held, unless they are of a later count
 * (`counted_until`, D-231). Returns the way to stop (the first call only).
 */
export function listenForSessions(client: QueryClient, sink: SessionSink): () => void {
    if (listening.has(client)) return () => undefined
    listening.add(client)
    const listener: Listener = { sink, latest: new Map() }
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
                held?.countedUntil && told.countedUntil && held.countedUntil > told.countedUntil
                    ? held
                    : { todaySeconds: told.todaySeconds, countedUntil: told.countedUntil, streak: told.current }
            )
        }),
        // Live again: today's numbers may have moved meanwhile (the room's sessions come with GET /servers).
        onRealtimeEvent('ready', () => void client.invalidateQueries({ queryKey: studyKeys.today() }))
    ]
    return () => {
        for (const stop of stops) stop()
        listeners.delete(listener)
        listening.delete(client)
    }
}
