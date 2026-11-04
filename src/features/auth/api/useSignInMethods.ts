import { useQuery } from '@tanstack/react-query'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/** How this account signs in: a password, other providers (`google`), or both. */
export function useSignInMethods(enabled = true) {
    return useQuery({ queryKey: authKeys.signInMethods(), queryFn: () => authApi.signInMethods(), enabled })
}
