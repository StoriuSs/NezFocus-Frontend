import '@/i18n/servers'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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

/**
 * After a kick or a ban: one fewer in the server, which Leave and Delete
 * server go by (`owner-alone`, D-161). Not awaited: the dialog closes without
 * waiting for the heaviest read.
 */
function recount(queryClient: QueryClient) {
    void queryClient.invalidateQueries({ queryKey: serverKeys.list() })
}

/** Each dialog says what went wrong itself (04 › Lỗi gửi hộp thoại), and useEndTimeout has its own toast. */
const QUIET = { errorToast: false }

export function useKickMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, reason }: { userId: string; reason: string | null }) =>
            kickMember(serverId, userId, reason),
        onSuccess: () => {
            recount(queryClient)
            return reload(queryClient, serverId)
        },
        meta: QUIET
    })
}

export function useBanMember(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, reason }: { userId: string; reason: string | null }) =>
            banMember(serverId, userId, reason),
        onSuccess: () => {
            recount(queryClient)
            return reload(queryClient, serverId)
        },
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

/**
 * "Remove timeout" in a row's ⋯ (S-SET-03), saved at once: "Removed the
 * timeout of …", or "Couldn't save" with "Try again" (04 › Toast). The toasts
 * are the hook's, so Try again still answers once the page is left.
 */
export function useEndTimeout(serverId: string) {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const end = useMutation({
        mutationFn: ({ userId }: { userId: string; name: string }) => timeoutMember(serverId, userId, null, null),
        onSuccess: async (_answer, sent) => {
            await reload(queryClient, serverId)
            toast(t('members.toast.timeoutEnded', { name: sent.name }))
        },
        onError: (_error, sent) =>
            toast.error(t('members.saveFailed'), {
                action: { label: t('members.retry'), onClick: () => end.mutate(sent) }
            }),
        meta: QUIET
    })
    return end
}

/** One page of the bans; the page shown stays while the next loads. */
export function useServerBans(serverId: string, page: number, limit: PageSize) {
    return useQuery({
        queryKey: serverKeys.banPage(serverId, page, limit),
        queryFn: () => fetchBans(serverId, page, limit),
        placeholderData: keepPreviousData
    })
}
