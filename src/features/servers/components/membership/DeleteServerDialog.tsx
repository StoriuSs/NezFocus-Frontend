import '@/i18n/servers'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getApiErrorMessage, getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'
import { useDeleteServer } from '../../api/useMembership'
import { useMoveAwayFrom } from '../../hooks/useMoveAwayFrom'
import { refusedRule } from '../../lib/layout-error'
import { toastName } from '../../lib/server-name'
import { sameTyped } from '../../lib/typed-name'
import type { Server } from '../../types'

/**
 * "Delete {server}?" (04 S-SET-07 `delete-type-name`, C-14 `type-name`): how
 * many it goes for (member_count, D-161), and the button off until the name
 * is typed, case and accents left out. Deleted: the page moves on as when
 * leaving, and a Toast says so, with no promise of a restore (Q15).
 */
export function DeleteServerDialog({ server, onClose }: { server: Server; onClose: () => void }) {
    const { t } = useTranslation('servers')
    const remove = useDeleteServer(server.id, useMoveAwayFrom(server.id))
    const [typed, setTyped] = useState('')
    const [failure, setFailure] = useState<{ text: string; offline: boolean } | null>(null)
    const matches = sameTyped(typed, server.name)

    async function submit(event: FormEvent) {
        event.preventDefault()
        if (!matches || remove.isPending) return
        setFailure(null)
        try {
            await remove.mutateAsync(typed)
        } catch (error) {
            const type = getApiErrorType(error)
            const offline = type === NETWORK_ERROR
            // Renamed meanwhile: the hook reads the list again, and the title shows the new name.
            const text =
                refusedRule(error) === 'name_mismatch'
                    ? t('membership.delete.renamed')
                    : offline
                      ? t('membership.delete.offline')
                      : getApiErrorMessage(error)
            setFailure({ text, offline })
            return
        }
        onClose()
        toast(t('membership.delete.done', { name: toastName(server.name) }))
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !remove.isPending && onClose()}>
            {/* Never closed by a click outside (C-14 `type-name`). */}
            <DialogContent className='sm:max-w-dialog' onInteractOutside={(event) => event.preventDefault()}>
                <form onSubmit={(event) => void submit(event)} className='space-y-4' noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('membership.delete.title', { name: server.name })}</DialogTitle>
                        <DialogDescription>
                            {t('membership.delete.body', { count: server.memberCount })}
                        </DialogDescription>
                    </DialogHeader>
                    <div className='grid gap-1'>
                        <Label htmlFor='delete-server-name' className='text-label text-text-secondary'>
                            {t('membership.delete.typeToConfirm', { name: server.name })}
                        </Label>
                        <Input
                            id='delete-server-name'
                            value={typed}
                            onChange={(event) => setTyped(event.target.value)}
                            autoComplete='off'
                            readOnly={remove.isPending}
                        />
                    </div>
                    {failure ? (
                        <FormMessage tone='danger' icon={failure.offline ? 'wifi-off' : undefined}>
                            {failure.text}
                        </FormMessage>
                    ) : null}
                    <DialogFooter>
                        <Button type='button' variant='text' disabled={remove.isPending} onClick={onClose}>
                            {t('membership.cancel')}
                        </Button>
                        <Button type='submit' variant='destructive' disabled={!matches || remove.isPending}>
                            {remove.isPending ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                            {t('membership.delete.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
