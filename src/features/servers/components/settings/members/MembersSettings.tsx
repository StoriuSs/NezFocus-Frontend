import '@/i18n/servers'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, MoreHorizontal, Search } from 'lucide-react'
import { Tag } from '@/components/settings/SettingsRow'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/features/auth'
import { userKeys, type UserSettings } from '@/features/users'
import { useEndTimeout } from '../../../api/useModeration'
import { useServerMembers, useServerRoles } from '../../../api/useRoles'
import type { MemberSort, PageSize, SortOrder } from '../../../api/roles.api'
import {
    assignableRoles,
    endsAt,
    hasActions,
    heldRoles,
    isTimedOut,
    rowActions,
    tableDate
} from '../../../lib/moderation'
import { can } from '../../../lib/permissions'
import type { Role, Server, ServerMember } from '../../../types'
import { Pagination } from '../Pagination'
import { MemberIdentity, memberName } from '../roles/RoleMembers'
import { ModerationDialogFor, type Moderation } from './ModerationDialogs'
import { RolePicker } from './RolePicker'

/** The first way each column runs when clicked (04 › Sắp xếp): A → Z, highest role first, newest first. */
const FIRST_ORDER: Record<MemberSort, SortOrder> = { name: 'asc', role: 'desc', joined_at: 'desc' }
const SORTS: MemberSort[] = ['name', 'role', 'joined_at']
const SIZES: PageSize[] = [10, 50, 100]
/** Search waits for typing to stop (04 › Chuyển trang). */
const TYPING_PAUSE_MS = 300

/** Page, size, order and words from the URL (D-90): reload and Back keep the place. */
function useListState() {
    const [params, setParams] = useSearchParams()
    const sort = (SORTS as string[]).includes(params.get('sort') ?? '') ? (params.get('sort') as MemberSort) : 'name'
    const order: SortOrder =
        params.get('order') === 'desc' ? 'desc' : params.get('order') === 'asc' ? 'asc' : FIRST_ORDER[sort]
    const limit = (SIZES as number[]).includes(Number(params.get('limit')))
        ? (Number(params.get('limit')) as PageSize)
        : 50
    const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
    const q = params.get('q') ?? ''

    /** Anything but the page itself starts again from page 1. */
    function change(next: Partial<{ sort: MemberSort; order: SortOrder; limit: PageSize; page: number; q: string }>) {
        const merged = { sort, order, limit, q, page: next.page ?? 1, ...next }
        const query = new URLSearchParams()
        if (merged.page !== 1) query.set('page', String(merged.page))
        if (merged.limit !== 50) query.set('limit', String(merged.limit))
        if (merged.sort !== 'name' || merged.order !== 'asc') {
            query.set('sort', merged.sort)
            query.set('order', merged.order)
        }
        if (merged.q) query.set('q', merged.q)
        setParams(query, { replace: next.page === undefined && next.q !== undefined })
    }
    return { sort, order, limit, page, q, change }
}

/**
 * Members (S-SET-03): find someone, give or take roles ("+"), and time out,
 * kick or ban from ⋯. Sorted and paged by the backend (D-89, D-90).
 */
export function MembersSettings({ server }: { server: Server }) {
    const { t, i18n } = useTranslation('servers')
    const myId = useAuthStore((state) => state.user?.id) ?? ''
    const now = useMinuteClock()
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    const list = useListState()
    const members = useServerMembers(server.id, {
        q: list.q || undefined,
        sort: list.sort,
        order: list.order,
        page: list.page,
        limit: list.limit
    })
    const managesRoles = can(server.permissions, 'MANAGE_ROLES')
    const roles = useServerRoles(server.id, managesRoles)
    // Refused: the hook says so, with "Try again".
    const endTimeout = useEndTimeout(server.id)
    const [acting, setActing] = useState<{ kind: Moderation; member: ServerMember } | null>(null)

    // The box and the words on the URL (D-90). Typing waits for a pause, then
    // puts the words on the URL; `ownQ` keeps them, so the URL catching up
    // (React Router renders it as non-urgent, maybe after more keys) leaves the box alone, while
    // Back or a link, bringing other words, puts theirs in it.
    const [typed, setTyped] = useState(list.q)
    const [ownQ, setOwnQ] = useState(list.q)
    const [shownQ, setShownQ] = useState(list.q)
    if (shownQ !== list.q) {
        setShownQ(list.q)
        if (list.q !== ownQ) {
            setTyped(list.q)
            setOwnQ(list.q)
        }
    }
    const latest = useRef(list)
    useEffect(() => {
        latest.current = list
    })
    const pause = useRef<ReturnType<typeof setTimeout>>(undefined)
    useEffect(() => () => clearTimeout(pause.current), [])

    function type(value: string) {
        setTyped(value)
        clearTimeout(pause.current)
        const from = list.q
        pause.current = setTimeout(() => {
            // Back or a link during the pause: their words stay.
            if (latest.current.q !== from) return
            const q = value.trim()
            setOwnQ(q)
            if (q !== from) latest.current.change({ q })
        }, TYPING_PAUSE_MS)
    }

    // A page past the last (someone left meanwhile) goes to the last one.
    const totalPages = members.data?.meta.totalPages ?? 1
    useEffect(() => {
        if (members.data && list.page > Math.max(1, totalPages)) list.change({ page: Math.max(1, totalPages) })
    }, [members.data, list, totalPages])

    function end(member: ServerMember) {
        endTimeout.mutate({ userId: member.userId, name: memberName(member) })
    }

    const total = members.data?.meta.totalItems ?? 0

    return (
        <div className='flex w-full max-w-settings flex-1 flex-col gap-4 p-6 lg:p-8'>
            <div className='flex items-center gap-3'>
                <div className='relative w-80'>
                    <Search
                        aria-hidden='true'
                        className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                    />
                    <Input
                        type='search'
                        className='pl-9'
                        aria-label={t('members.search')}
                        placeholder={t('members.search')}
                        disabled={members.isPending}
                        value={typed}
                        onChange={(event) => type(event.target.value)}
                    />
                </div>
                {members.data ? (
                    <span className='ml-auto text-label text-text-tertiary'>
                        {t(list.q ? 'members.results' : 'members.count', { count: total })}
                    </span>
                ) : null}
            </div>

            {members.isPending ? (
                <div className='grid gap-2' aria-busy='true'>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
                        <Skeleton key={row} className='h-12 w-full' />
                    ))}
                </div>
            ) : members.isError ? (
                <EmptyState
                    className='mx-auto mt-6'
                    title={t('members.loadFailed')}
                    actions={
                        <Button variant='secondary' onClick={() => void members.refetch()}>
                            {t('members.retry')}
                        </Button>
                    }
                >
                    {t('join.loadFailedBody')}
                </EmptyState>
            ) : members.data.items.length === 0 ? (
                <EmptyState className='mx-auto mt-6' title={t('members.noMatch', { q: list.q })}>
                    {null}
                </EmptyState>
            ) : (
                <div role='table' aria-label={t('members.columns.member')} aria-rowcount={total} className='grid'>
                    <div role='row' className='flex items-center gap-3 pb-2 text-label uppercase text-text-tertiary'>
                        {SORTS.map((sort) => (
                            <SortHeader
                                key={sort}
                                sort={sort}
                                active={list.sort === sort ? list.order : null}
                                onSort={(order) => list.change({ sort, order })}
                            />
                        ))}
                        <span role='columnheader' className='w-8 shrink-0'>
                            <span className='sr-only'>{t('members.actions', { name: '' })}</span>
                        </span>
                    </div>
                    {members.data.items.map((member) => {
                        const actions = rowActions(server, member, now)
                        const assignable =
                            managesRoles && roles.data ? assignableRoles(server, myId, member, roles.data) : []
                        return (
                            <MemberRow
                                key={member.userId}
                                member={member}
                                server={server}
                                now={now}
                                timeZone={timeZone}
                                language={i18n.language}
                                assignable={assignable}
                                menu={
                                    hasActions(actions) ? (
                                        <DropdownMenu>
                                            <WithTooltip label={t('members.actions', { name: memberName(member) })}>
                                                <DropdownMenuTrigger asChild>
                                                    <IconButton
                                                        label={t('members.actions', { name: memberName(member) })}
                                                    >
                                                        <MoreHorizontal />
                                                    </IconButton>
                                                </DropdownMenuTrigger>
                                            </WithTooltip>
                                            <DropdownMenuContent align='end'>
                                                {actions.timeout ? (
                                                    <DropdownMenuItem
                                                        onSelect={() => setActing({ kind: 'timeout', member })}
                                                    >
                                                        {t(
                                                            isTimedOut(member, now)
                                                                ? 'members.menu.changeTimeout'
                                                                : 'members.menu.timeout'
                                                        )}
                                                    </DropdownMenuItem>
                                                ) : null}
                                                {actions.endTimeout ? (
                                                    <DropdownMenuItem onSelect={() => end(member)}>
                                                        {t('members.menu.endTimeout')}
                                                    </DropdownMenuItem>
                                                ) : null}
                                                {actions.kick ? (
                                                    <DropdownMenuItem
                                                        className='text-danger'
                                                        onSelect={() => setActing({ kind: 'kick', member })}
                                                    >
                                                        {t('members.menu.kick')}
                                                    </DropdownMenuItem>
                                                ) : null}
                                                {actions.ban ? (
                                                    <DropdownMenuItem
                                                        className='text-danger'
                                                        onSelect={() => setActing({ kind: 'ban', member })}
                                                    >
                                                        {t('members.menu.ban')}
                                                    </DropdownMenuItem>
                                                ) : null}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    ) : null
                                }
                            />
                        )
                    })}
                </div>
            )}

            {members.data ? (
                <Pagination
                    page={list.page}
                    limit={list.limit}
                    total={total}
                    of={t('pagination.ofMembers', { count: total })}
                    perPage={t('pagination.membersPerPage')}
                    onPage={(page) => list.change({ page })}
                    onLimit={(limit) => list.change({ limit })}
                />
            ) : null}

            {acting ? (
                <ModerationDialogFor
                    kind={acting.kind}
                    serverId={server.id}
                    member={acting.member}
                    onClose={() => setActing(null)}
                />
            ) : null}
        </div>
    )
}

/** A column head (C-39 `sortable`): clicked first one way (FIRST_ORDER), then the other; an arrow on the one in use. */
function SortHeader({
    sort,
    active,
    onSort
}: {
    sort: MemberSort
    active: SortOrder | null
    onSort: (order: SortOrder) => void
}) {
    const { t } = useTranslation('servers')
    const label = t(
        sort === 'name'
            ? 'members.columns.member'
            : sort === 'role'
              ? 'members.columns.roles'
              : 'members.columns.joined'
    )
    const next = active === null ? FIRST_ORDER[sort] : active === 'asc' ? 'desc' : 'asc'
    const Arrow = active === 'asc' ? ArrowUp : ArrowDown
    return (
        <span
            role='columnheader'
            aria-sort={active === null ? undefined : active === 'asc' ? 'ascending' : 'descending'}
            className={cn(sort === 'name' ? 'w-56 shrink-0' : sort === 'role' ? 'min-w-0 flex-1' : 'w-24 shrink-0')}
        >
            <WithTooltip label={t(`members.sortBy.${sort}`)}>
                <button
                    type='button'
                    onClick={() => onSort(next)}
                    className='inline-flex items-center gap-1 uppercase hover:text-text-primary'
                >
                    {label}
                    {active ? <Arrow className='size-3.5' aria-hidden='true' /> : null}
                </button>
            </WithTooltip>
        </span>
    )
}

/** AdminRow `member` (C-39): who, their roles and "+", the day they joined, ⋯. */
function MemberRow({
    member,
    server,
    now,
    timeZone,
    language,
    assignable,
    menu
}: {
    member: ServerMember
    server: Server
    now: Date
    timeZone: string | undefined
    language: string
    assignable: Role[]
    menu: ReactNode
}) {
    const { t } = useTranslation('servers')
    const timedOut = isTimedOut(member, now)
    const ends = timedOut ? endsAt(new Date(member.timeoutUntil!), now, language, timeZone) : null
    const note = ends
        ? t('members.timedOutUntil', { time: ends.date ? `${ends.time}, ${ends.date}` : ends.time })
        : null
    const identity = <MemberIdentity member={member} note={note} noteStrong />

    return (
        <div role='row' className='flex min-h-12 items-center gap-3 border-t border-border py-2'>
            <span role='cell' className='flex w-56 shrink-0'>
                {member.timeoutReason ? (
                    <WithTooltip label={t('members.timeoutReason', { reason: member.timeoutReason })}>
                        <span className='flex min-w-0 flex-1'>
                            {identity}
                            <span className='sr-only'>
                                {t('members.timeoutReason', { reason: member.timeoutReason })}
                            </span>
                        </span>
                    </WithTooltip>
                ) : (
                    identity
                )}
            </span>
            <span role='cell' className='flex min-w-0 flex-1 flex-wrap items-center gap-1'>
                {member.isOwner ? <Tag>{t('members.owner')}</Tag> : null}
                {heldRoles(member, server.roles).map((role) => (
                    <Tag key={role.id}>{role.name}</Tag>
                ))}
                {assignable.length > 0 ? <RolePicker serverId={server.id} member={member} roles={assignable} /> : null}
            </span>
            <span role='cell' className='w-24 shrink-0 text-label text-text-secondary'>
                {tableDate(new Date(member.joinedAt), language, timeZone)}
            </span>
            <span role='cell' className='flex w-8 shrink-0 justify-end'>
                {menu}
            </span>
        </div>
    )
}
