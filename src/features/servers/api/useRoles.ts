import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import {
    createRole,
    deleteRole,
    fetchMembers,
    fetchRoles,
    grantRole,
    reorderRoles,
    revokeRole,
    updateRole,
    type MemberQuery
} from './roles.api'
import { serverKeys } from './keys'
import type { Role, UpdateRoleRequest } from '../types'

/**
 * After a change to roles: the Roles page, the members (who holds what), and
 * the server list, whose permissions and roles are the person's own and may
 * have just changed (D-145).
 */
function reload(queryClient: QueryClient, serverId: string): Promise<unknown> {
    return Promise.all([
        queryClient.invalidateQueries({ queryKey: serverKeys.roles(serverId) }),
        queryClient.invalidateQueries({ queryKey: serverKeys.members(serverId) }),
        queryClient.invalidateQueries({ queryKey: serverKeys.list() })
    ])
}

/** The Roles page (S-SET-02): highest first, @everyone last. */
export function useServerRoles(serverId: string, enabled = true) {
    return useQuery({ queryKey: serverKeys.roles(serverId), queryFn: () => fetchRoles(serverId), enabled })
}

export function useCreateRole(serverId: string) {
    const queryClient = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (name: string, idempotencyKey) => createRole(serverId, name, idempotencyKey),
        // Awaited before the caller opens the new role, so its page finds it in the list.
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/**
 * A change to one role. One role's changes run one after another (`scope`),
 * each sending the whole set the page then shows, so two quick flips cannot
 * land out of order; the page shows its flips before the answers (Q3:
 * switches save at once). A saved change goes into the list at once.
 */
export function useUpdateRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        scope: { id: `role-${roleId}` },
        mutationFn: (body: UpdateRoleRequest) => updateRole(serverId, roleId, body),
        onSuccess: (_answer, body) =>
            queryClient.setQueryData<Role[]>(serverKeys.roles(serverId), (roles) =>
                roles?.map((role) =>
                    role.id === roleId
                        ? {
                              ...role,
                              ...(body.name !== undefined ? { name: body.name.normalize('NFC').trim() } : {}),
                              ...(body.permissions !== undefined ? { permissions: body.permissions } : {}),
                              ...(body.mentionable !== undefined ? { mentionable: body.mentionable } : {})
                          }
                        : role
                )
            ),
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

export function useDeleteRole(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (roleId: string) => deleteRole(serverId, roleId),
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/** One drop: the list shows it at once and goes back if refused (S-SET-02 › reorder). */
export function useReorderRoles(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        scope: { id: `roles-order-${serverId}` },
        mutationFn: ({ order, seenOrder }: { order: string[]; seenOrder: string[]; shown: Role[] }) =>
            reorderRoles(serverId, order, seenOrder),
        onMutate: async ({ shown }) => {
            const key = serverKeys.roles(serverId)
            await queryClient.cancelQueries({ queryKey: key })
            const before = queryClient.getQueryData<Role[]>(key)
            queryClient.setQueryData(key, shown)
            return { before }
        },
        onError: (_error, _vars, context) => {
            if (context?.before) queryClient.setQueryData(serverKeys.roles(serverId), context.before)
        },
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

export function useGrantRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (userIds: string[]) => grantRole(serverId, roleId, userIds),
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

export function useRevokeRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => revokeRole(serverId, roleId, userId),
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/**
 * One tick in the "+" popover of the Members page (04 › "+"): gives or takes
 * one role from one member, saved at once, no Toast (10 Q15).
 */
export function useSetMemberRole(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: ({ roleId, userId, held }: { roleId: string; userId: string; held: boolean }) =>
            held ? grantRole(serverId, roleId, [userId]) : revokeRole(serverId, roleId, userId),
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/** One page of members (D-152); the last page stays shown while the next search loads. */
export function useServerMembers(serverId: string, query: MemberQuery, enabled = true) {
    return useQuery({
        queryKey: [...serverKeys.members(serverId), query],
        queryFn: () => fetchMembers(serverId, query),
        placeholderData: keepPreviousData,
        enabled
    })
}
