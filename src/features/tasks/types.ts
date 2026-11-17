import type { Presence } from '@/components/ui/presence-dot'
import type { ApiModel } from '@/lib/api-types'

/** A task as everyone who views its channel sees it (REQ-TASK-01, D-191: what every write answers with). */
export type Task = ApiModel<'TaskResponseDto'>
export type TaskStatus = Task['status']
export type TaskPerson = ApiModel<'TaskPersonResponseDto'>
export type TaskAssignee = ApiModel<'TaskAssigneeResponseDto'>
/** A Task Board page: the tasks not done and how many are done (S-TASK-01), or a page of the done ones. */
export type TaskList = ApiModel<'TaskListResponseDto'>
export type CreateTaskRequest = ApiModel<'CreateTaskRequestDto'>
export type UpdateTaskRequest = ApiModel<'UpdateTaskRequestDto'>

/** What a query of the servers feature is, as `useQuery` takes it: its key and cache stay theirs. */
export interface SourceQuery<T> {
    queryKey: readonly unknown[]
    queryFn: () => Promise<T>
    staleTime?: number
}

/** Someone who may be given a task: a member who views its channel (C-25 `multi`, D-192). */
export interface TaskCandidate {
    id: string
    username: string | null
    displayName: string | null
    avatarUrl: string | null
    presence?: Presence
}

/**
 * What the Task Board needs from the server it is in, handed by the channel
 * page (the servers feature's, as the chat's MentionSource is): the
 * channel, what one may do there, and whom a task may be given to.
 */
export interface TaskBoardPlace {
    channelId: string
    channelName: string
    serverName: string
    /** CREATE_TASKS: "Thêm việc" (REQ-TASK-02). */
    create: boolean
    /** MANAGE_TASKS: change, edit and delete any task of the channel. */
    manage: boolean
    /** MANAGE_CHANNELS: `board-off` offers to open the channel's settings. */
    manageChannel: boolean
    /** Timed out (D-188): viewing only, whatever the roles say. */
    timedOut: boolean
    /** The members who view the channel whose name or username holds the words (D-192). */
    candidates: (query: string) => SourceQuery<TaskCandidate[]>
    /** Opens the channel's settings (S-SET-05), from `board-off`. */
    openSettings: () => void
}
