import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

/** What axios rejects with for an HTTP error answer carrying `body`. */
export function httpError(
    status: number,
    body: unknown,
    { headers = {}, config }: { headers?: Record<string, string>; config?: InternalAxiosRequestConfig } = {}
): AxiosError {
    return new AxiosError('failed', 'ERR_BAD_REQUEST', config, null, {
        status,
        statusText: '',
        headers,
        config,
        data: body
    } as AxiosResponse)
}

/** An error answer in the API's envelope: `{ meta: { type }, data }`. */
export function apiError(
    status: number,
    type: string,
    extra: { headers?: Record<string, string>; data?: unknown; config?: InternalAxiosRequestConfig } = {}
): AxiosError {
    return httpError(status, { meta: { code: String(status), type, message: '' }, data: extra.data ?? {} }, extra)
}

/**
 * The auth store module, standing in for the real one with a plain object the
 * test changes:
 *
 *     vi.mock('@/features/auth/auth.store', () => mockAuthStore(authState))
 */
export function mockAuthStore<T>(state: T) {
    // `useAuthStore.getState()` too, for code that reads the store outside render.
    const useAuthStore = Object.assign((selector: (s: T) => unknown) => selector(state), { getState: () => state })
    return { useAuthStore }
}

/**
 * A wrapper giving each render its own QueryClient, with no retries. `staleTime`:
 * the app's own, for a test about what is (not) read again.
 */
export function queryWrapper({ staleTime = 0 }: { staleTime?: number } = {}) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime }, mutations: { retry: false } }
    })
    return function QueryWrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
}
