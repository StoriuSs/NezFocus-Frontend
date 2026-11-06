import { useQuery } from '@tanstack/react-query'
import { userKeys } from './keys'
import { fetchProfile } from './users.api'

/**
 * Fetch the current user's profile.
 * The single source for profile data: the header, the Profile page, "complete your account".
 */
export function useProfile(enabled = true) {
    return useQuery({
        queryKey: userKeys.profile(),
        queryFn: fetchProfile,
        enabled,
        staleTime: 60_000 // 1 minute
    })
}
