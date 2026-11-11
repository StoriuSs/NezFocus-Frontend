import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import type { OwnedServer } from '@/features/auth'
import { useMembershipDialogs } from '../../membership-dialogs.store'
import type { Server } from '../../types'
import { ServerIcon } from '../ServerIcon'

/**
 * "Hand over your servers first" (10-settings › S-ME-03 `delete-blocked-owner`,
 * REQ-AUTH-09, D-76): the account still owns servers with other members in
 * them. Each row opens the handover of that server (04 S-SET-07
 * `transfer-picker`) in this dialog's place; once it is done, "Delete
 * account" checks again. Opened through auth's ServerOwnership port, before
 * the password or after the API refused for it.
 */
export function DeletionBlockedDialog({
    servers,
    known,
    onClose
}: {
    servers: OwnedServer[]
    /** The server list, for each one's picture. */
    known: Server[] | undefined
    onClose: () => void
}) {
    const { t } = useTranslation('servers')
    const show = useMembershipDialogs((state) => state.show)

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('membership.deletionBlocked.title')}</DialogTitle>
                    <DialogDescription>
                        {t('membership.deletionBlocked.body', { count: servers.length })}
                    </DialogDescription>
                </DialogHeader>
                <ul className='grid gap-2'>
                    {servers.map((server) => (
                        <li key={server.id}>
                            <button
                                type='button'
                                onClick={() => show({ kind: 'transfer', serverId: server.id })}
                                className='flex h-12 w-full items-center gap-3 rounded-button bg-surface-2 px-3 text-left hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                            >
                                <ServerIcon
                                    name={server.name}
                                    iconUrl={known?.find((one) => one.id === server.id)?.iconUrl}
                                    className='size-8 shrink-0 rounded-[33%] bg-surface-3 text-micro'
                                />
                                <span className='grid min-w-0 flex-1'>
                                    <span className='truncate text-body-sm font-semibold text-text-primary'>
                                        {server.name}
                                    </span>
                                    <span className='text-label text-text-secondary'>
                                        {t('membership.deletionBlocked.members', { count: server.memberCount })}
                                    </span>
                                </span>
                                <ChevronRight className='size-4 shrink-0 text-text-secondary' aria-hidden='true' />
                            </button>
                        </li>
                    ))}
                </ul>
                <DialogFooter>
                    <Button type='button' variant='text' onClick={onClose}>
                        {t('membership.deletionBlocked.close')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
