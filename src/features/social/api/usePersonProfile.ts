import { useQuery } from '@tanstack/react-query'
import { socialKeys } from './keys'
import { fetchPersonProfile } from './social.api'

/**
 * Someone's profile (D-109): the bio and the servers we share, which nothing
 * keeps live, so it is read again each time a screen that shows it mounts
 * (the DM's profile panel, D-251) and when the window comes back into
 * focus; the one held shows meanwhile. A change of relationship puts its
 * new type in it (`useRelationshipActions.ts`).
 */
export function usePersonProfile(userId: string) {
    return useQuery({
        queryKey: socialKeys.profile(userId),
        queryFn: () => fetchPersonProfile(userId),
        staleTime: 0,
        refetchOnWindowFocus: true
    })
}
