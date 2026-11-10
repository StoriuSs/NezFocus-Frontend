import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useBlocker, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { SaveBar } from '@/components/settings/SaveBar'
import { SettingsGroup, SettingsRow } from '@/components/settings/SettingsRow'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useDeleteRole, useServerRoles, useUpdateRole } from '../../../api/useRoles'
import { can, type PermissionName } from '../../../lib/permissions'
import { holdsAllOf, PERMISSION_GROUPS, roleLock, withPermission } from '../../../lib/roles'
import { serverSettingsPath } from '../../../lib/settings-sections'
import type { Role, Server } from '../../../types'
import { RoleMembers } from './RoleMembers'
import { checkRoleName, nameProblemOf, RoleNameField, type RoleNameProblem } from './RoleNameField'

/** Shown on @everyone under these switches (04, rà soát 30/10/2026). */
const EVERYONE_WARNED: PermissionName[] = ['VIEW_CHANNEL', 'SEND_MESSAGES', 'CONNECT']

/**
 * One role (S-SET-02 `edit-role`, `/settings/roles/{id}`): its name (save
 * bar), "allow anyone to mention", the 22 permissions in their groups, each
 * saved as it is flipped, and "Delete role"; a second tab lists who holds it.
 * A role at or above their own highest opens read-only; a permission they
 * lack is locked (D-148); with Administrator on, the others grey out.
 */
export function RoleEditor({ server, roleId }: { server: Server; roleId: string }) {
    const { t } = useTranslation('servers')
    const roles = useServerRoles(server.id)
    const [params, setParams] = useSearchParams()
    const back = serverSettingsPath(server.id, 'roles')

    const role = roles.data?.find((candidate) => candidate.id === roleId)
    // Still loading, or reloading after a change that may have made it (a role just created).
    if (roles.isPending || (!role && roles.isFetching)) {
        return (
            <Page>
                <Skeleton className='h-8 w-48' />
                <Skeleton className='h-40 w-full' />
            </Page>
        )
    }
    if (roles.isError) throw roles.error
    if (!role) return <Gone to={back} message={t('roles.edit.gone')} />

    const lock = roleLock(server, role)
    const tab = params.get('tab') === 'members' && !role.isEveryone ? 'members' : 'permissions'
    const tabs = [
        { id: 'permissions', label: t('roles.edit.tabPermissions') },
        { id: 'members', label: t('roles.edit.tabMembers', { count: role.memberCount }) }
    ] as const

    return (
        <Page>
            <div>
                <Button asChild variant='text' size='sm' className='-ml-3'>
                    <Link to={back}>
                        <ArrowLeft aria-hidden='true' />
                        {t('roles.edit.back')}
                    </Link>
                </Button>
            </div>
            <h2 className='truncate text-title-2 font-semibold text-text-primary'>{role.name}</h2>
            {role.isEveryone ? null : (
                <div role='tablist' aria-label={role.name} className='flex gap-4 border-b'>
                    {tabs.map((item) => (
                        <button
                            key={item.id}
                            type='button'
                            role='tab'
                            id={`role-tab-${item.id}`}
                            aria-selected={tab === item.id}
                            aria-controls={`role-panel-${item.id}`}
                            onClick={() =>
                                setParams(item.id === 'members' ? { tab: 'members' } : {}, { replace: true })
                            }
                            className={cn(
                                'border-b-2 pb-2 text-body-sm transition-colors duration-micro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                tab === item.id
                                    ? 'border-primary font-semibold text-text-primary'
                                    : 'border-transparent text-text-secondary hover:text-text-primary'
                            )}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
            <div
                role={role.isEveryone ? undefined : 'tabpanel'}
                id={`role-panel-${tab}`}
                aria-labelledby={role.isEveryone ? undefined : `role-tab-${tab}`}
                className='flex flex-1 flex-col gap-6'
            >
                {tab === 'members' ? (
                    <RoleMembers server={server} role={role} roles={roles.data} readOnly={lock !== null} />
                ) : (
                    <Permissions key={role.id} server={server} role={role} roles={roles.data} lock={lock} />
                )}
            </div>
        </Page>
    )
}

function Page({ children }: { children: React.ReactNode }) {
    return <div className='flex w-full max-w-settings flex-1 flex-col gap-4 p-6 pb-6 lg:p-8 lg:pb-6'>{children}</div>
}

/** Back to the list, saying why (once: StrictMode runs effects twice). */
function Gone({ to, message }: { to: string; message: string }) {
    useEffect(() => {
        toast(message, { id: 'role-gone' })
    }, [message])
    return <Navigate to={to} replace />
}

function Permissions({
    server,
    role,
    roles,
    lock
}: {
    server: Server
    role: Role
    roles: Role[]
    lock: 'mine' | 'above' | null
}) {
    const { t } = useTranslation('servers')
    const update = useUpdateRole(server.id, role.id)
    /** The set as last flipped here, until every save of it is answered (Q3: switches save at once). */
    const [shown, setShown] = useState<string | null>(null)
    const pending = useRef(0)
    const bits = shown ?? role.permissions
    const readOnly = lock !== null
    const adminOn = can(bits, 'ADMINISTRATOR')

    function flip(name: PermissionName, on: boolean) {
        const next = withPermission(bits, name, on)
        setShown(next)
        pending.current += 1
        update
            .mutateAsync({ permissions: next })
            .catch(() => toast.error(t('roles.saveFailed')))
            .finally(() => {
                pending.current -= 1
                if (pending.current === 0) setShown(null)
            })
    }

    function mention(on: boolean) {
        update.mutateAsync({ mentionable: on }).catch(() => toast.error(t('roles.saveFailed')))
    }

    return (
        <>
            {lock ? (
                <FormMessage tone='neutral' icon='lock'>
                    {t(lock === 'mine' ? 'roles.edit.readonlyMine' : 'roles.edit.readonlyAbove')}
                </FormMessage>
            ) : null}
            {role.isEveryone ? (
                <p className='text-body-sm text-text-secondary'>{t('roles.edit.everyoneIntro')}</p>
            ) : (
                <RoleNameForm server={server} role={role} roles={roles} readOnly={readOnly}>
                    <ToggleRow
                        label={t('roles.edit.mention', { name: role.name })}
                        description={t('roles.edit.mentionDescription', { name: role.name })}
                        checked={role.mentionable}
                        disabled={readOnly}
                        onChange={mention}
                    />
                </RoleNameForm>
            )}
            {PERMISSION_GROUPS.map((group) => (
                <SettingsGroup key={group.id} id={`role-group-${group.id}`} title={t(`roles.edit.groups.${group.id}`)}>
                    {group.permissions.map((name) => {
                        const missing = !can(server.permissions, name)
                        const greyed = adminOn && name !== 'ADMINISTRATOR'
                        return (
                            <div key={name}>
                                <ToggleRow
                                    label={t(`roles.permissions.${name}.label`)}
                                    description={
                                        t(`roles.permissions.${name}.description`, { defaultValue: '' }) || undefined
                                    }
                                    checked={can(bits, name)}
                                    disabled={readOnly || greyed}
                                    dim={greyed}
                                    lockedReason={
                                        !readOnly && !greyed && missing ? t('roles.edit.lockedSwitch') : undefined
                                    }
                                    onChange={(on) => flip(name, on)}
                                />
                                {name === 'ADMINISTRATOR' && adminOn ? (
                                    <FormMessage tone='neutral' icon='info'>
                                        {t('roles.edit.adminOn')}
                                    </FormMessage>
                                ) : null}
                                {role.isEveryone && EVERYONE_WARNED.includes(name) && !readOnly ? (
                                    <p className='pb-2 text-label text-text-secondary'>
                                        {t('roles.edit.everyoneWarning')}
                                    </p>
                                ) : null}
                            </div>
                        )
                    })}
                </SettingsGroup>
            ))}
            {role.isEveryone || readOnly ? null : <DeleteRole server={server} role={role} />}
        </>
    )
}

/** A permission or "mention" row: a switch, locked with a reason when they may not flip it. */
function ToggleRow({
    label,
    description,
    checked,
    disabled,
    dim,
    lockedReason,
    onChange
}: {
    label: string
    description?: string
    checked: boolean
    disabled: boolean
    dim?: boolean
    lockedReason?: string
    onChange: (on: boolean) => void
}) {
    const id = useId()
    const control = (
        <Switch
            id={id}
            checked={checked}
            disabled={disabled}
            onCheckedChange={onChange}
            aria-describedby={description ? `${id}-description` : undefined}
        />
    )
    return (
        <div className='flex items-center gap-4 py-2'>
            <div className='min-w-0 flex-1'>
                <label
                    htmlFor={id}
                    className={cn(
                        'block text-body-sm',
                        dim ? 'text-text-tertiary' : 'text-text-primary',
                        !disabled && 'cursor-pointer'
                    )}
                >
                    {label}
                </label>
                {description ? (
                    <p id={`${id}-description`} className='max-w-md text-label text-text-tertiary'>
                        {description}
                    </p>
                ) : null}
            </div>
            {lockedReason ? (
                // Focusable while locked (aria-disabled, not disabled), so the reason shows on focus too.
                <WithTooltip label={lockedReason}>
                    <Switch
                        id={id}
                        checked={checked}
                        aria-disabled
                        onCheckedChange={() => undefined}
                        aria-describedby={description ? `${id}-description` : undefined}
                        className='cursor-not-allowed opacity-50'
                    />
                </WithTooltip>
            ) : (
                control
            )}
        </div>
    )
}

/**
 * The role's name, edited in place with the save bar (as S-SET-01): Enter
 * saves, Esc discards, leaving with a draft asks first.
 */
function RoleNameForm({
    server,
    role,
    roles,
    readOnly,
    children
}: {
    server: Server
    role: Role
    roles: Role[]
    readOnly: boolean
    children: React.ReactNode
}) {
    const { t } = useTranslation('servers')
    const update = useUpdateRole(server.id, role.id)
    const input = useRef<HTMLInputElement>(null)
    const [draft, setDraft] = useState<string | null>(null)
    const [problem, setProblem] = useState<RoleNameProblem | null>(null)
    const value = draft ?? role.name
    const dirty = draft !== null && draft.normalize('NFC').trim() !== role.name

    useEffect(() => {
        if (!dirty) return
        const ask = (event: BeforeUnloadEvent) => event.preventDefault()
        window.addEventListener('beforeunload', ask)
        return () => window.removeEventListener('beforeunload', ask)
    }, [dirty])
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname
    )

    function discard() {
        setDraft(null)
        setProblem(null)
    }

    function save(event: FormEvent) {
        event.preventDefault()
        if (!dirty || update.isPending) return
        const found = checkRoleName(value, roles, role.id)
        if (found) {
            setProblem(found)
            return input.current?.focus()
        }
        update.mutate(
            { name: value.normalize('NFC').trim() },
            {
                onSuccess: () => {
                    setDraft(null)
                    toast.success(t('roles.saved'))
                },
                onError: (error) => {
                    const refused = nameProblemOf(error)
                    if (refused) {
                        setProblem(refused)
                        input.current?.focus()
                    } else toast.error(t('roles.saveFailed'))
                }
            }
        )
    }

    return (
        <form onSubmit={save} className='flex flex-col gap-4' noValidate>
            <div className='max-w-[400px]'>
                <RoleNameField
                    ref={input}
                    value={value}
                    roles={roles}
                    problem={problem}
                    readOnly={readOnly || update.isPending}
                    onEscape={dirty ? discard : undefined}
                    onChange={(typed) => {
                        setDraft(typed)
                        setProblem(null)
                    }}
                />
            </div>
            {children}
            {dirty ? <SaveBar saving={update.isPending} onDiscard={discard} /> : null}
            <Dialog open={blocker.state === 'blocked'} onOpenChange={(open) => !open && blocker.reset?.()}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('settings.overview.discard.title')}</DialogTitle>
                        <DialogDescription>{t('settings.overview.discard.description')}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type='button' variant='text' onClick={() => blocker.reset?.()}>
                            {t('settings.overview.discard.stay')}
                        </Button>
                        <Button
                            type='button'
                            variant='destructive'
                            onClick={() => {
                                discard()
                                blocker.proceed?.()
                            }}
                        >
                            {t('settings.overview.discard.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </form>
    )
}

/**
 * "Delete role" at the foot of the page, asking first (`delete-confirm`).
 * Locked unless they hold every permission of the role: deleting it takes
 * those from its members (D-148).
 */
function DeleteRole({ server, role }: { server: Server; role: Role }) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const remove = useDeleteRole(server.id)
    const [asking, setAsking] = useState(false)
    const allowed = holdsAllOf(server.permissions, role)
    // Focusable while locked (aria-disabled, not disabled), so the reason shows on focus too.
    const button = (
        <Button
            variant='destructive'
            size='sm'
            aria-disabled={!allowed}
            className={cn(!allowed && 'cursor-not-allowed opacity-50')}
            onClick={() => allowed && setAsking(true)}
        >
            {t('roles.edit.delete')}
        </Button>
    )

    return (
        <>
            <SettingsRow
                className='mt-2 border-t pt-4'
                label={t('roles.edit.delete')}
                description={t('roles.edit.deleteDescription', { count: role.memberCount })}
                control={allowed ? button : <WithTooltip label={t('roles.edit.deleteLocked')}>{button}</WithTooltip>}
            />
            <Dialog open={asking} onOpenChange={(open) => !open && !remove.isPending && setAsking(false)}>
                <DialogContent className='sm:max-w-dialog'>
                    <DialogHeader>
                        <DialogTitle>{t('roles.edit.deleteTitle', { name: role.name })}</DialogTitle>
                        <DialogDescription>{t('roles.edit.deleteBody', { count: role.memberCount })}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type='button'
                            variant='text'
                            disabled={remove.isPending}
                            onClick={() => setAsking(false)}
                        >
                            {t('roles.edit.cancel')}
                        </Button>
                        <Button
                            type='button'
                            variant='destructive'
                            disabled={remove.isPending}
                            onClick={() =>
                                remove.mutate(role.id, {
                                    onSuccess: () => {
                                        toast(t('roles.edit.deleted', { name: role.name }))
                                        void navigate(serverSettingsPath(server.id, 'roles'), { replace: true })
                                    },
                                    onError: () => toast.error(t('roles.saveFailed'))
                                })
                            }
                        >
                            {remove.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t('roles.edit.deleteSubmit')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
