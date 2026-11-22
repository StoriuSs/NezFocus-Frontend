/** Query keys for the study feature (data-fetching.md). */
export const studyKeys = {
    all: ['study'] as const,
    /** One's day so far: today's seconds, where the open count stands, the streak (GET /me/study-stats). */
    today: () => [...studyKeys.all, 'today'] as const
}
