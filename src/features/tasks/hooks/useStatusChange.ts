import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import '@/i18n/tasks'
import { getApiErrorType } from '@/lib/api-error'
import { notifyMutationError } from '@/lib/query-client'
import { useSetTaskStatus } from '../api/useTaskWrites'
import { useHeldTasks } from '../held-tasks.store'
import { shortTitle, UNDO_MS } from '../lib/task-toasts'
import type { Task, TaskStatus } from '../types'

/**
 * A status set from the box or the row's menu (05 S-TASK-01 › Tương tác):
 * the box shows it at once and the row stands where it was, its group's
 * count too, while a Toast of 8 seconds says so with "Hoàn tác" (one Toast
 * per task, keyed by its id, C-16); once the Toast goes, for any reason, the
 * row goes to its group. "Hoàn tác" sends the status it had. Refused: the
 * box goes back, with the Toast of 05 › Edge case when the channel is full
 * (no "Hoàn tác"), else the query client's Toast.
 */
export function useStatusChange(): (task: Task, next: TaskStatus) => void {
    const { t } = useTranslation('tasks')
    const setStatus = useSetTaskStatus()
    const hold = useHeldTasks((state) => state.hold)
    const release = useHeldTasks((state) => state.release)

    return useCallback(
        (task: Task, next: TaskStatus) => {
            const held = useHeldTasks.getState().holds.get(task.id)
            const before = held?.status ?? task.status
            if (before === next) return
            hold(task.id, { group: held?.group ?? task.status, status: next, task: held?.task ?? task })
            const id = `task-${task.id}`
            const title = shortTitle(task.title)
            const message =
                next === 'done'
                    ? t('toast.done', { title })
                    : before === 'done'
                      ? t('toast.reopened', { title })
                      : t('toast.moved', { title, status: t(`status.${next}`) })
            const failed = (error: unknown) => {
                toast.dismiss(id)
                release(task.id)
                // The words of 05 › Edge case when full; else the query client's Toast (silent about a place gone).
                if (getApiErrorType(error) === 'MAX_OPEN_TASKS_REACHED') toast.error(t('toast.full'))
                else notifyMutationError(error)
            }
            toast(message, {
                id,
                duration: UNDO_MS,
                action: {
                    label: t('toast.undo'),
                    onClick: () => {
                        release(task.id)
                        void setStatus.mutateAsync({ taskId: task.id, status: before }).catch(failed)
                    }
                },
                onDismiss: () => release(task.id),
                onAutoClose: () => release(task.id)
            })
            // Each call its own promise: two rows toggled at once each hear of their own failure.
            void setStatus.mutateAsync({ taskId: task.id, status: next }).catch(failed)
        },
        [t, setStatus, hold, release]
    )
}
