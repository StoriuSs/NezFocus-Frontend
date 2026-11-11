import '@/i18n/servers'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WithTooltip } from '@/components/ui/tooltip'
import { folded } from '@/lib/utils'
import { useSetMemberRole } from '../../../api/useRoles'
import type { Role, ServerMember } from '../../../types'
import { memberName } from '../roles/RoleMembers'

/** From ten roles up, a search box tops the list (04 › "+", as the private-channel picker). */
const SEARCH_FROM = 10

/**
 * "+" on a row (S-SET-03 `role-picker`): a Checkbox for each role they may
 * hand out, saved at once on each tick; a failure unticks it and the hook
 * says so with "Try again" (04 › Toast).
 */
export function RolePicker({ serverId, member, roles }: { serverId: string; member: ServerMember; roles: Role[] }) {
    const { t } = useTranslation('servers')
    const setRole = useSetMemberRole(serverId)
    const [query, setQuery] = useState('')
    const titleId = useId()
    const name = memberName(member)
    const held = new Set(member.roleIds)
    const shown = roles.filter((role) => folded(role.name).includes(folded(query.trim())))

    function tick(role: Role, on: boolean) {
        setRole.mutate({ roleId: role.id, userId: member.userId, held: on })
    }

    return (
        <Popover onOpenChange={(open) => !open && setQuery('')}>
            <WithTooltip label={t('members.assign')}>
                <PopoverTrigger asChild>
                    <IconButton label={t('members.assign')} className='size-6'>
                        <Plus />
                    </IconButton>
                </PopoverTrigger>
            </WithTooltip>
            <PopoverContent align='start' className='grid w-64 gap-2 p-2' aria-labelledby={titleId}>
                <p id={titleId} className='px-2 pt-1 text-label font-semibold text-text-secondary'>
                    {t('members.pickerTitle', { name })}
                </p>
                {roles.length >= SEARCH_FROM ? (
                    <Input
                        aria-label={t('members.findRole')}
                        placeholder={t('members.findRole')}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                ) : null}
                <ul className='grid max-h-[206px] overflow-y-auto'>
                    {shown.map((role) => {
                        const id = `${titleId}-${role.id}`
                        const on =
                            setRole.isPending && setRole.variables?.roleId === role.id
                                ? setRole.variables.held
                                : held.has(role.id)
                        return (
                            <li
                                key={role.id}
                                className='flex h-9 items-center gap-2 rounded-button px-2 hover:bg-surface-2'
                            >
                                <Checkbox id={id} checked={on} onChange={(event) => tick(role, event.target.checked)} />
                                <label htmlFor={id} className='min-w-0 flex-1 truncate text-body-sm text-text-primary'>
                                    {role.name}
                                </label>
                            </li>
                        )
                    })}
                    {shown.length === 0 ? (
                        <li className='px-2 py-2 text-label text-text-tertiary'>
                            {t('members.noRoleMatch', { query: query.trim() })}
                        </li>
                    ) : null}
                </ul>
            </PopoverContent>
        </Popover>
    )
}
