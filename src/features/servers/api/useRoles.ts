import '@/i18n/servers'
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
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
import type { PermissionName } from '../lib/permissions'
import { withPermission } from '../lib/roles'
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

/** A saved change of one role, into the cached list at once. */
function saveIntoList(queryClient: QueryClient, serverId: string, roleId: string, body: UpdateRoleRequest) {
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
    )
}

/** A toast for a change saved at once and refused, with "Try again" (04 › Toast). */
function refusedToast(t: TFunction<'servers'>, again: () => void) {
    toast.error(t('roles.saveFailed'), { action: { label: t('roles.retry'), onClick: again } })
}

/**
 * The name of one role, from its save bar; the form shows a refusal itself.
 * It runs in line with the role's switches (the same `scope`).
 */
export function useUpdateRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        scope: { id: `role-${roleId}` },
        mutationFn: (body: { name: string }) => updateRole(serverId, roleId, body),
        onSuccess: (_answer, body) => saveIntoList(queryClient, serverId, roleId, body),
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/** One switch of a role: a permission on or off, or "allow anyone to mention". */
export type RoleSwitch = { permission: PermissionName; on: boolean } | { mentionable: boolean }

/**
 * One switch of a role, saved at once (04 › Lưu thay đổi, Q3) as
 * docs/data-fetching.md › Optimistic saves; the page shows its flips before
 * the answers. The role's changes run one after another (`scope`), and a
 * permission is set on the role as saved when its turn comes, not on the set
 * the page showed: a refused flip goes back alone, and "Try again", the
 * hook's own toast so it still answers once the tab is left, does not undo
 * what was saved since.
 */
export function useSaveRoleSwitch(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const save = useMutation({
        scope: { id: `role-${roleId}` },
        mutationFn: async (change: RoleSwitch) => {
            const body: UpdateRoleRequest =
                'mentionable' in change
                    ? { mentionable: change.mentionable }
                    : { permissions: withPermission(savedRole().permissions, change.permission, change.on) }
            await updateRole(serverId, roleId, body)
            return body
        },
        onSuccess: (body) => saveIntoList(queryClient, serverId, roleId, body),
        onError: (_error, sent) => refusedToast(t, () => save.mutate(sent)),
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })

    function savedRole(): Role {
        const role = queryClient.getQueryData<Role[]>(serverKeys.roles(serverId))?.find((r) => r.id === roleId)
        // The page opens a role only from the loaded list, so this is a role deleted meanwhile.
        if (!role) throw new Error(`role ${roleId} is not in the list`)
        return role
    }

    return save
}

export function useDeleteRole(serverId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (roleId: string) => deleteRole(serverId, roleId),
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/**
 * One drop: the list shows it at once and goes back if refused (S-SET-02 ›
 * reorder), with "Try again", the hook's own toast so it still answers once
 * the list is left. Refused because the list changed meanwhile, it is read
 * again and Try again is not offered: the same order would fail again.
 */
export function useReorderRoles(serverId: string) {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const reorder = useMutation({
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
        onError: (error, sent, context) => {
            if (context?.before) queryClient.setQueryData(serverKeys.roles(serverId), context.before)
            const stale = getApiErrorType(error) === 'CONFLICT_ERROR'
            toast.error(t('roles.saveFailed'), {
                action: stale ? undefined : { label: t('roles.retry'), onClick: () => reorder.mutate(sent) }
            })
        },
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
    return reorder
}

/** "Add members" (members-add): the dialog says itself when it is refused. */
export function useGrantRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (userIds: string[]) => grantRole(serverId, roleId, userIds),
        onSuccess: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
}

/** Someone a role is taken from, with the names the toasts show. */
export type RoleHolder = { userId: string; name: string; role: string }

/**
 * The ✕ of a row in a role's Members tab (S-SET-02 role-members), saved at
 * once: "Removed … from …" with Undo, which gives the role back. Either one
 * refused: "Couldn't save" with "Try again" (04 › Toast). The toasts are the
 * hook's, so Undo and Try again still answer once the tab is left.
 */
export function useTakeRole(serverId: string, roleId: string) {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const giveBack = useMutation({
        mutationFn: ({ userId }: RoleHolder) => grantRole(serverId, roleId, [userId]),
        onSuccess: () => reload(queryClient, serverId),
        onError: (_error, sent) => refusedToast(t, () => giveBack.mutate(sent)),
        meta: { errorToast: false }
    })
    const take = useMutation({
        mutationFn: ({ userId }: RoleHolder) => revokeRole(serverId, roleId, userId),
        onSuccess: async (_answer, sent) => {
            await reload(queryClient, serverId)
            toast(t('roles.members.removed', { role: sent.role, name: sent.name }), {
                duration: 5000,
                action: { label: t('roles.members.undo'), onClick: () => giveBack.mutate(sent) }
            })
        },
        onError: (_error, sent) => refusedToast(t, () => take.mutate(sent)),
        meta: { errorToast: false }
    })
    return take
}

/**
 * One tick in the "+" popover of the Members page (04 › "+"): gives or takes
 * one role from one member, saved at once, no toast when saved (10 Q15);
 * refused: "Couldn't save" with "Try again", the hook's own so it still
 * answers once the page is left.
 */
export function useSetMemberRole(serverId: string) {
    const queryClient = useQueryClient()
    const { t } = useTranslation('servers')
    const set = useMutation({
        mutationFn: ({ roleId, userId, held }: { roleId: string; userId: string; held: boolean }) =>
            held ? grantRole(serverId, roleId, [userId]) : revokeRole(serverId, roleId, userId),
        onError: (_error, sent) =>
            toast.error(t('members.saveFailed'), {
                action: { label: t('members.retry'), onClick: () => set.mutate(sent) }
            }),
        onSettled: () => reload(queryClient, serverId),
        meta: { errorToast: false }
    })
    return set
}

/** One page of members (D-152); the last page stays shown while the next search loads. */
export function useServerMembers(serverId: string, query: MemberQuery, enabled = true) {
    return useQuery({
        queryKey: serverKeys.memberPage(serverId, query),
        queryFn: () => fetchMembers(serverId, query),
        placeholderData: keepPreviousData,
        enabled
    })
}
