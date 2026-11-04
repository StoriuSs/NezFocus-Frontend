/**
 * Query keys for the auth feature, in one place so that two queries can never
 * share a key by accident while fetching different shapes, and invalidation
 * always targets the right entries.
 */
export const authKeys = {
    all: ['auth'] as const,
    options: () => [...authKeys.all, 'options'] as const,
    signInMethods: () => [...authKeys.all, 'sign-in-methods'] as const,
    twoFactorStatus: () => [...authKeys.all, 'two-factor'] as const
}
