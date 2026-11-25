import { describe, expect, it } from 'vitest'
import type { RoomSession } from '@/features/study'
import {
    activityParts,
    activitySentence,
    activityShown,
    activityView,
    clockOf,
    type Activity,
    type ActivityForm,
    type ActivityWords
} from '../lib/activity-line'
import type { SeenRoom } from '../lib/room-lookup'

const NOW = Date.parse('2026-11-25T10:00:00.000Z')
const inMinutes = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()

const WORDS: ActivityWords = {
    phase: (phase) => ({ focus: 'Tập trung', short_break: 'Nghỉ ngắn', long_break: 'Nghỉ dài' })[phase],
    paused: 'Tạm dừng',
    waiting: 'Hết giờ nghỉ',
    waitingShort: 'hết giờ nghỉ',
    solo: 'Một mình',
    soloFull: 'Đang học một mình',
    inRoom: (room) => `Đang ở ${room}`,
    unseenStudy: 'Đang học cùng nhóm',
    unseenVoice: 'Đang ở một phòng voice'
}
const left = (minutes: number) => (minutes > 0 ? `còn ${minutes} phút` : 'còn dưới 1 phút')

const session = (more: Partial<RoomSession> = {}) =>
    ({
        status: 'running',
        phase: 'focus',
        phaseEndsAt: inMinutes(18.5),
        pausedRemainingMs: null,
        ...more
    }) as RoomSession

const room = (more: Partial<SeenRoom> = {}): SeenRoom => ({
    name: 'Phòng học im lặng',
    isStudyRoom: true,
    session: session(),
    ...more
})

const inStudyRoom: Activity = { room: 'study', solo: null }
const inVoiceRoom: Activity = { room: 'voice', solo: null }
const solo = (status: 'running' | 'paused' | 'waiting', phase: 'focus' | 'short_break' = 'focus'): Activity => ({
    room: null,
    solo: { status, phase, phaseEndsAt: status === 'running' ? inMinutes(105.2) : null }
})

function says(activity: Activity, seen: SeenRoom | null, form: ActivityForm) {
    const view = activityView(activity, seen, true)
    return view ? activitySentence(activityParts(view, form, NOW, WORDS), left) : null
}

describe('activityShown: where a line may show at all (C-30, D-252 4d)', () => {
    it.each([
        ['online, open', 'online', true, true],
        ['away, open', 'idle', true, true],
        ['do not disturb, open', 'dnd', true, true],
        ['offline', 'offline', true, false],
        ['presence not mine to see', null, true, false],
        ['blocked or cannot message', 'online', false, false]
    ] as const)('%s', (_, presence, open, shown) => {
        expect(activityShown(presence, open)).toBe(shown)
    })
})

describe('activityView: which line one may see (C-30, D-240, D-252)', () => {
    it('puts a room before a Solo', () => {
        expect(activityView({ room: 'study', solo: solo('running').solo }, room(), true)).toMatchObject({
            kind: 'session'
        })
    })

    it('waits for my servers before saying anything of a room (no "Đang học cùng nhóm" turning into its name)', () => {
        expect(activityView(inStudyRoom, undefined, true)).toBeNull()
        // A Solo needs no room.
        expect(activityView(solo('paused'), undefined, true)).toMatchObject({ kind: 'solo' })
    })

    it('shows nothing with no activity, or where the place says not (offline, blocked, cannot message)', () => {
        expect(activityView(null, room(), true)).toBeNull()
        expect(activityView(inStudyRoom, room(), false)).toBeNull()
        expect(activityView(solo('running'), null, false)).toBeNull()
    })

    it('names a room one sees, with its session running or paused; else the room alone', () => {
        expect(activityView(inStudyRoom, room(), true)).toMatchObject({ kind: 'session', room: 'Phòng học im lặng' })
        expect(activityView(inStudyRoom, room({ session: session({ status: 'paused' }) }), true)).toMatchObject({
            kind: 'session'
        })
        expect(
            activityView(inVoiceRoom, room({ name: 'Phòng thảo luận', isStudyRoom: false, session: null }), true)
        ).toEqual({ kind: 'room', room: 'Phòng thảo luận', study: false })
    })

    it('says only the kind of room for a room one does not see: no name, no time (D-79)', () => {
        expect(activityView(inStudyRoom, null, true)).toEqual({ kind: 'unseen', study: true })
        expect(activityView(inVoiceRoom, null, true)).toEqual({ kind: 'unseen', study: false })
    })

    it('reads the clock of a room’s session or of a Solo, none otherwise', () => {
        expect(clockOf(activityView(inStudyRoom, room(), true))).toMatchObject({ status: 'running' })
        expect(clockOf(activityView(solo('running'), null, true))).toEqual({
            status: 'running',
            phaseEndsAt: inMinutes(105.2)
        })
        expect(clockOf(activityView(inStudyRoom, null, true))).toBeNull()
    })
})

describe('the words of the line (C-30, D-252 4)', () => {
    const cases: [string, Activity, SeenRoom | null, string, string, string][] = [
        [
            'a session running in a room one sees',
            inStudyRoom,
            room(),
            'Tập trung · còn 18 phút',
            'Tập trung · còn 18 phút · Phòng học im lặng',
            'Tập trung · còn 18 phút · Phòng học im lặng'
        ],
        [
            'a short break',
            inStudyRoom,
            room({ session: session({ phase: 'short_break', phaseEndsAt: inMinutes(4.2) }) }),
            'Nghỉ ngắn · còn 4 phút',
            'Nghỉ ngắn · còn 4 phút · Phòng học im lặng',
            'Nghỉ ngắn · còn 4 phút · Phòng học im lặng'
        ],
        [
            'the last minute',
            inStudyRoom,
            room({ session: session({ phaseEndsAt: inMinutes(0.5) }) }),
            'Tập trung · còn dưới 1 phút',
            'Tập trung · còn dưới 1 phút · Phòng học im lặng',
            'Tập trung · còn dưới 1 phút · Phòng học im lặng'
        ],
        [
            'a session paused: no number',
            inStudyRoom,
            room({ name: 'Phòng thi thử cuối kỳ', session: session({ status: 'paused', pausedRemainingMs: 600_000 }) }),
            'Tạm dừng',
            'Tạm dừng · Phòng thi thử cuối kỳ',
            'Tạm dừng · Phòng thi thử cuối kỳ'
        ],
        [
            'a room with no session',
            inVoiceRoom,
            room({ name: 'Phòng thảo luận nhóm', isStudyRoom: false, session: null }),
            'Đang ở Phòng thảo luận nhóm',
            'Đang ở Phòng thảo luận nhóm',
            'Đang ở Phòng thảo luận nhóm'
        ],
        [
            'a study room one does not see',
            inStudyRoom,
            null,
            'Đang học cùng nhóm',
            'Đang học cùng nhóm',
            'Đang học cùng nhóm'
        ],
        [
            'a voice room one does not see',
            inVoiceRoom,
            null,
            'Đang ở một phòng voice',
            'Đang ở một phòng voice',
            'Đang ở một phòng voice'
        ],
        [
            'a Solo running: the short form names no phase',
            solo('running'),
            null,
            'Một mình · còn 105 phút',
            'Đang học một mình · Tập trung · còn 105 phút',
            'Tập trung · còn 105 phút · Đang học một mình'
        ],
        [
            'a Solo paused',
            solo('paused'),
            null,
            'Một mình · Tạm dừng',
            'Đang học một mình · Tạm dừng',
            'Tạm dừng · Đang học một mình'
        ],
        [
            'a Solo whose break is over',
            solo('waiting', 'short_break'),
            null,
            'Một mình · hết giờ nghỉ',
            'Đang học một mình · Hết giờ nghỉ',
            'Hết giờ nghỉ · Đang học một mình'
        ]
    ]

    it.each(cases)('%s', (_, activity, seen, short, full, block) => {
        expect(says(activity, seen, 'short')).toBe(short)
        expect(says(activity, seen, 'full')).toBe(full)
        expect(says(activity, seen, 'block')).toBe(block)
    })

    it('puts the room after the minutes, never cut (the tail), and under the phase in the block', () => {
        const view = activityView(inStudyRoom, room(), true)!
        expect(activityParts(view, 'full', NOW, WORDS)).toMatchObject({
            lead: 'Tập trung',
            left: 18,
            tail: 'Phòng học im lặng',
            below: null
        })
        expect(activityParts(view, 'block', NOW, WORDS)).toMatchObject({ tail: null, below: 'Phòng học im lặng' })
    })

    it('gives each case its icon: the phase’s, pause, the break over, the room’s kind', () => {
        const icon = (activity: Activity, seen: SeenRoom | null) =>
            activityParts(activityView(activity, seen, true)!, 'short', NOW, WORDS).icon
        expect(icon(inStudyRoom, room())).toEqual({ kind: 'phase', phase: 'focus' })
        expect(icon(inStudyRoom, room({ session: session({ status: 'paused' }) }))).toEqual({ kind: 'pause' })
        expect(icon(solo('paused'), null)).toEqual({ kind: 'pause' })
        expect(icon(solo('waiting'), null)).toEqual({ kind: 'waiting' })
        expect(icon(inVoiceRoom, null)).toEqual({ kind: 'room', study: false })
        expect(icon(inStudyRoom, room({ session: null }))).toEqual({ kind: 'room', study: true })
    })
})
