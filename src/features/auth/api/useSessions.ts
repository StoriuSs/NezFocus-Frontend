import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SessionList } from '@/features/auth/types'
import { authApi } from './auth.api'
import { authKeys } from './keys'

/**
 * The signed-in devices (S-ME-03). Read again when the page opens and when
 * the tab comes back into focus (10-settings › Tương tác): a device signed
 * in or out meanwhile shows up then, not while the list is being read.
 */
export function useSessions() {
    return useQuery({
        queryKey: authKeys.sessions(),
        queryFn: () => authApi.sessions(),
        staleTime: 0,
        refetchOnMount: 'always',
        refetchOnWindowFocus: 'always',
        retry: false
    })
}

/**
 * Sign out one device: no question first (D-75). Its row goes once the API
 * has answered, which it does the same if the session had just ended.
 */
export function useRevokeSession() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => authApi.revokeSession(id),
        onSuccess: (_answer, id) =>
            queryClient.setQueryData<SessionList>(authKeys.sessions(), (list) =>
                list ? { sessions: list.sessions.filter((session) => session.id !== id) } : list
            )
    })
}

/** "Sign out the other devices": this one stays, and is all the list has left. */
export function useRevokeOtherSessions() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: () => authApi.revokeOtherSessions(),
        onSuccess: () =>
            queryClient.setQueryData<SessionList>(authKeys.sessions(), (list) =>
                list ? { sessions: list.sessions.filter((session) => session.current) } : list
            )
    })
}
