import type { FocusSession, SessionNews } from '@/features/study'

/**
 * World A of 07 at 21:47:18 (Asia/Ho_Chi_Minh, UTC+7): "Phòng học im lặng"
 * runs 25/5 from 21:11, round 2's focus 21:41–22:06, 18:42 left; An hosts.
 */
export const AT = Date.parse('2026-11-22T14:47:18.000Z')

export const session = (more: Partial<FocusSession> = {}): FocusSession => ({
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
    countedSeconds: null,
    version: 3,
    serverTime: '2026-11-22T14:47:18.000Z',
    ...more
})

export const news = (more: Partial<SessionNews> = {}): SessionNews => ({
    ...session(),
    action: 'start',
    actorId: 'an',
    ...more
})

/**
 * World S of 08 at 21:47:18: An's Solo, 50/10 from 21:29:00, round 1's focus
 * to 22:19, 31:42 left, nothing counted yet (its first stretch runs).
 */
export const solo = (more: Partial<FocusSession> = {}): FocusSession =>
    session({
        id: 'solo-1',
        kind: 'solo',
        channelId: null,
        hostId: null,
        focusMinutes: 50,
        shortBreakMinutes: 10,
        phaseIndex: 0,
        phaseStartedAt: '2026-11-22T14:29:00.000Z',
        phaseEndsAt: '2026-11-22T15:19:00.000Z',
        stretchStartedAt: '2026-11-22T14:29:00.000Z',
        startedAt: '2026-11-22T14:29:00.000Z',
        countedSeconds: 0,
        version: 0,
        ...more
    })

/** World S at 22:30:48: the break over at 22:29:00, waiting for Học tiếp until 22:39:00, 50 minutes counted. */
export const waitingSolo = (more: Partial<FocusSession> = {}): FocusSession =>
    solo({
        status: 'waiting',
        phase: 'short_break',
        phaseIndex: 1,
        phaseStartedAt: '2026-11-22T15:19:00.000Z',
        phaseEndsAt: null,
        stretchStartedAt: null,
        waitingUntil: '2026-11-22T15:39:00.000Z',
        countedSeconds: 50 * 60,
        serverTime: '2026-11-22T15:30:48.000Z',
        version: 2,
        ...more
    })
