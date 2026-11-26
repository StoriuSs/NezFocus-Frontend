import { useMemo } from 'react'
import { useRelationships } from '@/features/social'
import { useProfile } from '@/features/users'
import { useServers } from '../api/useServers'
import { friendsStudyingOf, type StudyingFriend } from '../lib/friends-studying'

/**
 * One's friends studying now (`friendsStudyingOf`), from the servers held
 * and the relationships, both kept live: nobody until both are read.
 */
export function useFriendsStudying(): StudyingFriend[] {
    const servers = useServers().data
    const relationships = useRelationships().data
    const me = useProfile().data?.id
    return useMemo(
        () => (servers && relationships && me !== undefined ? friendsStudyingOf(servers, me, relationships) : []),
        [servers, relationships, me]
    )
}
