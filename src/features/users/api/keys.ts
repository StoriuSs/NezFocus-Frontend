/**
 * Query keys for the users feature, in one place so that two queries can never
 * share a key by accident while fetching different shapes, and invalidation
 * always targets the right entries.
 */
export const userKeys = {
    all: ['users'] as const,
    profile: () => [...userKeys.all, 'profile'] as const,
    usernameAvailability: (username: string) => [...userKeys.all, 'username-availability', username] as const
}
