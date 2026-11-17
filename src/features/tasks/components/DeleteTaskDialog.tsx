import { useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/tasks'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { useDeleteTask } from '../api/useTaskWrites'
import { shortTitle } from '../lib/task-toasts'
import type { Task } from '../types'

/**
 * "Xóa "…"?" (S-TASK-02 `delete-confirm`, C-14 `simple` 440): focus on
 * "Hủy"; deleted, it closes with "Đã xóa "…"". A failure is the query
 * client's Toast; the dialog stays.
 */
export function DeleteTaskDialog({
    task,
    onClose,
    onDeleted,
    onDeleting
}: {
    task: Task
    onClose: () => void
    /** Deleted: where the focus goes is the board's (the next row), not the gone row's ⋯. */
    onDeleted: () => void
    /** About to send it: a detail open on it closes without "Việc này vừa bị xóa". */
    onDeleting?: () => void
}) {
    const { t } = useTranslation('tasks')
    const remove = useDeleteTask(task.channelId)
    const [deleting, setDeleting] = useState(false)
    const cancel = useRef<HTMLButtonElement>(null)
    const deleted = useRef(false)

    const confirm = async () => {
        setDeleting(true)
        onDeleting?.()
        try {
            await remove.mutateAsync(task.id)
            deleted.current = true
            onClose()
            toast(t('toast.deleted', { title: shortTitle(task.title) }))
        } catch {
            setDeleting(false)
        }
    }

    return (
        <Dialog open onOpenChange={(open) => !open && !deleting && onClose()}>
            <DialogContent
                className='sm:max-w-dialog'
                onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    cancel.current?.focus()
                }}
                onCloseAutoFocus={(event) => {
                    if (!deleted.current) return
                    event.preventDefault()
                    onDeleted()
                }}
            >
                <DialogHeader>
                    <DialogTitle className='break-words'>{t('delete.title', { title: task.title })}</DialogTitle>
                    <DialogDescription>{t('delete.body')}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button ref={cancel} type='button' variant='text' disabled={deleting} onClick={onClose}>
                        {t('delete.cancel')}
                    </Button>
                    <Button type='button' variant='destructive' disabled={deleting} onClick={() => void confirm()}>
                        {deleting ? <Loader2 className='animate-spin' aria-hidden='true' /> : null}
                        {t('delete.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
