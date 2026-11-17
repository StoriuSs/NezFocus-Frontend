import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/tasks'

/**
 * A task's detail opened on this page (`?task=`, S-TASK-02; no step of its
 * own in the history, as closing it takes none), and a link copied ("Sao
 * chép link việc", C-28 menu; the place says which, TaskBoardPlace.linkTo):
 * Toast "Đã sao chép link việc".
 */
export function useTaskLink() {
    const { t } = useTranslation('tasks')
    const [, setParams] = useSearchParams()
    const open = useCallback(
        (taskId: string) =>
            setParams(
                (before) => {
                    const next = new URLSearchParams(before)
                    next.set('task', taskId)
                    return next
                },
                { replace: true }
            ),
        [setParams]
    )
    const copy = useCallback(
        (link: string) =>
            void navigator.clipboard.writeText(link).then(
                () => toast(t('toast.linkCopied')),
                () => toast.error(t('toast.copyFailed'))
            ),
        [t]
    )
    return { open, copy }
}
