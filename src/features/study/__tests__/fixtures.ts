import type { FocusSession, SessionNews } from '../types'

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
