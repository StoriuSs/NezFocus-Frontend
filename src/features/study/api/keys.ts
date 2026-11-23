import type { StatsView } from '../lib/periods'

/** Query keys for the study feature (data-fetching.md). */
export const studyKeys = {
    all: ['study'] as const,
    /** One's day so far: today's seconds, where the open count stands, the streak (GET /me/study-stats). */
    today: () => [...studyKeys.all, 'today'] as const,
    /** One's Solo not yet ended and the next start's cycle (GET /me/solo-session, D-229). */
    solo: () => [...studyKeys.all, 'solo'] as const,
    /**
     * The week holding `date` (YYYY-MM-DD, one's zone): each day's seconds, the
     * longest streak, the first day counted (GET /me/study-stats, D-105). Keyed
     * by today on the Study page, so a new day reads it again.
     */
    week: (date: string) => [...studyKeys.all, 'week', date] as const,
    /** Every period of the Stats page: read again after each count (`streak.updated`, D-235). */
    periods: () => [...studyKeys.all, 'stats'] as const,
    /**
     * A period of the Stats page (GET /me/study-stats?view=&date=, D-105),
     * named by its first day and keyed by today too: a new day reads it again.
     */
    period: (view: StatsView, start: string, today: string) => [...studyKeys.periods(), view, start, today] as const,
    /** Every history of the Stats page: read again after each count (D-235). */
    histories: () => [...studyKeys.all, 'history'] as const,
    /** A period's sessions, 20 a page (GET /me/study-sessions, D-230). */
    history: (view: StatsView, start: string) => [...studyKeys.histories(), view, start] as const,
    /** Who would control a session if its Host left now (GET /focus-sessions/{id}/next-host, D-233). */
    nextHost: (sessionId: string) => [...studyKeys.all, 'next-host', sessionId] as const
}
