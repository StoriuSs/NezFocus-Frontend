import '@/i18n/servers'
import { Suspense, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronRight, Search } from 'lucide-react'
import { FormMessage } from '@/components/form/FormMessage'
import { Button } from '@/components/ui/button'
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
import { Skeleton } from '@/components/ui/skeleton'
import { WithTooltip } from '@/components/ui/tooltip'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useMinuteClock } from '@/hooks/useMinuteClock'
import { cn } from '@/lib/utils'
import { ConfirmPasswordDialog, useAuthStore } from '@/features/auth'
import { settingsCache } from '@/features/users'
import { useTransferOwnership } from '../../api/useMembership'
import { useServerMembers } from '../../api/useRoles'
import { highestRoleName, pageAfterHandover, transferRefusal } from '../../lib/membership'
import { endsAt, isTimedOut } from '../../lib/moderation'
import { useMembershipDialogs, type TransferRecipient } from '../../membership-dialogs.store'
import type { Server, ServerMember } from '../../types'
import { MemberIdentity, memberName } from '../settings/roles/RoleMembers'

/**
 * "Transfer ownership" (04 S-SET-07): choose who (`transfer-picker`), then
 * one's password (`transfer-password`), the second in the first's place:
 * its Cancel comes back to the choice. Chosen from the members' ⋯ menu, it
 * starts on the password (Q15). Done: a Toast, and from the leave flow
 * (`thenLeave`) "Leave server?" next.
 */
export function TransferOwnershipDialog({
    server,
    recipient,
    thenLeave = false,
    onClose
}: {
    server: Server
    recipient?: TransferRecipient
    thenLeave?: boolean
    onClose: () => void
}) {
    const [chosen, setChosen] = useState<TransferRecipient | null>(recipient ?? null)

    if (!chosen) return <PickRecipient server={server} onPick={setChosen} onClose={onClose} />
    return (
        // The password step loads with its first use (auth's index, lazy).
        <Suspense fallback={null}>
            <TransferPassword
                server={server}
                recipient={chosen}
                thenLeave={thenLeave}
                onCancel={recipient ? onClose : () => setChosen(null)}
                onClose={onClose}
            />
        </Suspense>
    )
}

function TransferPassword({
    server,
    recipient,
    thenLeave,
    onCancel,
    onClose
}: {
    server: Server
    recipient: TransferRecipient
    thenLeave: boolean
    onCancel: () => void
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const user = useAuthStore((state) => state.user)
    const show = useMembershipDialogs((state) => state.show)
    const navigate = useNavigate()
    const { pathname } = useLocation()
    const transfer = useTransferOwnership(server.id, async (servers) => {
        const now = servers.find((candidate) => candidate.id === server.id)
        const to = now ? pageAfterHandover(pathname, now) : null
        // flushSync: in place before the cache changes (useMoveAwayFrom).
        if (to) await navigate(to, { replace: true, flushSync: true })
    })
    const name = recipient.name

    return (
        <ConfirmPasswordDialog
            email={user?.email ?? ''}
            username={user?.username}
            title={t('membership.transfer.confirmTitle', { name })}
            description={t('membership.transfer.confirmBody', { name })}
            label={t('membership.transfer.password')}
            submitLabel={t('membership.transfer.submit')}
            onConfirm={async (password) => {
                await transfer.mutateAsync({ userId: recipient.userId, password })
                toast(t('membership.transfer.done', { name }))
                if (thenLeave) show({ kind: 'leave', serverId: server.id })
                else onClose()
            }}
            describeError={(error) => {
                const refusal = transferRefusal(error)
                return refusal ? t(`membership.transfer.refused.${refusal}`, { name }) : null
            }}
            onClose={onCancel}
        />
    )
}

/**
 * `transfer-picker`: everyone who may take it (D-161: not oneself, not an
 * account waiting to be deleted), by name, the first 50 and a search, as
 * "Add members" of a role. Someone timed out is shown but cannot be chosen,
 * with why in place of the username and no role (D-91). ↑ ↓ move between the
 * rows, from the search box too.
 */
function PickRecipient({
    server,
    onPick,
    onClose
}: {
    server: Server
    onPick: (recipient: TransferRecipient) => void
    onClose: () => void
}) {
    const { t, i18n } = useTranslation('servers')
    const tCommon = useTranslation().t
    const now = useMinuteClock()
    // Read only: the AppShell loads the account's settings as the app opens.
    const timeZone = useQuery(settingsCache).data?.timezone
    const [q, setQ] = useState('')
    const query = useDebouncedValue(q.trim(), 250)
    const members = useServerMembers(server.id, {
        q: query || undefined,
        sort: 'name',
        order: 'asc',
        limit: 50,
        transferable: true
    })
    const list = useRef<HTMLUListElement>(null)

    function moveFocus(event: KeyboardEvent) {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
        const rows = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        if (rows.length === 0) return
        event.preventDefault()
        const at = rows.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'ArrowDown' ? (at + 1) % rows.length : at <= 0 ? rows.length - 1 : at - 1
        rows[next]?.focus()
    }

    function timedOutNote(member: ServerMember) {
        const ends = endsAt(new Date(member.timeoutUntil!), now, i18n.language, timeZone)
        return t('membership.transfer.timedOut', { time: ends.date ? `${ends.time}, ${ends.date}` : ends.time })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            {/* The search box takes the focus (Radix gives it the first field). */}
            <DialogContent className='max-w-[520px]'>
                <DialogHeader>
                    <DialogTitle>{t('membership.transfer.title')}</DialogTitle>
                    <DialogDescription>{t('membership.transfer.description', { name: server.name })}</DialogDescription>
                </DialogHeader>
                <div className='grid gap-2'>
                    <div className='relative'>
                        <Search
                            className='pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-tertiary'
                            aria-hidden='true'
                        />
                        <Input
                            value={q}
                            onChange={(event) => setQ(event.target.value)}
                            onKeyDown={moveFocus}
                            placeholder={t('membership.transfer.search')}
                            aria-label={t('membership.transfer.search')}
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
                            <div className='grid gap-2 py-2'>
                                <FormMessage tone='danger'>{t('membership.transfer.loadFailed')}</FormMessage>
                                <div>
                                    <Button variant='secondary' size='sm' onClick={() => void members.refetch()}>
                                        {tCommon('buttons.tryAgain')}
                                    </Button>
                                </div>
                            </div>
                        ) : members.data.items.length === 0 ? (
                            query ? (
                                <p className='py-4 text-body-sm text-text-tertiary'>
                                    {t('membership.transfer.noMatch', { q: query })}
                                </p>
                            ) : (
                                <EmptyState title={t('membership.transfer.aloneTitle')} className='mx-auto py-6'>
                                    {t('membership.transfer.aloneBody')}
                                </EmptyState>
                            )
                        ) : (
                            <ul ref={list} className='grid'>
                                {members.data.items.map((member) => {
                                    const timedOut = isTimedOut(member, now)
                                    const role = timedOut ? null : highestRoleName(server, member)
                                    return (
                                        <li key={member.userId}>
                                            <button
                                                type='button'
                                                disabled={timedOut}
                                                onKeyDown={moveFocus}
                                                onClick={() =>
                                                    onPick({ userId: member.userId, name: memberName(member) })
                                                }
                                                className={cn(
                                                    'flex h-14 w-full items-center gap-3 rounded-button px-2 text-left hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:pointer-events-none',
                                                    timedOut && 'opacity-50'
                                                )}
                                            >
                                                <MemberIdentity
                                                    member={member}
                                                    note={timedOut ? timedOutNote(member) : null}
                                                    noteStrong={timedOut}
                                                />
                                                {role ? (
                                                    <WithTooltip label={role}>
                                                        <span className='max-w-[160px] truncate text-body-sm text-text-secondary'>
                                                            {role}
                                                        </span>
                                                    </WithTooltip>
                                                ) : null}
                                                {timedOut ? null : (
                                                    <ChevronRight
                                                        className='size-4 shrink-0 text-text-tertiary'
                                                        aria-hidden='true'
                                                    />
                                                )}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button type='button' variant='text' onClick={onClose}>
                        {t('membership.cancel')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
