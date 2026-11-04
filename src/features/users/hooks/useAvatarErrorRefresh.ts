import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { userKeys } from '../api/keys'

/**
 * Handler for an avatar <img> that failed to load.
 *
 * With S3 storage the avatar URL is presigned and expires after an hour; a tab
 * left open longer showed initials instead of the picture. On a load error
 * this refetches the profile once per URL, which returns a freshly signed
 * one — once, so a genuinely broken image can't cause a refetch loop.
 */
export function useAvatarErrorRefresh(avatarUrl: string | null | undefined) {
    const queryClient = useQueryClient()
    const refreshedFor = useRef<string | null>(null)

    return useCallback(() => {
        if (!avatarUrl || refreshedFor.current === avatarUrl) return
        refreshedFor.current = avatarUrl
        void queryClient.invalidateQueries({ queryKey: userKeys.profile() })
    }, [avatarUrl, queryClient])
}
