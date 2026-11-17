import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { CreateTaskRequest, MyTaskList, Task, TaskHistory, TaskList, UpdateTaskRequest } from '../types'

/** GET /channels/{id}/tasks (S-TASK-01): the tasks not done and how many are done; `q` searches titles (D-97). */
export async function fetchOpenTasks(channelId: string, q: string): Promise<TaskList> {
    const response = await api.get<ApiEnvelope<TaskList>>(`/channels/${channelId}/tasks`, {
        params: q ? { q } : {}
    })
    return response.data.data
}

/** `status=done`: 50 a page, latest done first, after the task `before` (D-97). */
export async function fetchDoneTasks(channelId: string, q: string, before: string | null): Promise<TaskList> {
    const response = await api.get<ApiEnvelope<TaskList>>(`/channels/${channelId}/tasks`, {
        params: { status: 'done', ...(q ? { q } : {}), ...(before ? { before } : {}) }
    })
    return response.data.data
}

/**
 * GET /me/tasks (S-TASK-04, D-186): one's tasks not done, each in its group
 * by due date, with the counts; `server` keeps one server's, `q` searches titles.
 */
export async function fetchMyTasks(server: string | null, q: string): Promise<MyTaskList> {
    const response = await api.get<ApiEnvelope<MyTaskList>>('/me/tasks', {
        params: { ...(server ? { server } : {}), ...(q ? { q } : {}) }
    })
    return response.data.data
}

/** `status=done`: one's done tasks, 50 a page, latest done first, after the task `before` (D-97). */
export async function fetchMyDoneTasks(server: string | null, q: string, before: string | null): Promise<MyTaskList> {
    const response = await api.get<ApiEnvelope<MyTaskList>>('/me/tasks', {
        params: { status: 'done', ...(server ? { server } : {}), ...(q ? { q } : {}), ...(before ? { before } : {}) }
    })
    return response.data.data
}

/** GET /tasks/{id} (S-TASK-02): the task, to one who views its channel; else NOT_FOUND. */
export async function fetchTask(taskId: string): Promise<Task> {
    const response = await api.get<ApiEnvelope<Task>>(`/tasks/${taskId}`)
    return response.data.data
}

/** GET /tasks/{id}/history: the newest 200 lines and how many there are (SRS 5.1). */
export async function fetchTaskHistory(taskId: string): Promise<TaskHistory> {
    const response = await api.get<ApiEnvelope<TaskHistory>>(`/tasks/${taskId}/history`)
    return response.data.data
}

/** POST, `@Idempotent`: one key per task as filled in. */
export async function createTask(channelId: string, body: CreateTaskRequest, idempotencyKey: string): Promise<Task> {
    const response = await api.post<ApiEnvelope<Task>>(`/channels/${channelId}/tasks`, body, {
        headers: { 'Idempotency-Key': idempotencyKey }
    })
    return response.data.data
}

/** PATCH: only what changes; each field needs its own right (REQ-TASK-02). */
export async function updateTask(taskId: string, changes: UpdateTaskRequest): Promise<Task> {
    const response = await api.patch<ApiEnvelope<Task>>(`/tasks/${taskId}`, changes)
    return response.data.data
}

export async function deleteTask(taskId: string): Promise<void> {
    await api.delete(`/tasks/${taskId}`)
}

/** POST …/assignees: these people too (they must view the channel, INVALID_TASK_ASSIGNEE). */
export async function assignTask(taskId: string, userIds: string[]): Promise<Task> {
    const response = await api.post<ApiEnvelope<Task>>(`/tasks/${taskId}/assignees`, { userIds })
    return response.data.data
}

/** DELETE …/assignees/{user}: one person off the task. */
export async function unassignTask(taskId: string, userId: string): Promise<Task> {
    const response = await api.delete<ApiEnvelope<Task>>(`/tasks/${taskId}/assignees/${userId}`)
    return response.data.data
}
