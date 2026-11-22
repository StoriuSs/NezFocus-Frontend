import axios from 'axios'
import { getApiErrorType } from '@/lib/api-error'

/**
 * Why a session command was refused (SRS 5.1): the error's type, and for a
 * VALIDATION_ERROR its `rule` (`not_paused`: someone resumed it meanwhile;
 * `study_cycle`: a length out of range, its `problem` naming the field).
 */
export function sessionRefusal(error: unknown): { type?: string; rule?: string; problem?: string } {
    const type = getApiErrorType(error)
    if (!axios.isAxiosError(error)) return { type }
    const data = (error.response?.data as { data?: { rule?: unknown; problem?: unknown } } | undefined)?.data
    return {
        type,
        rule: typeof data?.rule === 'string' ? data.rule : undefined,
        problem: typeof data?.problem === 'string' ? data.problem : undefined
    }
}
