import axios from 'axios'

/**
 * The channel list rule a refused change broke (VALIDATION_ERROR with
 * `data.rule`, backend domain/errors/channel-layout.errors.ts › LayoutRule), and for a
 * category that cannot be deleted, the channels whose names clash.
 */
export type LayoutRule = 'name_invalid' | 'name_taken' | 'limit' | 'view_roles' | 'not_for_type' | 'stale_move'

export function layoutRule(error: unknown): { rule: LayoutRule; names: string[] } | null {
    if (!axios.isAxiosError(error)) return null
    const data = (error.response?.data as { data?: { rule?: unknown; names?: unknown } } | undefined)?.data
    if (typeof data?.rule !== 'string') return null
    const names = Array.isArray(data.names) ? data.names.filter((name): name is string => typeof name === 'string') : []
    return { rule: data.rule as LayoutRule, names }
}

/** The `data.rule` of any refused change (VALIDATION_ERROR), as sent: a kick, ban or timeout too. */
export const refusedRule = (error: unknown): string | null => layoutRule(error)?.rule ?? null
