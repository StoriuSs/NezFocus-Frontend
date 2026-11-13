import '@/i18n/servers'
import { Fragment, useState, type KeyboardEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, GripVertical, Lock, Plus, Shield, Users } from 'lucide-react'
import {
    closestCenter,
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragMoveEvent
} from '@dnd-kit/core'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipWhenCut, WithTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useReorderRoles, useServerRoles } from '../../../api/useRoles'
import { roleEditPath } from '../../../lib/paths'
import { fixedAtTop, MAX_ROLES, moved, reordered, roleLock, rolesHighestFirst } from '../../../lib/roles'
import type { Role, Server } from '../../../types'
import { DragPreview, DropLine } from '../../channel-list/rows'
import { CreateRoleDialog } from './CreateRoleDialog'

/**
 * Roles (S-SET-02 `list`, MANAGE_ROLES): every role, highest first, with how
 * many hold it, and @everyone fixed below a rule. Drag (or Space, arrows,
 * Space) to reorder the roles below one's own highest (REQ-ROLE-02); a drop
 * saves at once and goes back with "Couldn't save the change" if refused.
 */
export function RolesSettings({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const navigate = useNavigate()
    const roles = useServerRoles(server.id)
    const reorder = useReorderRoles(server.id)
    const [creating, setCreating] = useState(false)
    const [dragged, setDragged] = useState<string | null>(null)
    /** Where it would land: an index in the list without the dragged role. */
    const [target, setTarget] = useState<number | null>(null)
    const [byKeyboard, setByKeyboard] = useState(false)
    const [announcement, setAnnouncement] = useState('')
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

    if (roles.isPending) {
        return (
            <Page>
                <div className='grid gap-2' aria-busy='true'>
                    {[0, 1, 2, 3].map((row) => (
                        <Skeleton key={row} className='h-12 w-full' />
                    ))}
                </div>
            </Page>
        )
    }
    if (roles.isError) {
        return (
            <Page>
                <EmptyState
                    className='mx-auto mt-6'
                    title={t('roles.loadFailed')}
                    actions={
                        <Button variant='secondary' onClick={() => void roles.refetch()}>
                            {t('roles.retry')}
                        </Button>
                    }
                >
                    {t('join.loadFailedBody')}
                </EmptyState>
            </Page>
        )
    }

    const ordered = rolesHighestFirst(roles.data)
    const everyone = roles.data.find((role) => role.isEveryone)
    const ids = ordered.map((role) => role.id)
    const fixed = fixedAtTop(server, ordered)
    const myTop = server.isOwner ? undefined : ordered.find((role) => roleLock(server, role) === 'mine')
    const full = ordered.length >= MAX_ROLES
    const nameOf = (id: string) => ordered.find((role) => role.id === id)?.name ?? ''

    function end() {
        setDragged(null)
        setTarget(null)
        setByKeyboard(false)
    }

    function drop(id: string, at: number | null) {
        end()
        const from = ids.indexOf(id)
        if (at === null || at < fixed) return setAnnouncement(t('roles.drag.cancelled', { name: nameOf(id) }))
        setAnnouncement(t('roles.drag.dropped', { name: nameOf(id), position: at + 1, count: ids.length }))
        if (at === from) return
        const order = moved(ids, id, at)
        // Refused: the list goes back and the hook says so, with "Try again".
        reorder.mutate({ order, seenOrder: ids, shown: reordered(roles.data ?? [], order) })
    }

    function onMove({ active, over }: DragMoveEvent) {
        if (!dragged || !over) return setTarget(null)
        const rect = active.rect.current.translated
        const below = rect ? rect.top + rect.height / 2 > over.rect.top + over.rect.height / 2 : true
        const rest = ids.filter((id) => id !== dragged)
        const index = rest.indexOf(String(over.id))
        setTarget(index < 0 ? null : index + (below ? 1 : 0))
    }

    function onKey(id: string) {
        return (event: KeyboardEvent) => {
            const lifted = byKeyboard && dragged === id
            if (!lifted) {
                if (event.key !== ' ' || dragged) return
                event.preventDefault()
                setDragged(id)
                setByKeyboard(true)
                setTarget(ids.indexOf(id))
                return setAnnouncement(
                    t('roles.drag.lifted', { name: nameOf(id), position: ids.indexOf(id) + 1, count: ids.length })
                )
            }
            if (event.key === 'Escape' || event.key === ' ') {
                event.preventDefault()
                return drop(id, event.key === ' ' ? target : null)
            }
            const step = { ArrowUp: -1, ArrowDown: 1 }[event.key]
            if (!step || target === null) return
            event.preventDefault()
            const next = Math.min(ids.length - 1, Math.max(fixed, target + step))
            setTarget(next)
            setAnnouncement(t('roles.drag.at', { name: nameOf(id), position: next + 1, count: ids.length }))
        }
    }

    const rest = ids.filter((id) => id !== dragged)
    const blocked = target !== null && target < fixed
    const lineAt = (index: number) =>
        dragged && target === index ? <DropLine blocked={blocked} key={`line-${index}`} /> : null
    const draggedRole = ordered.find((role) => role.id === dragged)

    return (
        <Page>
            <p className='text-body-sm text-text-secondary'>
                {t('roles.description')}
                {myTop ? ` ${t('roles.blockedLine', { role: myTop.name })}` : null}
            </p>
            {full ? (
                <FormMessage tone='neutral' icon='info'>
                    {t('roles.limit')}
                </FormMessage>
            ) : null}
            <div className='flex items-center gap-3'>
                <h2 className='flex-1 text-label font-semibold uppercase text-text-tertiary'>
                    {t('roles.group', { count: ordered.length })}
                </h2>
                <WithTooltip label={full ? t('roles.limit') : undefined}>
                    <span>
                        <Button variant='secondary' size='sm' disabled={full} onClick={() => setCreating(true)}>
                            <Plus aria-hidden='true' />
                            {t('roles.create')}
                        </Button>
                    </span>
                </WithTooltip>
            </div>
            {ordered.length === 0 ? <p className='text-body-sm text-text-tertiary'>{t('roles.empty')}</p> : null}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={({ active }) => {
                    const id = String(active.id)
                    setDragged(id)
                    setAnnouncement(
                        t('roles.drag.lifted', { name: nameOf(id), position: ids.indexOf(id) + 1, count: ids.length })
                    )
                }}
                onDragMove={onMove}
                onDragEnd={() => dragged && drop(dragged, target)}
                onDragCancel={() => {
                    if (dragged) setAnnouncement(t('roles.drag.cancelled', { name: nameOf(dragged) }))
                    end()
                }}
                accessibility={{ announcements: QUIET, screenReaderInstructions: { draggable: '' } }}
            >
                <ul className='flex flex-col' aria-describedby={`roles-drag-${server.id}`}>
                    {ordered.map((role) => {
                        const index = rest.indexOf(role.id)
                        return (
                            <Fragment key={role.id}>
                                {index >= 0 ? lineAt(index) : null}
                                <RoleRow
                                    server={server}
                                    role={role}
                                    lock={roleLock(server, role)}
                                    lockedBy={myTop?.name}
                                    lifted={dragged === role.id}
                                    acceptsDrops={dragged !== null}
                                    onKeyDown={onKey(role.id)}
                                />
                            </Fragment>
                        )
                    })}
                    {lineAt(rest.length)}
                </ul>
                <DragOverlay dropAnimation={null}>
                    {draggedRole && !byKeyboard ? (
                        <DragPreview blocked={blocked}>
                            <Shield className='text-text-tertiary' aria-hidden='true' />
                            <span className='truncate'>{draggedRole.name}</span>
                        </DragPreview>
                    ) : null}
                </DragOverlay>
            </DndContext>
            {everyone ? (
                <div className='border-t pt-1'>
                    <Link
                        to={roleEditPath(server.id, everyone.id)}
                        className='flex h-12 items-center gap-3 rounded-button px-3 text-body-sm text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    >
                        <Users className='size-4 shrink-0 text-text-tertiary' aria-hidden='true' />
                        <span className='min-w-0 flex-1 truncate'>@everyone</span>
                        <span className='text-text-secondary'>{t('roles.everyoneValue')}</span>
                        <ChevronRight className='size-4 text-text-tertiary' aria-hidden='true' />
                    </Link>
                </div>
            ) : null}
            <p id={`roles-drag-${server.id}`} className='sr-only'>
                {t('roles.drag.instructions')}
            </p>
            <p aria-live='assertive' className='sr-only'>
                {announcement}
            </p>
            {creating ? (
                <CreateRoleDialog
                    server={server}
                    roles={roles.data}
                    onClose={() => setCreating(false)}
                    onCreated={(roleId) => {
                        setCreating(false)
                        void navigate(roleEditPath(server.id, roleId))
                    }}
                />
            ) : null}
        </Page>
    )
}

function Page({ children }: { children: React.ReactNode }) {
    return <div className='flex w-full max-w-settings flex-1 flex-col gap-4 p-6 lg:p-8'>{children}</div>
}

/** dnd-kit's own announcements are English; the page says its own (aria-live). */
const QUIET = {
    onDragStart: () => '',
    onDragOver: () => '',
    onDragEnd: () => '',
    onDragCancel: () => ''
}

/**
 * AdminRow `role` (C-39): a link to the role, the whole row a handle when it
 * may move (the grip only shows on hover or focus). A role at or above their
 * own highest shows a lock and why, and opens read-only.
 */
function RoleRow({
    server,
    role,
    lock,
    lockedBy,
    lifted,
    acceptsDrops,
    onKeyDown
}: {
    server: Server
    role: Role
    lock: 'mine' | 'above' | null
    lockedBy: string | undefined
    lifted: boolean
    acceptsDrops: boolean
    onKeyDown: (event: KeyboardEvent) => void
}) {
    const { t } = useTranslation('servers')
    const { setNodeRef: dragRef, listeners } = useDraggable({ id: role.id, disabled: lock !== null })
    const { setNodeRef: dropRef } = useDroppable({ id: role.id, disabled: !acceptsDrops })
    const Icon = lock ? Lock : Shield
    const value = lock
        ? t(lock === 'mine' ? 'roles.lockedMine' : 'roles.lockedAbove')
        : role.memberCount === 0
          ? t('roles.nobody')
          : t('roles.memberCount', { count: role.memberCount })

    const row = (
        <Link
            to={roleEditPath(server.id, role.id)}
            onKeyDown={lock ? undefined : onKeyDown}
            aria-roledescription={lock ? undefined : 'sortable'}
            className={cn(
                'group relative flex h-12 items-center gap-3 rounded-button px-3 text-body-sm text-text-primary hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                lifted && 'opacity-40'
            )}
        >
            <GripVertical
                className={cn(
                    'absolute -left-1 size-4 text-text-tertiary opacity-0',
                    !lock && 'group-hover:opacity-100 group-focus-within:opacity-100'
                )}
                aria-hidden='true'
            />
            <Icon className={cn('shrink-0 text-text-tertiary', lock ? 'size-3.5' : 'size-4')} aria-hidden='true' />
            {lock ? (
                <span className='min-w-0 flex-1 truncate'>{role.name}</span>
            ) : (
                <TooltipWhenCut label={role.name}>
                    <span className='min-w-0 flex-1 truncate'>{role.name}</span>
                </TooltipWhenCut>
            )}
            <span className='text-text-secondary'>{value}</span>
            <ChevronRight className='size-4 text-text-tertiary' aria-hidden='true' />
        </Link>
    )

    return (
        <li
            className='border-b'
            ref={(node) => {
                dragRef(node)
                dropRef(node)
            }}
            {...(lock ? {} : listeners)}
        >
            {lock && lockedBy ? (
                <WithTooltip label={t('roles.lockedTooltip', { role: lockedBy })}>{row}</WithTooltip>
            ) : (
                row
            )}
        </li>
    )
}
