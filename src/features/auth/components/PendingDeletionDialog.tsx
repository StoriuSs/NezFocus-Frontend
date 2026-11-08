import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import '@/i18n/deletion'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { FormMessage } from '@/components/form/FormMessage'
import { useAuthStore } from '@/features/auth/auth.store'
import { requestFailure, useMessageText, type RequestFailure } from '@/features/auth/lib/form-problem'
import { deletionDate, deletionDaysLeft } from '@/features/auth/lib/deletion-date'

/**
 * Signed in to an account waiting to be deleted (S-AUTH-03 `pending-deletion`,
 * REQ-AUTH-09, D-141): over the sign-in page, whichever way the person came
 * in. "Restore account" takes the request back, and the page moves on as
 * every sign-in does, with a toast. "Not now", Esc and the scrim all do the
 * same: the session just opened ends and the page stays, its form as typed;
 * the account still waits.
 */
export default function PendingDeletionDialog() {
    const { t } = useTranslation('deletion')
    const text = useMessageText()
    const deletesAt = useAuthStore((state) => state.deletesAt)
    const restoreAccount = useAuthStore((state) => state.restoreAccount)
    const setRestoreAside = useAuthStore((state) => state.setRestoreAside)
    const [restoring, setRestoring] = useState(false)
    const [problem, setProblem] = useState<RequestFailure | null>(null)
    // When it opened: the count of days does not change under the person's eyes.
    const [now] = useState(() => new Date())

    if (!deletesAt) return null
    const when = new Date(deletesAt)

    async function restore() {
        setRestoring(true)
        setProblem(null)
        try {
            await restoreAccount()
            toast.success(t('restore.done'))
        } catch (error) {
            // A deleted account signs out by itself (src/lib/api.ts); the rest is said here.
            setProblem(requestFailure(error))
            setRestoring(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !restoring && setRestoreAside()}>
            <DialogContent className='sm:max-w-dialog' hideCloseButton>
                <DialogHeader>
                    <DialogTitle>{t('restore.title')}</DialogTitle>
                    <DialogDescription>
                        {t('restore.description', { date: deletionDate(when), count: deletionDaysLeft(when, now) })}
                    </DialogDescription>
                </DialogHeader>
                {problem ? (
                    <FormMessage tone='danger' icon={problem.offline ? 'wifi-off' : undefined}>
                        {text(problem.message)}
                    </FormMessage>
                ) : null}
                <DialogFooter className='mt-2'>
                    <Button variant='text' disabled={restoring} onClick={setRestoreAside}>
                        {t('restore.later')}
                    </Button>
                    <Button disabled={restoring} onClick={() => void restore()}>
                        {restoring ? <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' /> : null}
                        {t('restore.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
