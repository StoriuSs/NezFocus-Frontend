import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import type { ApiEnvelope } from '@/lib/api-types'
import type { UsernameAvailability } from '@/features/users/types'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { userKeys } from './keys'

/** Mirrors the backend's username.rules.ts (SRS REQ-AUTH-01): lower case, 2-32 of `a-z 0-9 _ .`. */
export const USERNAME_MAX_LENGTH = 32
export const USERNAME_PATTERN = /^[a-z0-9_.]{2,32}$/

/** Half a second after typing stops (C-22 › username). */
const DEBOUNCE_MS = 500

/**
 * Debounced availability check for a username being typed.
 *
 * Each result is cached under the username it was fetched for, and
 * `isAvailable` is only reported once the debounced value has caught up with
 * the input. A slow response for "ali" can therefore never be shown as the
 * answer for "alice", and there is no window where the previous answer still
 * enables the submit button for a name that has not been checked.
 */
export function useUsernameAvailability(username: string) {
    const debounced = useDebouncedValue(username, DEBOUNCE_MS)
    const isValid = USERNAME_PATTERN.test(username)
    const isSettled = debounced === username

    const query = useQuery({
        queryKey: userKeys.usernameAvailability(debounced),
        queryFn: async ({ signal }) => {
            const response = await api.get<ApiEnvelope<UsernameAvailability>>(
                `/users/username-available/${encodeURIComponent(debounced)}`,
                { signal }
            )
            return response.data.data.available
        },
        enabled: isValid && isSettled,
        staleTime: 30_000,
        retry: false
    })

    return {
        isValid,
        /** Still being typed: the half-second pause has not come yet. */
        isTyping: !isSettled,
        isChecking: isValid && (!isSettled || query.isFetching),
        /** `true`/`false` once checked for exactly the current input; otherwise `null`. */
        isAvailable: isValid && isSettled && query.isSuccess && !query.isFetching ? query.data : null,
        /**
         * The check itself failed (offline, 429, 5xx). Without surfacing it the
         * submit button just stayed disabled with no explanation.
         */
        checkFailed: isValid && isSettled && query.isError && !query.isFetching,
        retryCheck: () => void query.refetch()
    }
}
