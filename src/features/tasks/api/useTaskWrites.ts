import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation'
import { getApiErrorType } from '@/lib/api-error'
import type { CreateTaskRequest, Task, UpdateTaskRequest } from '../types'
import { forgetTask, rememberTask } from './rememberTask'
import { assignTask, createTask, deleteTask, unassignTask, updateTask } from './tasks.api'

// Each write answers with the task (D-191), which goes into the boards at
// once; its event, coming after, changes nothing more (rememberTask keeps the
// newer copy). The errors with words of their own in the spec (the form's
// FormMessage, the reopen Toast) are the caller's: no toast of the query
// client for those.

/** "Thêm việc" (S-TASK-03 `create`): one key per task as filled in. */
export function useCreateTask(channelId: string) {
    const client = useQueryClient()
    return useIdempotentMutation({
        mutationFn: (body: CreateTaskRequest, idempotencyKey) => createTask(channelId, body, idempotencyKey),
        onSuccess: (task: Task) => rememberTask(client, task, 'created'),
        meta: { errorToast: false }
    })
}

export interface TaskEdit {
    taskId: string
    changes: UpdateTaskRequest
    /** Who to add and who to take off, beside the fields (S-TASK-03 `edit`). */
    add?: string[]
    remove?: string[]
}

/**
 * "Lưu" (S-TASK-03 `edit`): the fields that changed, then the people added,
 * then each taken off, one after another; the last answer is the task.
 */
export function useEditTask() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async ({ taskId, changes, add = [], remove = [] }: TaskEdit): Promise<Task | null> => {
            let task: Task | null = null
            const keep = (next: Task) => {
                task = next
                rememberTask(client, next, 'updated')
            }
            if (Object.keys(changes).length > 0) keep(await updateTask(taskId, changes))
            if (add.length > 0) keep(await assignTask(taskId, add))
            for (const userId of remove) keep(await unassignTask(taskId, userId))
            return task
        },
        meta: { errorToast: false }
    })
}

/** A status from the box or the row's menu (C-28), and its "Hoàn tác". */
export function useSetTaskStatus() {
    const client = useQueryClient()
    return useMutation({
        mutationFn: ({ taskId, status }: { taskId: string; status: Task['status'] }) => updateTask(taskId, { status }),
        onSuccess: (task) => rememberTask(client, task, 'updated'),
        meta: { errorToast: false }
    })
}

/**
 * "Xóa việc" (S-TASK-02 `delete-confirm`): gone from every board of its
 * channel at once. Gone already (deleted meanwhile, or this same delete sent
 * again after a lost answer): that is what was asked, so no error.
 */
export function useDeleteTask(channelId: string) {
    const client = useQueryClient()
    return useMutation({
        mutationFn: async (taskId: string) => {
            try {
                await deleteTask(taskId)
            } catch (error) {
                if (getApiErrorType(error) !== 'NOT_FOUND_ERROR') throw error
            }
        },
        onSuccess: (_, taskId) => forgetTask(client, channelId, taskId)
    })
}
