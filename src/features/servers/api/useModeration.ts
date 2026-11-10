import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { banMember, fetchBans, kickMember, timeoutMember, unbanMember } from './moderation.api'
import type { PageSize } from './roles.api'
import { serverKeys } from './keys'

/** After one: the members, how many hold each role, and the bans. */
function reload(queryClient: QueryClient, serverId: string): Promise<unknown> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: serverKeys.members(serverId) }),
        queryClient.invalidateQueries({ queryKey: serverKeys.roles(serverId) }),
        queryClient.invalidateQueries({ queryKey: serverKeys.bans(serverId) })
    ])
}

/** Each dialog says what went wrong itself (04 › Lỗi gửi hộp thoại), so no default toast. */
const QUIET = { errorToast: false }

export function useKickMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, reason }: { userId: string; reason: string | null }) =>
            kickMember(serverId, userId, reason),
        onSuccess: () => reload(queryClient, serverId),
        meta: QUIET
    })
}

export function useBanMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, reason }: { userId: string; reason: string | null }) =>
            banMember(serverId, userId, reason),
        onSuccess: () => reload(queryClient, serverId),
        meta: QUIET
    })
}

export function useUnbanMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => unbanMember(serverId, userId),
        onSuccess: () => reload(queryClient, serverId),
        meta: QUIET
    })
}

/** `seconds` null ends a running timeout. */
export function useTimeoutMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, seconds, reason }: { userId: string; seconds: number | null; reason: string | null }) =>
            timeoutMember(serverId, userId, seconds, reason),
        onSuccess: () => reload(queryClient, serverId),
        meta: QUIET
    })
}

/** One page of the bans; the page shown stays while the next loads. */
export function useServerBans(serverId: string, page: number, limit: PageSize) {
    return useQuery({
        queryKey: serverKeys.banPage(serverId, page, limit),
        queryFn: () => fetchBans(serverId, page, limit),
        placeholderData: keepPreviousData
    })
}
