import axios from 'axios'
import { getApiErrorType, NETWORK_ERROR } from '@/lib/api-error'

/**
 * What a refused task write means for the form (S-TASK-03 › FormMessage):
 * someone picked no longer views the channel (`data.user_ids`), the channel
 * is full (500 not done), the board was just turned off (`FORBIDDEN_ERROR`
 * with `data.reason = task_board_disabled`), the right is gone, the due
 * date passed meanwhile (under the field), no network; anything else is the
 * API's own words.
 */
export type TaskFailure =
    | { kind: 'assignees'; userIds: string[] }
    | { kind: 'full' }
    | { kind: 'board-off' }
    | { kind: 'forbidden' }
    | { kind: 'past-due' }
    | { kind: 'offline' }
    | { kind: 'gone' }
    | { kind: 'other' }

/** The error's `data`: where the API puts details (camelCased by src/lib/api.ts). */
function detailsOf(error: unknown): Record<string, unknown> {
    if (!axios.isAxiosError(error)) return {}
    const data = (error.response?.data as { data?: unknown } | undefined)?.data
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
}

export function taskFailure(error: unknown): TaskFailure {
    const type = getApiErrorType(error)
    const details = detailsOf(error)
    switch (type) {
        case NETWORK_ERROR:
            return { kind: 'offline' }
        case 'INVALID_TASK_ASSIGNEE': {
            const ids = Array.isArray(details.userIds) ? details.userIds : []
            return { kind: 'assignees', userIds: ids.filter((id): id is string => typeof id === 'string') }
        }
        case 'MAX_OPEN_TASKS_REACHED':
            return { kind: 'full' }
        case 'INVALID_TASK_DUE_DATE':
            return { kind: 'past-due' }
        case 'NOT_FOUND_ERROR':
            return { kind: 'gone' }
        case 'FORBIDDEN_ERROR':
            return details.reason === 'task_board_disabled' ? { kind: 'board-off' } : { kind: 'forbidden' }
        default:
            return { kind: 'other' }
    }
}
