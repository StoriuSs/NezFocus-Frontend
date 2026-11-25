import { minutesLeft, remainingMs, type AnySession, type RoomSession } from '@/features/study'
import type { SessionPhase } from '@/lib/phase-colors'
import type { Dm, Presence } from '../types'
import type { SeenRoom } from './room-lookup'

/**
 * What someone studies now, the same for every viewer (D-240, D-247): the
 * kind of room they are in, or their Solo. The member list, the
 * relationships, the DMs and the profile all carry it in this shape.
 */
export type Activity = NonNullable<Dm['activity']>
export type SoloActivity = NonNullable<Activity['solo']>

/**
 * The activity as I may see it (D-79, D-240, D-252): a room I see with its
 * session running or paused (`session`), a room I see with no session
 * (`room`), a room I do not see (`unseen`: no name, no time), or a Solo.
 */
export type ActivityView =
    | { kind: 'session'; session: RoomSession; room: string }
    | { kind: 'room'; room: string; study: boolean }
    | { kind: 'unseen'; study: boolean }
    | { kind: 'solo'; solo: SoloActivity }

/**
 * Which line, if any (C-30, D-252 4): none when they show nothing
 * (`activity` null: hidden, the switch off, in a call, nowhere) or when the
 * place says it must not show (`shown` false: they are offline, I blocked
 * them, I may not message them). A room wins over a Solo. A room of theirs
 * I see gives its name and session from my servers' data; one I do not
 * see, the general words. Nothing for a room while my servers are not read
 * yet (`seen` undefined): "Đang học cùng nhóm" would turn into the room's
 * name a moment later.
 */
export function activityView(
    activity: Activity | null,
    seen: SeenRoom | null | undefined,
    shown: boolean
): ActivityView | null {
    if (!shown || !activity) return null
    if (activity.room) {
        if (seen === undefined) return null
        if (!seen) return { kind: 'unseen', study: activity.room === 'study' }
        const session = seen.session
        if (session && (session.status === 'running' || session.status === 'paused'))
            return { kind: 'session', session, room: seen.name }
        return { kind: 'room', room: seen.name, study: seen.isStudyRoom }
    }
    return activity.solo ? { kind: 'solo', solo: activity.solo } : null
}

/**
 * Whether a place may show someone's line at all (C-30, D-252 4d): never
 * while they are offline or their presence is not mine to see, nor where I
 * blocked them or may not message them (`open`: a DM `open`, someone not
 * blocked in a server's list).
 */
export const activityShown = (presence: Presence | null, open: boolean): boolean =>
    open && presence !== null && presence !== 'offline'

/** The phase's clock as the line reads it: a room's session, or the phase of a Solo. */
export function clockOf(view: ActivityView | null): Pick<AnySession, 'status' | 'phaseEndsAt'> | null {
    if (view?.kind === 'session') return view.session
    if (view?.kind === 'solo') return { status: view.solo.status, phaseEndsAt: view.solo.phaseEndsAt }
    return null
}

/** The screen's words for the line (`common`, shell.activity and shell.study). */
export interface ActivityWords {
    phase: (phase: SessionPhase) => string
    /** "Tạm dừng". */
    paused: string
    /** "Hết giờ nghỉ" (the full form and the block). */
    waiting: string
    /** "hết giờ nghỉ" (after "Một mình · "). */
    waitingShort: string
    /** "Một mình". */
    solo: string
    /** "Đang học một mình". */
    soloFull: string
    /** "Đang ở {room}". */
    inRoom: (room: string) => string
    /** "Đang học cùng nhóm". */
    unseenStudy: string
    /** "Đang ở một phòng voice". */
    unseenVoice: string
}

/**
 * The line's icon: the phase's (its colour), `pause` and the rooms'
 * (`text-secondary`), `coffee` for a Solo whose break is over (C-30).
 */
export type ActivityIcon =
    | { kind: 'phase'; phase: SessionPhase }
    | { kind: 'pause' }
    | { kind: 'waiting' }
    | { kind: 'room'; study: boolean }

/**
 * The line in parts (C-30): the words before the minutes (`lead`, cut
 * first), the minutes left (`left`: never cut; null when no number shows),
 * and what follows them (`tail`, the room's name in the full form). The
 * block (C-50, S-CHAT-05 › Khối hoạt động) has the phase on its first line
 * and the room's name, or "Đang học một mình", under it (`below`).
 */
export interface ActivityParts {
    icon: ActivityIcon
    lead: string
    left: number | null
    tail: string | null
    below: string | null
}

/**
 * - `short`: DMRow, MemberRow ("Tập trung · còn 18 phút", "Một mình · còn 105 phút");
 * - `full`: FriendRow, the DM header ("Tập trung · còn 18 phút · Phòng học im lặng",
 *   "Đang học một mình · Tập trung · còn 105 phút");
 * - `block`: the profile's block, two lines.
 */
export type ActivityForm = 'short' | 'full' | 'block'

export function activityParts(
    view: ActivityView,
    form: ActivityForm,
    now: number,
    words: ActivityWords
): ActivityParts {
    const none = { left: null, tail: null, below: null }
    switch (view.kind) {
        case 'session': {
            const paused = view.session.status === 'paused'
            return {
                icon: paused ? { kind: 'pause' } : { kind: 'phase', phase: view.session.phase },
                lead: paused ? words.paused : words.phase(view.session.phase),
                left: paused ? null : minutesLeft(remainingMs(view.session, now)),
                tail: form === 'full' ? view.room : null,
                below: form === 'block' ? view.room : null
            }
        }
        case 'room':
            return { ...none, icon: { kind: 'room', study: view.study }, lead: words.inRoom(view.room) }
        case 'unseen':
            return {
                ...none,
                icon: { kind: 'room', study: view.study },
                lead: view.study ? words.unseenStudy : words.unseenVoice
            }
        case 'solo': {
            const { status, phase, phaseEndsAt } = view.solo
            const below = form === 'block' ? words.soloFull : null
            // "Một mình · …" in a row, "Đang học một mình · …" in the full form; the block says it under the phase.
            const before = (what: string | null) =>
                form === 'block'
                    ? (what ?? '')
                    : [form === 'short' ? words.solo : words.soloFull, what].filter(Boolean).join(' · ')
            if (status === 'waiting')
                return {
                    ...none,
                    icon: { kind: 'waiting' },
                    lead: before(form === 'short' ? words.waitingShort : words.waiting),
                    below
                }
            if (status === 'paused') return { ...none, icon: { kind: 'pause' }, lead: before(words.paused), below }
            return {
                icon: { kind: 'phase', phase },
                // The short form names no phase: its icon and colour say it (C-30).
                lead: before(form === 'short' ? null : words.phase(phase)),
                left: phaseEndsAt ? minutesLeft(Math.max(0, Date.parse(phaseEndsAt) - now)) : null,
                tail: null,
                below
            }
        }
    }
}

/** The whole sentence (the Tooltip, screen readers): the parts joined by " · ", the block's lines too. */
export function activitySentence(parts: ActivityParts, left: (minutes: number) => string): string {
    return [parts.lead, parts.left === null ? null : left(parts.left), parts.tail, parts.below]
        .filter((part): part is string => Boolean(part))
        .join(' · ')
}
