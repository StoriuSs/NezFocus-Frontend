import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import type { MentionSource } from '../types'

/** How long typing settles before the people are asked for again. */
const SETTLE = 150

/**
 * The people and roles to suggest after @ (C-12 › MentionSuggest), read
 * through the page's MentionSource: its query options, so the key and the
 * cache stay the servers feature's. The people are asked for once typing
 * settles, the last ones kept meanwhile; `loading` only while none were read
 * yet. Asks for nothing while `asking` is false (no @ being typed).
 */
export function useMentionSuggestions(source: MentionSource, query: string, asking: boolean) {
    const settled = useDebouncedValue(query, SETTLE)
    const people = useQuery({ ...source.members(settled), enabled: asking, placeholderData: keepPreviousData })
    const roles = useQuery({ ...source.roles, enabled: asking })
    return { people: people.data, roles: roles.data, loading: asking && people.isPending }
}
