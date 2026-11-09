import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { Tag } from '@/components/settings/SettingsRow'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { can } from '../../lib/permissions'
import type { Server } from '../../types'

/** From this many roles on, a search box (S-SRV-05). */
const SEARCH_FROM = 10

/** Case and accents left out: "ban" finds "Ban học tập" and "Bàn". */
const fold = (text: string) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

/**
 * The roles that see a private channel (S-SRV-05 `private*`, S-SET-05
 * `private*`): highest first, without @everyone. A role with ADMINISTRATOR
 * sees every channel, so it is ticked and locked, and not counted. Every role
 * the person holds has a "your role" Tag; when they are neither the owner nor
 * all-powerful and none of their roles is ticked, a warning says they will
 * lose the channel (it does not stop them).
 */
export function ViewRolesPicker({
    server,
    selected,
    onChange,
    editing,
    disabled
}: {
    server: Server
    selected: string[]
    onChange: (roleIds: string[]) => void
    /** Settings rather than creating: "once you save". */
    editing?: boolean
    disabled?: boolean
}) {
    const { t } = useTranslation('servers')
    const labelId = useId()
    const [query, setQuery] = useState('')

    const roles = server.roles.filter((role) => fold(role.name).includes(fold(query.trim())))
    const counted = selected.filter((id) => server.roles.some((role) => role.id === id && !role.administrator))
    const allPowerful = server.isOwner || can(server.permissions, 'ADMINISTRATOR')
    const losesIt = !allPowerful && !server.roleIds.some((id) => selected.includes(id))

    const toggle = (roleId: string, checked: boolean) =>
        onChange(checked ? [...selected, roleId] : selected.filter((id) => id !== roleId))

    if (server.roles.length === 0) {
        return <p className='text-label text-text-tertiary'>{t('channel.private.noRoles')}</p>
    }

    return (
        <div className='grid gap-2'>
            <p id={labelId} className='text-label text-text-secondary'>
                {t('channel.private.roles', { count: counted.length })}
            </p>
            {server.roles.length >= SEARCH_FROM ? (
                <div className='relative'>
                    <Search
                        className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                        aria-hidden='true'
                    />
                    <Input
                        type='search'
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('channel.private.search')}
                        aria-label={t('channel.private.search')}
                        className='pl-9'
                        disabled={disabled}
                    />
                </div>
            ) : null}
            {/* Six rows and the top half of a seventh, then it scrolls: the cut row says there is more. */}
            <div className='relative'>
                <ul aria-labelledby={labelId} className='max-h-[206px] overflow-y-auto pr-1'>
                    {roles.map((role) => {
                        const locked = role.administrator
                        return (
                            <li key={role.id}>
                                <label
                                    className={cn(
                                        'flex h-8 items-center gap-2 rounded-input px-1 text-body-sm',
                                        locked ? 'text-text-tertiary' : 'cursor-pointer text-text-primary'
                                    )}
                                >
                                    <Checkbox
                                        checked={locked || selected.includes(role.id)}
                                        aria-disabled={locked || undefined}
                                        disabled={disabled}
                                        readOnly={locked}
                                        className={
                                            locked
                                                ? '[&_input]:cursor-default [&_input]:border-border [&_input]:bg-surface-3'
                                                : undefined
                                        }
                                        onChange={(event) => !locked && toggle(role.id, event.target.checked)}
                                    />
                                    <span className='min-w-0 truncate'>
                                        {locked ? `${role.name} · ${t('channel.private.administrator')}` : role.name}
                                    </span>
                                    {server.roleIds.includes(role.id) ? <Tag>{t('channel.private.yours')}</Tag> : null}
                                </label>
                            </li>
                        )
                    })}
                    {roles.length === 0 ? (
                        <li className='px-1 py-2 text-label text-text-tertiary'>
                            {t('channel.private.noMatch', { query: query.trim() })}
                        </li>
                    ) : null}
                </ul>
                {roles.length > 6 ? (
                    <div
                        className='pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-surface-1'
                        aria-hidden='true'
                    />
                ) : null}
            </div>
            {losesIt ? (
                <FormMessage tone='neutral' icon='eye-off'>
                    {t(editing ? 'channel.private.selfHiddenEdit' : 'channel.private.selfHidden')}
                </FormMessage>
            ) : null}
        </div>
    )
}
