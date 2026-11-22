import '@/i18n/servers'
import { useTranslation } from 'react-i18next'
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

/**
 * Turning a study room off while it has a session (04 S-SET-06
 * `study-off-confirm`, C-14 `simple`, D-88): the session ends for everyone
 * (`study_disabled`), so it asks first, over Room settings. The focus on
 * Cancel; nothing closes it while the save is sent.
 */
export function StudyOffDialog({
    people,
    saving,
    onCancel,
    onConfirm
}: {
    people: number
    saving: boolean
    onCancel: () => void
    onConfirm: () => void
}) {
    const { t } = useTranslation('servers')
    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onCancel()}>
            <DialogContent className='sm:max-w-dialog'>
                <DialogHeader>
                    <DialogTitle>{t('channel.studyRoom.off.title', { count: people })}</DialogTitle>
                    <DialogDescription>{t('channel.studyRoom.off.body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type='button' variant='text' disabled={saving} onClick={onCancel}>
                        {t('actions.cancel')}
                    </Button>
                    <Button
                        type='button'
                        variant='destructive'
                        aria-busy={saving || undefined}
                        onClick={() => {
                            if (!saving) onConfirm()
                        }}
                    >
                        {saving ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('channel.studyRoom.off.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
