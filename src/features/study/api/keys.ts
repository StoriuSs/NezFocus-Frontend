/** Query keys for the study feature (data-fetching.md). */
export const studyKeys = {
    all: ['study'] as const,
    /** One's day so far: today's seconds, where the open count stands, the streak (GET /me/study-stats). */
    today: () => [...studyKeys.all, 'today'] as const,
    /** One's Solo not yet ended and the next start's cycle (GET /me/solo-session, D-229). */
    solo: () => [...studyKeys.all, 'solo'] as const,
    /** Who would control a session if its Host left now (GET /focus-sessions/{id}/next-host, D-233). */
    nextHost: (sessionId: string) => [...studyKeys.all, 'next-host', sessionId] as const
}
