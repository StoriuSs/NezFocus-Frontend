import '@/i18n/servers'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { IconButton } from '@/components/ui/icon-button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { getApiErrorType } from '@/lib/api-error'
import { useRevokeInvite, useServerInvites } from '../../api/useInvites'
import { inviteLink, timeLeft } from '../../lib/invites'
import type { InviteListItem, Server } from '../../types'

const ROW = 'flex items-center gap-3'

/** Still opens at `now`: within its time (uses are filtered by the API, and leave with the next load). */
const inTime = (invite: InviteListItem, now: number) =>
    invite.expiresAt === null || invite.expiresAt === undefined || new Date(invite.expiresAt).getTime() > now

/**
 * Invites (S-SET-04, MANAGE_SERVER): the server's links that still open,
 * newest first, with who made them, uses and time left; copy one, or revoke
 * it after asking. A link running out of time while shown leaves its row by
 * itself (a timer to the next expiry), without a toast.
 */
export function InvitesSettings({ server }: { server: Server }) {
    const { t } = useTranslation('servers')
    const invites = useServerInvites(server.id)
    const [now, setNow] = useState(() => Date.now())
    const [revoking, setRevoking] = useState<InviteListItem | null>(null)

    const shown = (invites.data ?? []).filter((invite) => inTime(invite, now))
    const nextExpiry = Math.min(
        ...shown.flatMap((invite) => (invite.expiresAt ? [new Date(invite.expiresAt).getTime()] : []))
    )
    useEffect(() => {
        if (!Number.isFinite(nextExpiry)) return
        // Capped: a browser runs a timer of more than ~24.8 days at once.
        const timer = setTimeout(() => setNow(Date.now()), Math.min(nextExpiry - Date.now() + 50, 2 ** 31 - 1))
        return () => clearTimeout(timer)
    }, [nextExpiry])

    return (
        <div className='flex w-full max-w-settings flex-1 flex-col gap-4 p-6 lg:p-8'>
            <p className='text-body-sm text-text-secondary'>{t('invitesPage.description')}</p>
            {invites.isPending ? (
                <div className='grid gap-2' aria-busy='true'>
                    {[0, 1, 2].map((row) => (
                        <Skeleton key={row} className='h-12 w-full' />
                    ))}
                </div>
            ) : invites.isError ? (
                <EmptyState
                    className='mx-auto mt-6'
                    title={t('invitesPage.loadFailed')}
                    actions={
                        <Button variant='secondary' onClick={() => void invites.refetch()}>
                            {t('invitesPage.retry')}
                        </Button>
                    }
                >
                    {t('join.loadFailedBody')}
                </EmptyState>
            ) : shown.length === 0 ? (
                <EmptyState className='mx-auto mt-6' title={t('invitesPage.emptyTitle')}>
                    {t('invitesPage.emptyBody')}
                </EmptyState>
            ) : (
                <div role='table' aria-label={t('invitesPage.description')} className='grid grid-cols-1'>
                    <div role='row' className={`${ROW} pb-2 text-label uppercase text-text-tertiary`}>
                        <span role='columnheader' className='w-28 shrink-0'>
                            {t('invitesPage.code')}
                        </span>
                        <span role='columnheader' className='min-w-0 flex-1'>
                            {t('invitesPage.creator')}
                        </span>
                        <span role='columnheader' className='w-24 shrink-0'>
                            {t('invitesPage.uses')}
                        </span>
                        <span role='columnheader' className='w-28 shrink-0'>
                            {t('invitesPage.expires')}
                        </span>
                        <span role='columnheader' className='w-28 shrink-0'>
                            <span className='sr-only'>{t('invitesPage.revoke')}</span>
                        </span>
                    </div>
                    {shown.map((invite) => (
                        <InviteRow key={invite.code} invite={invite} now={now} onRevoke={() => setRevoking(invite)} />
                    ))}
                </div>
            )}
            {revoking ? (
                <RevokeDialog serverId={server.id} invite={revoking} onClose={() => setRevoking(null)} />
            ) : null}
        </div>
    )
}

function InviteRow({ invite, now, onRevoke }: { invite: InviteListItem; now: number; onRevoke: () => void }) {
    const { t } = useTranslation('servers')
    const [copied, setCopied] = useState(false)
    const [hovered, setHovered] = useState(false)
    useEffect(() => {
        if (!copied) return
        const timer = setTimeout(() => setCopied(false), 2000)
        return () => clearTimeout(timer)
    }, [copied])

    const left = invite.expiresAt ? timeLeft(invite.expiresAt, new Date(now)) : null
    const { creator } = invite

    return (
        <div role='row' className={`${ROW} min-h-12 border-t border-border py-2`}>
            <span role='cell' className='w-28 shrink-0 font-mono text-body-sm text-text-primary'>
                {invite.code}
            </span>
            <span role='cell' className='grid min-w-0 flex-1'>
                {creator.state === 'member' ? (
                    <>
                        <span className='truncate text-body-sm text-text-primary'>
                            {creator.displayName ?? creator.username}
                        </span>
                        {creator.username ? (
                            <span className='truncate text-label text-text-tertiary'>{creator.username}</span>
                        ) : null}
                    </>
                ) : (
                    <span className='text-body-sm text-text-tertiary'>{t(`invitesPage.${creator.state}`)}</span>
                )}
            </span>
            <span role='cell' className='w-24 shrink-0 text-body-sm tabular-nums text-text-primary'>
                {invite.uses} / {invite.maxUses ?? '∞'}
            </span>
            <span role='cell' className='w-28 shrink-0 text-body-sm text-text-secondary'>
                {left
                    ? t('invitesPage.expiresIn', { time: t(`invite.time.${left.unit}`, { count: left.count }) })
                    : t('invitesPage.never')}
            </span>
            <span role='cell' className='flex w-28 shrink-0 items-center justify-end gap-1'>
                {/* A click closes a tooltip: "Copied" holds it open for its 2 seconds. */}
                <Tooltip open={hovered || copied} onOpenChange={setHovered}>
                    <TooltipTrigger asChild>
                        <IconButton
                            label={t('invitesPage.copy')}
                            onClick={() =>
                                void navigator.clipboard.writeText(inviteLink(invite.code)).then(() => setCopied(true))
                            }
                        >
                            <Copy aria-hidden='true' />
                        </IconButton>
                    </TooltipTrigger>
                    <TooltipContent side='top'>
                        {copied ? t('invitesPage.copied') : t('invitesPage.copy')}
                    </TooltipContent>
                </Tooltip>
                <Button type='button' variant='text' size='sm' className='text-danger' onClick={onRevoke}>
                    {t('invitesPage.revoke')}
                </Button>
            </span>
        </div>
    )
}

/** "Revoke invite k7Qm2xPa?" (`simple` 440): its row leaves on success, or if it had expired meanwhile. */
function RevokeDialog({
    serverId,
    invite,
    onClose
}: {
    serverId: string
    invite: InviteListItem
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const revoke = useRevokeInvite(serverId)
    const [failed, setFailed] = useState(false)

    function confirm() {
        setFailed(false)
        revoke.mutate(invite.code, {
            onSuccess: () => {
                toast(t('invitesPage.revoked'))
                onClose()
            },
            onError: (error) => {
                if (getApiErrorType(error) !== 'INVITE_INVALID') return setFailed(true)
                toast(t('invitesPage.gone'))
                onClose()
            }
        })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !revoke.isPending && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('invitesPage.confirmTitle', { code: invite.code })}</DialogTitle>
                    <DialogDescription>{t('invitesPage.confirmBody')}</DialogDescription>
                </DialogHeader>
                {failed ? <FormMessage tone='danger'>{t('invitesPage.failed')}</FormMessage> : null}
                <DialogFooter>
                    <Button type='button' variant='text' disabled={revoke.isPending} onClick={onClose}>
                        {t('invitesPage.cancel')}
                    </Button>
                    <Button type='button' variant='destructive' disabled={revoke.isPending} onClick={confirm}>
                        {revoke.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('invitesPage.revoke')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
