import { useQuery } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

export interface AuthOptionsState {
    /** Providers the API is configured for (`google`). Empty while loading, and if the API cannot be asked. */
    providers: string[]
    /** Turnstile's site key; null when Turnstile is off, undefined while not known yet. */
    turnstileSiteKey: string | null | undefined
    /** Ask again: after the API asked for a Turnstile answer the page could not know it needed. */
    refetch: () => void
}

/**
 * The API's sign-in configuration (GET /auth/options), read at runtime so one
 * build of the app works whatever the API has turned on.
 */
export function useAuthOptions(): AuthOptionsState {
    const { data, refetch } = useQuery({
        queryKey: authKeys.options(),
        queryFn: () => authApi.options(),
        // Configuration: it changes when the API is redeployed, not while a page is open.
        staleTime: Infinity,
        retry: false
    })
    return {
        providers: data?.providers ?? [],
        turnstileSiteKey: data ? (data.turnstileSiteKey ?? null) : undefined,
        refetch: () => void refetch()
    }
}
