import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Crown, UserPlus, X } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth'
import { useGrantRole, useRevokeRole, useServerMembers } from '../../../api/useRoles'
import { can } from '../../../lib/permissions'
import { holdsAllOf, mayChangeMember } from '../../../lib/roles'
import type { Role, Server, ServerMember } from '../../../types'
import { AddRoleMembersDialog } from './AddRoleMembersDialog'

/** How many holders the tab lists; past that, "And N more" (a study group rarely gets there). */
const SHOWN = 100

export const memberName = (member: Pick<ServerMember, 'displayName' | 'username'>) =>
    member.displayName ?? member.username ?? ''

/** MemberRow `username` (C-13): the picture, the name, @username under it, a crown for the owner. */
export function MemberIdentity({
    member,
    note,
    noteStrong
}: {
    member: ServerMember
    /** In place of @username: "Đã có vai trò", "Tạm khóa tới 22:30". */
    note?: string | null
    /** The note in `text-secondary`, set apart from a username (04 › Đang bị tạm khóa). */
    noteStrong?: boolean
}) {
    const { t } = useTranslation('servers')
    const name = memberName(member)
    return (
        <span className='flex min-w-0 flex-1 items-center gap-3'>
            <Avatar className='size-8'>
                <AvatarImage src={member.avatarUrl ?? undefined} alt='' className='object-cover' />
                <AvatarFallback className='bg-surface-3 text-label font-semibold text-text-primary'>
                    {name.slice(0, 1).toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <span className='grid min-w-0'>
                <span className='flex items-center gap-1 truncate text-body-sm text-text-primary'>
                    <span className='truncate'>{name}</span>
                    {member.isOwner ? (
                        <Crown className='size-3.5 shrink-0 text-warning' aria-label={t('roles.members.owner')} />
                    ) : null}
                </span>
                {note || member.username ? (
                    <span
                        className={cn(
                            'truncate text-label',
                            note && noteStrong ? 'text-text-secondary' : 'text-text-tertiary'
                        )}
                    >
                        {note || member.username}
                    </span>
                ) : null}
            </span>
        </span>
    )
}

/**
 * Tab "Members" of a role (S-SET-02 `role-members`): who holds it, each with
 * ✕ to take it back at once (Toast with "Undo"), and "Add members". Taking
 * a role that gives them Manage roles off themselves asks first.
 */
export function RoleMembers({
    server,
    role,
    roles,
    readOnly
}: {
    server: Server
    role: Role
    roles: Role[]
    readOnly: boolean
}) {
    const { t } = useTranslation('servers')
    const myId = useAuthStore((state) => state.user?.id) ?? ''
    const members = useServerMembers(server.id, { roleId: role.id, limit: SHOWN })
    const revoke = useRevokeRole(server.id, role.id)
    const grant = useGrantRole(server.id, role.id)
    const [adding, setAdding] = useState(false)
    const [confirming, setConfirming] = useState<ServerMember | null>(null)
    const handsOut = holdsAllOf(server.permissions, role)
    const editable = !readOnly && handsOut

    function take(member: ServerMember) {
        const name = memberName(member)
        revoke.mutate(member.userId, {
            onSuccess: () =>
                toast(t('roles.members.removed', { role: role.name, name }), {
                    duration: 5000,
                    action: {
                        label: t('roles.members.undo'),
                        onClick: () =>
                            grant.mutate([member.userId], { onError: () => toast.error(t('roles.saveFailed')) })
                    }
                }),
            onError: () => toast.error(t('roles.saveFailed'))
        })
    }

    /** Their own Manage roles may come from this role: ask before it goes (S-SET-02 › Gỡ người). */
    function remove(member: ServerMember) {
        const givesManage = can(role.permissions, 'MANAGE_ROLES') || can(role.permissions, 'ADMINISTRATOR')
        if (member.userId === myId && !server.isOwner && givesManage) return setConfirming(member)
        take(member)
    }

    // Focusable while locked (aria-disabled, not disabled), so the reason shows on focus too.
    const add = (
        <Button
            variant='secondary'
            size='sm'
            aria-disabled={!handsOut}
            className={cn(!handsOut && 'cursor-not-allowed opacity-50')}
            onClick={() => handsOut && setAdding(true)}
        >
            <UserPlus aria-hidden='true' />
            {t('roles.members.add')}
        </Button>
    )

    return (
        <>
            <div className='flex items-center gap-3'>
                <p className='flex-1 text-body-sm text-text-secondary'>
                    {t('roles.members.count', { count: role.memberCount })}
                </p>
                {readOnly ? null : handsOut ? (
                    add
                ) : (
                    <WithTooltip label={t('roles.members.handoutLocked')}>{add}</WithTooltip>
                )}
            </div>
            {members.isPending ? (
                <div className='grid gap-2' aria-busy='true'>
                    {[0, 1].map((row) => (
                        <Skeleton key={row} className='h-12 w-full' />
                    ))}
                </div>
            ) : members.isError ? (
                <p className='text-body-sm text-text-secondary'>{t('roles.loadFailed')}</p>
            ) : members.data.items.length === 0 ? (
                <p className='text-body-sm text-text-tertiary'>{t('roles.members.empty')}</p>
            ) : (
                <ul className='grid'>
                    {members.data.items.map((member) => {
                        const label = t('roles.members.remove', { role: role.name, name: memberName(member) })
                        const removable = editable && mayChangeMember(server, myId, member, roles)
                        return (
                            <li key={member.userId} className='flex h-14 items-center gap-3 border-b px-1'>
                                <MemberIdentity member={member} />
                                {removable ? (
                                    <WithTooltip label={label}>
                                        <IconButton
                                            label={label}
                                            onClick={() => remove(member)}
                                            disabled={revoke.isPending}
                                        >
                                            <X />
                                        </IconButton>
                                    </WithTooltip>
                                ) : null}
                            </li>
                        )
                    })}
                    {members.data.meta.totalItems > members.data.items.length ? (
                        <li className='px-1 py-2 text-label text-text-tertiary'>
                            {t('roles.members.more', {
                                count: members.data.meta.totalItems - members.data.items.length
                            })}
                        </li>
                    ) : null}
                </ul>
            )}
            {adding ? (
                <AddRoleMembersDialog server={server} role={role} roles={roles} onClose={() => setAdding(false)} />
            ) : null}
            <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('roles.members.removeSelfTitle', { role: role.name })}</DialogTitle>
                        <DialogDescription>{t('roles.members.removeSelfBody')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type='button' variant='text' onClick={() => setConfirming(null)}>
                            {t('roles.members.cancel')}
                        </Button>
                        <Button
                            type='button'
                            variant='destructive'
                            onClick={() => {
                                if (confirming) take(confirming)
                                setConfirming(null)
                            }}
                        >
                            {t('roles.members.removeSelfSubmit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
