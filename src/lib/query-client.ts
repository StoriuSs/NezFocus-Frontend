import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorInfo, getApiErrorMessage, type ApiMessageKey } from '@/lib/api-error'
import { reportError } from '@/lib/error-tracking'

declare module '@tanstack/react-query' {
    interface Register {
        mutationMeta: {
            /** false when the screen shows the error itself. Default: a toast. */
            errorToast?: boolean
            /** Message for error types without a catalogue entry. Default: api:GENERIC_ERROR. */
            errorFallbackKey?: ApiMessageKey
        }
    }
}

const MAX_QUERY_RETRIES = 1

/**
 * Retry only failures a second attempt can fix: no response at all (network
 * blip), 408, 429 and 5xx. Any other 4xx means the request itself is wrong —
 * 401/403/404/422 fail identically again, and retrying only delays the error.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
    if (failureCount >= MAX_QUERY_RETRIES) return false

    const { status } = getApiErrorInfo(error)
    if (status === undefined) return true
    return status === 408 || status === 429 || status >= 500
}

/**
 * Every failed mutation shows one translated toast, from here. Each mutation
 * hook used to repeat `onError: toast.error(getApiErrorMessage(error))`, and a
 * new hook that forgot it failed silently. Hooks keep their own onError for
 * side effects only; `meta: { errorToast: false }` opts out.
 */
export function notifyMutationError(error: unknown, meta?: { errorToast?: boolean; errorFallbackKey?: ApiMessageKey }) {
    if (meta?.errorToast === false) return
    toast.error(getApiErrorMessage(error, meta?.errorFallbackKey))
}

/**
 * React Query catches whatever a query or mutation function throws, so no
 * error boundary sees it. A failed request is not a frontend bug (the backend
 * reports its own failures); anything else thrown there is, and goes to
 * error tracking.
 */
export function reportUnexpectedError(error: unknown, kind: 'query' | 'mutation', key: readonly unknown[] | undefined) {
    const name = typeof key?.[0] === 'string' ? key[0] : 'unnamed'
    reportError(error, { react_query: kind, react_query_key: name })
}

export const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error, query) => reportUnexpectedError(error, 'query', query.queryKey)
    }),
    mutationCache: new MutationCache({
        onError: (error, _variables, _context, mutation) => {
            reportUnexpectedError(error, 'mutation', mutation.options.mutationKey)
            notifyMutationError(error, mutation.meta)
        }
    }),
    defaultOptions: {
        queries: {
            retry: shouldRetryQuery,
            refetchOnWindowFocus: false,
            staleTime: 1000 * 60 * 5 // 5 minutes
        }
    }
})
