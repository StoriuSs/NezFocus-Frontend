import '@/i18n/servers'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { getApiErrorMessage, getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { useLeaveServer } from '../../api/useMembership'
import { useMoveAwayFrom } from '../../hooks/useMoveAwayFrom'
import { toastName } from '../../lib/server-name'
import { useMembershipDialogs } from '../../membership-dialogs.store'
import type { Server } from '../../types'

/**
 * "Leave server" (03 S-SRV-04). A member is asked once (`leave-confirm`, the
 * focus on Cancel). The owner cannot leave, and is told so before any request
 * (OWNER_CANNOT_LEAVE is only the backend's safety net): hand it over first
 * (`owner-cannot-leave`), or, alone in it, delete it (SRV-EDGE `owner-alone`).
 *
 * Left: the page moves on (useMoveAwayFrom) and a Toast says so. Refused, a
 * Toast says why and the dialog stays for another try; not found means they
 * were out already, and the list read again says so.
 */
export function LeaveServerDialog({ server, onClose }: { server: Server; onClose: () => void }) {
    const { t } = useTranslation('servers')
    const show = useMembershipDialogs((state) => state.show)
    const leave = useLeaveServer(server.id, useMoveAwayFrom(server.id))
    const next = useRef<HTMLButtonElement>(null)

    // A promise, not mutate's callbacks: those skip a dialog already gone with its server.
    async function confirm() {
        try {
            await leave.mutateAsync()
        } catch (error) {
            const type = getApiErrorType(error)
            if (type === 'NOT_FOUND_ERROR') return onClose()
            toast.error(type === NETWORK_ERROR ? t('membership.leave.offline') : getApiErrorMessage(error))
            return
        }
        onClose()
        toast(t('membership.leave.done', { name: toastName(server.name) }))
    }

    if (server.isOwner) {
        const alone = server.memberCount <= 1
        return (
            <Dialog open onOpenChange={(open) => !open && onClose()}>
                <DialogContent
                    className='sm:max-w-dialog'
                    // On the way out of it (S-SRV-04 `owner-cannot-leave`). Alone in
                    // it, the way out deletes: the focus stays on "Not now" (C-14).
                    onOpenAutoFocus={(event) => {
                        if (alone) return
                        event.preventDefault()
                        next.current?.focus()
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t(alone ? 'membership.alone.title' : 'membership.ownerLeave.title')}</DialogTitle>
                        <DialogDescription>
                            {t(alone ? 'membership.alone.body' : 'membership.ownerLeave.body', { name: server.name })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type='button' variant='text' onClick={onClose}>
                            {t('membership.later')}
                        </Button>
                        {alone ? (
                            <Button
                                type='button'
                                variant='destructive'
                                onClick={() => show({ kind: 'delete', serverId: server.id })}
                            >
                                {t('membership.delete.submit')}
                            </Button>
                        ) : (
                            <Button
                                ref={next}
                                type='button'
                                onClick={() => show({ kind: 'transfer', serverId: server.id, thenLeave: true })}
                            >
                                {t('membership.transfer.submit')}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !leave.isPending && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('membership.leave.title', { name: server.name })}</DialogTitle>
                    <DialogDescription>{t('membership.leave.body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    {/* First, so it has the focus (C-14, a `danger` dialog). */}
                    <Button type='button' variant='text' disabled={leave.isPending} onClick={onClose}>
                        {t('membership.cancel')}
                    </Button>
                    <Button
                        type='button'
                        variant='destructive'
                        disabled={leave.isPending}
                        onClick={() => void confirm()}
                    >
                        {leave.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('membership.leave.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
