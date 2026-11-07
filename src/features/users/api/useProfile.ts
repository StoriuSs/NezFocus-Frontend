import { useQuery } from '@tanstack/react-query'
import { useAvatarRemoval } from '../lib/avatar-removal-state'
import type { UserProfile } from '../types'
import { userKeys } from './keys'
import { fetchProfile } from './users.api'

const withoutAvatar = (profile: UserProfile): UserProfile => ({ ...profile, avatarUrl: null })

/**
 * Fetch the current user's profile.
 * The single source for profile data: your menu, the Profile page, "complete your account".
 * While a removed avatar waits out its "Undo", it reads as gone (S-ME-02).
 */
export function useProfile(enabled = true) {
    const removing = useAvatarRemoval((state) => state.pending)
    return useQuery({
        queryKey: userKeys.profile(),
        queryFn: fetchProfile,
        enabled,
        staleTime: 60_000, // 1 minute
        select: removing ? withoutAvatar : undefined
    })
}
