import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import '@/i18n/messaging'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import type { Message } from '../types'

/**
 * "Delete message?" (S-CHAT-03 `delete-confirm`, C-14 `simple`): whose
 * message, for everyone in the channel, the message quoted on `surface-2`,
 * then Cancel / Delete (`danger`). Closes once the message is gone; a
 * failure says why in a Toast (useDeleteMessage). Closed, `onClosed` says
 * where focus goes: the item of the menu that opened it is gone by then.
 */
export function DeleteMessageDialog({
    message,
    own,
    time,
    deleting,
    onConfirm,
    onCancel,
    onClosed
}: {
    message: Message
    own: boolean
    /** When it was sent, as its head shows it ("21:45"). */
    time: string
    deleting: boolean
    onConfirm: () => void
    onCancel: () => void
    onClosed: () => void
}) {
    const { t } = useTranslation('messaging')
    const name = message.author?.displayName ?? message.author?.username ?? t('message.deletedAccount')

    return (
        <Dialog open onOpenChange={(open) => !open && !deleting && onCancel()}>
            <DialogContent
                className='sm:max-w-dialog'
                onCloseAutoFocus={(event) => {
                    event.preventDefault()
                    onClosed()
                }}
            >
                <DialogHeader>
                    <DialogTitle>{t('delete.title')}</DialogTitle>
                    <DialogDescription>
                        {own ? t('delete.bodyOwn') : t('delete.bodyOthers', { name })}
                    </DialogDescription>
                </DialogHeader>
                <blockquote className='max-h-40 overflow-y-auto rounded-input bg-surface-2 px-3 py-2'>
                    <p className='flex items-baseline gap-2'>
                        <span className='text-label font-semibold text-text-primary'>{name}</span>
                        <span className='text-label text-text-tertiary'>{time}</span>
                    </p>
                    <p className='whitespace-pre-wrap break-words text-body-sm text-text-secondary'>
                        {message.content}
                    </p>
                </blockquote>
                <DialogFooter>
                    <Button type='button' variant='text' disabled={deleting} onClick={onCancel}>
                        {t('delete.cancel')}
                    </Button>
                    <Button type='button' variant='destructive' disabled={deleting} onClick={onConfirm}>
                        {deleting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('delete.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
