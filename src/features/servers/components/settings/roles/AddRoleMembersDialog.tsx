import '@/i18n/servers'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/features/auth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cn } from '@/lib/utils'
import { useGrantRole, useServerMembers } from '../../../api/useRoles'
import { mayChangeMember } from '../../../lib/roles'
import type { Role, Server } from '../../../types'
import { MemberIdentity } from './RoleMembers'

/**
 * "Add to {role}" (S-SET-02 `members-add`, Dialog `form` 520): search the
 * server's members by name or username (D-152), tick several, add them in
 * one request, all or none (D-153). Those who have the role already show
 * ticked and locked; those ranked level with or above you, locked.
 */
export function AddRoleMembersDialog({
    server,
    role,
    roles,
    onClose
}: {
    server: Server
    role: Role
    roles: Role[]
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const myId = useAuthStore((state) => state.user?.id) ?? ''
    const search = useRef<HTMLInputElement>(null)
    const [q, setQ] = useState('')
    const query = useDebouncedValue(q.trim(), 250)
    const members = useServerMembers(server.id, { q: query || undefined, limit: 50 })
    const grant = useGrantRole(server.id, role.id)
    const [picked, setPicked] = useState<Set<string>>(() => new Set())
    useEffect(() => search.current?.focus(), [])

    function toggle(userId: string, on: boolean) {
        setPicked((before) => {
            const next = new Set(before)
            if (on) next.add(userId)
            else next.delete(userId)
            return next
        })
    }

    function submit(event: FormEvent) {
        event.preventDefault()
        if (picked.size === 0 || grant.isPending) return
        grant.mutate([...picked], {
            onSuccess: () => {
                toast.success(t('roles.members.added', { count: picked.size, role: role.name }))
                onClose()
            },
            onError: () => {
                toast.error(t('roles.addDialog.failed'))
                setPicked(new Set())
                void members.refetch()
            }
        })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !grant.isPending && onClose()}>
            <DialogContent className='max-w-[520px]' onOpenAutoFocus={(event) => event.preventDefault()}>
                <form onSubmit={submit} className='grid gap-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('roles.addDialog.title', { role: role.name })}</DialogTitle>
                    </DialogHeader>
                    <div className='relative'>
                        <Search
                            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                            aria-hidden='true'
                        />
                        <Input
                            ref={search}
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            placeholder={t('roles.addDialog.search')}
                            aria-label={t('roles.addDialog.search')}
                            autoComplete='off'
                            className='pl-9'
                        />
                    </div>
                    <div className='max-h-80 overflow-y-auto'>
                        {members.isPending ? (
                            <div className='grid gap-2' aria-busy='true'>
                                {[0, 1, 2].map((row) => (
                                    <Skeleton key={row} className='h-12 w-full' />
                                ))}
                            </div>
                        ) : members.isError ? (
                            <p className='py-4 text-body-sm text-text-secondary'>{t('roles.loadFailed')}</p>
                        ) : members.data.items.length === 0 ? (
                            <p className='py-4 text-body-sm text-text-tertiary'>
                                {t('roles.addDialog.noMatch', { q: query })}
                            </p>
                        ) : (
                            <ul className='grid'>
                                {members.data.items.map((member) => {
                                    const has = member.roleIds.includes(role.id)
                                    const above = !has && !mayChangeMember(server, myId, member, roles)
                                    const note = has
                                        ? t('roles.addDialog.hasRole')
                                        : above
                                          ? t('roles.addDialog.above')
                                          : null
                                    return (
                                        <li key={member.userId}>
                                            <label
                                                htmlFor={`add-role-${member.userId}`}
                                                className={cn(
                                                    'flex h-14 items-center gap-3 rounded-button px-2',
                                                    !(has || above) && 'cursor-pointer hover:bg-surface-2'
                                                )}
                                            >
                                                <MemberIdentity member={member} note={note} />
                                                <Checkbox
                                                    id={`add-role-${member.userId}`}
                                                    checked={has || picked.has(member.userId)}
                                                    disabled={has || above || grant.isPending}
                                                    onChange={(event) => toggle(member.userId, event.target.checked)}
                                                />
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={grant.isPending} onClick={onClose}>
                            {t('roles.addDialog.cancel')}
                        </Button>
                        <Button type='submit' disabled={picked.size === 0 || grant.isPending}>
                            {grant.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {picked.size === 0
                                ? t('roles.addDialog.submit')
                                : t('roles.addDialog.submitCount', { count: picked.size })}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
