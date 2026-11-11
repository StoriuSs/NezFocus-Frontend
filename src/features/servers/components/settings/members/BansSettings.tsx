import '@/i18n/servers'
import { useId, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { FormMessage } from '@/components/form/FormMessage'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { folded } from '@/lib/utils'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { getApiErrorType } from '@/lib/api-error'
import { userKeys, type UserSettings } from '@/features/users'
import { useServerBans, useUnbanMember } from '../../../api/useModeration'
import type { PageSize } from '../../../api/roles.api'
import { tableDate } from '../../../lib/moderation'
import type { BanItem, Server } from '../../../types'
import { Pagination } from '../Pagination'

type Person = BanItem['user']

/** The search box shows past ten people (04 S-SET-04, Q9). */
const SEARCH_FROM = 11
const SIZES: PageSize[] = [10, 50, 100]

/**
 * Bans (S-SET-04 `bans`, BAN_MEMBERS): newest first, with the reason, the day
 * and who banned; a row opens the details, "Bỏ cấm" asks first. Paged like
 * the Members page (D-90); the search box filters the page shown.
 */
export function BansSettings({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const [params, setParams] = useSearchParams()
    const limit = (SIZES as number[]).includes(Number(params.get('limit')))
        ? (Number(params.get('limit')) as PageSize)
        : 50
    const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
    const bans = useServerBans(server.id, page, limit)
    const [query, setQuery] = useState('')
    const [open, setOpen] = useState<BanItem | null>(null)
    const [unbanning, setUnbanning] = useState<BanItem | null>(null)

    function go(next: { page?: number; limit?: PageSize }) {
        const query = new URLSearchParams()
        const nextLimit = next.limit ?? limit
        const nextPage = next.limit ? 1 : (next.page ?? page)
        if (nextPage !== 1) query.set('page', String(nextPage))
        if (nextLimit !== 50) query.set('limit', String(nextLimit))
        setParams(query)
    }

    const total = bans.data?.meta.totalItems ?? 0
    const words = folded(query.trim())
    const shown = (bans.data?.items ?? []).filter(
        (ban) => !words || folded(`${ban.user.displayName ?? ''} ${ban.user.username ?? ''}`).includes(words)
    )

    return (
        <div className='flex w-full max-w-settings flex-1 flex-col gap-4 p-6 lg:p-8'>
            <p className='text-body-sm text-text-secondary'>{t('bans.description')}</p>
            {total >= SEARCH_FROM ? (
                <div className='relative w-80'>
                    <Search
                        aria-hidden='true'
                        className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                    />
                    <Input
                        type='search'
                        className='pl-9'
                        aria-label={t('bans.search')}
                        placeholder={t('bans.search')}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
            ) : null}

            {bans.isPending ? (
                <div className='grid gap-2' aria-busy='true'>
                    {[0, 1, 2].map((row) => (
                        <Skeleton key={row} className='h-12 w-full' />
                    ))}
                </div>
            ) : bans.isError ? (
                <EmptyState
                    className='mx-auto mt-6'
                    title={t('bans.loadFailed')}
                    actions={
                        <Button variant='secondary' onClick={() => void bans.refetch()}>
                            {t('bans.retry')}
                        </Button>
                    }
                >
                    {t('join.loadFailedBody')}
                </EmptyState>
            ) : total === 0 ? (
                <EmptyState className='mx-auto mt-6' title={t('bans.emptyTitle')}>
                    {t('bans.emptyBody')}
                </EmptyState>
            ) : shown.length === 0 ? (
                <EmptyState className='mx-auto mt-6' title={t('bans.noMatch', { q: query.trim() })}>
                    {null}
                </EmptyState>
            ) : (
                <div role='table' aria-label={t('bans.description')} className='grid'>
                    <div role='row' className='flex items-center gap-3 pb-2 text-label uppercase text-text-tertiary'>
                        <span role='columnheader' className='w-48 shrink-0'>
                            {t('bans.columns.user')}
                        </span>
                        <span role='columnheader' className='min-w-0 flex-1'>
                            {t('bans.columns.reason')}
                        </span>
                        <span role='columnheader' className='w-24 shrink-0'>
                            {t('bans.columns.date')}
                        </span>
                        <span role='columnheader' className='w-28 shrink-0'>
                            {t('bans.columns.by')}
                        </span>
                        <span role='columnheader' className='w-24 shrink-0'>
                            <span className='sr-only'>{t('bans.unban')}</span>
                        </span>
                    </div>
                    {shown.map((ban) => (
                        <BanRow
                            key={ban.user.userId}
                            ban={ban}
                            onOpen={() => setOpen(ban)}
                            onUnban={() => setUnbanning(ban)}
                        />
                    ))}
                </div>
            )}

            {bans.data ? (
                <Pagination
                    page={page}
                    limit={limit}
                    total={total}
                    of={t('pagination.ofBans', { count: total })}
                    perPage={t('pagination.bansPerPage')}
                    onPage={(next) => go({ page: next })}
                    onLimit={(next) => go({ limit: next })}
                />
            ) : null}

            {open ? <BanDetail ban={open} onClose={() => setOpen(null)} onUnban={() => setUnbanning(open)} /> : null}
            {unbanning ? (
                <UnbanDialog
                    serverId={server.id}
                    ban={unbanning}
                    onClose={() => setUnbanning(null)}
                    onDone={() => {
                        setUnbanning(null)
                        setOpen(null)
                    }}
                />
            ) : null}
        </div>
    )
}

function useBanDate() {
    const { i18n } = useTranslation()
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery<UserSettings>({ queryKey: userKeys.settings(), enabled: false }).data?.timezone
    return (at: string | Date) => tableDate(new Date(at), i18n.language, timeZone)
}

/** Name, then username under it (C-39 › Người thực hiện); "Tài khoản đã bị xóa" once gone. */
function PersonName({ person }: { person: Person }) {
    const { t } = useTranslation('servers')
    const name = person.displayName ?? person.username
    if (!name) return <span className='text-body-sm text-text-tertiary'>{t('bans.deleted')}</span>
    return (
        <span className='grid min-w-0 text-left'>
            <span className='truncate text-body-sm text-text-primary'>{name}</span>
            {person.username ? <span className='truncate text-label text-text-tertiary'>{person.username}</span> : null}
        </span>
    )
}

function BanRow({ ban, onOpen, onUnban }: { ban: BanItem; onOpen: () => void; onUnban: () => void }) {
    const { t } = useTranslation('servers')
    const date = useBanDate()
    return (
        <div role='row' className='flex min-h-12 items-center gap-3 border-t border-border py-2'>
            <span role='cell' className='flex w-48 shrink-0'>
                {/* The details open from the person (Enter too, 04 › Bàn phím). */}
                <button
                    type='button'
                    onClick={onOpen}
                    className='flex min-w-0 flex-1 items-center gap-3 rounded-button hover:bg-surface-2'
                >
                    <Avatar className='size-8'>
                        <AvatarImage src={ban.user.avatarUrl ?? undefined} alt='' className='object-cover' />
                        <AvatarFallback className='bg-surface-3 text-label font-semibold text-text-primary'>
                            {(ban.user.displayName ?? ban.user.username ?? '?').slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <PersonName person={ban.user} />
                </button>
            </span>
            <span role='cell' className='min-w-0 flex-1 truncate text-body-sm text-text-secondary'>
                {ban.reason ?? <span className='text-text-tertiary'>—</span>}
            </span>
            <span role='cell' className='w-24 shrink-0 text-label text-text-secondary'>
                {date(ban.createdAt)}
            </span>
            <span role='cell' className='flex w-28 shrink-0'>
                {ban.bannedBy ? <PersonName person={ban.bannedBy} /> : <span className='text-text-tertiary'>—</span>}
            </span>
            <span role='cell' className='flex w-24 shrink-0 justify-end'>
                <Button type='button' variant='text' size='sm' onClick={onUnban}>
                    {t('bans.unban')}
                </Button>
            </span>
        </div>
    )
}

/** `ban-detail` (`simple` 440): the person, the whole reason, when and by whom. */
function BanDetail({ ban, onClose, onUnban }: { ban: BanItem; onClose: () => void; onUnban: () => void }) {
    const { t } = useTranslation('servers')
    const date = useBanDate()
    const reasonId = useId()
    const name = ban.user.displayName ?? ban.user.username ?? t('bans.deleted')
    const by = ban.bannedBy?.displayName ?? ban.bannedBy?.username
    const byLine = by
        ? t('bans.bannedBy', {
              date: date(ban.createdAt),
              name: ban.bannedBy?.username ? `${by} (${ban.bannedBy.username})` : by
          })
        : t('bans.bannedOn', { date: date(ban.createdAt) })
    return (
        <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader className='flex-row items-center gap-3'>
                    <Avatar className='size-12'>
                        <AvatarImage src={ban.user.avatarUrl ?? undefined} alt='' className='object-cover' />
                        <AvatarFallback className='bg-surface-3 text-body font-semibold text-text-primary'>
                            {name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <span className='grid'>
                        <DialogTitle>{name}</DialogTitle>
                        <DialogDescription>{ban.user.username}</DialogDescription>
                    </span>
                </DialogHeader>
                {/* The whole reason, its line breaks kept: a read-only field (C-22 `read-only`). */}
                <div className='grid gap-2'>
                    <Label htmlFor={reasonId}>{t('bans.reason')}</Label>
                    <Textarea id={reasonId} readOnly value={ban.reason ?? t('bans.noReason')} />
                </div>
                <p className='text-label text-text-tertiary'>{byLine}</p>
                <DialogFooter>
                    <Button type='button' variant='text' onClick={onClose}>
                        {t('bans.close')}
                    </Button>
                    <Button type='button' variant='secondary' onClick={onUnban}>
                        {t('bans.unban')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** `unban-confirm` (`simple` 440); one already lifted elsewhere counts as done. */
function UnbanDialog({
    serverId,
    ban,
    onClose,
    onDone
}: {
    serverId: string
    ban: BanItem
    onClose: () => void
    onDone: () => void
}) {
    const { t } = useTranslation('servers')
    const unban = useUnbanMember(serverId)
    const [failed, setFailed] = useState(false)
    const name = ban.user.displayName ?? ban.user.username ?? t('bans.deleted')

    function confirm() {
        setFailed(false)
        unban.mutate(ban.user.userId, {
            onSuccess: () => {
                toast(t('bans.unbanned', { name }))
                onDone()
            },
            onError: (error) => {
                if (getApiErrorType(error) !== 'NOT_FOUND_ERROR') return setFailed(true)
                onDone()
            }
        })
    }

    return (
        <Dialog open onOpenChange={(isOpen) => !isOpen && !unban.isPending && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('bans.confirmTitle', { name })}</DialogTitle>
                    <DialogDescription>{t('bans.confirmBody', { name })}</DialogDescription>
                </DialogHeader>
                {failed ? <FormMessage tone='danger'>{t('bans.failed')}</FormMessage> : null}
                <DialogFooter>
                    <Button type='button' variant='text' disabled={unban.isPending} onClick={onClose}>
                        {t('bans.cancel')}
                    </Button>
                    <Button type='button' disabled={unban.isPending} onClick={confirm}>
                        {unban.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('bans.unban')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
