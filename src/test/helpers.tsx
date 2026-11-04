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
    extra: { headers?: Record<string, string>; data?: unknown } = {}
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
    return { useAuthStore: (selector: (s: T) => unknown) => selector(state) }
}

/** A wrapper giving each render its own QueryClient, with no retries. */
export function queryWrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    return function QueryWrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={client}>{children}</QueryClientProvider>
    }
}
