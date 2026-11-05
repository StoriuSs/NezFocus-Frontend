import { useQuery } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

export interface AuthOptionsState {
    /** Providers the API is configured for (`google`). Empty while loading, and if the API cannot be asked. */
    providers: string[]
}

/**
 * The API's sign-in configuration (GET /auth/options), read at runtime so one
 * build of the app works whatever the API has turned on.
 */
export function useAuthOptions(): AuthOptionsState {
    const { data } = useQuery({
        queryKey: authKeys.options(),
        queryFn: () => authApi.options(),
        // Configuration: it changes when the API is redeployed, not while a page is open.
        staleTime: Infinity,
        retry: false
    })
    return { providers: data?.providers ?? [] }
}
